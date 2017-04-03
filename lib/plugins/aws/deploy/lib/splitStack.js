'use strict';

const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  splitStack() {
    if (!this.serverless.service.provider.useStackSplitting) return BbPromise.resolve();

    return BbPromise.bind(this)
      .then(this.generateStacks)
      .then(this.uploadStackFiles)
      .then(this.updateCompiledCloudFormationTemplate)
      .then(this.writeStacksToDisk);
  },

  generateStacks() {
    const maxNumOfResourcesPerStack = 200;

    const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const templateResources = cfTemplate.Resources;
    const resourceLogicalIds = Object.keys(templateResources);
    const templateOutputs = cfTemplate.Outputs;

    const stackTemplate = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'Stack template',
      Resources: {},
      Outputs: {},
    };

    const stacks = [];

    // TODO update so that no stack splitting is done at all if not enough resources are present?
    if (resourceLogicalIds.length <= maxNumOfResourcesPerStack) {
      stacks.push(cfTemplate);
    } else {
      let currentStack = _.cloneDeep(stackTemplate); // initial nested stack template
      for (let i = 0; i < resourceLogicalIds.length; i++) {
        const resourceLogicalId = resourceLogicalIds[i];

        if ((i + 1) % maxNumOfResourcesPerStack === 0) {
          const stackNumber = (i + 1) / maxNumOfResourcesPerStack;
          currentStack.Description = `Nested Stack ${stackNumber}`;
          stacks.push(currentStack);

          currentStack = _.cloneDeep(stackTemplate);
        } else {
          currentStack.Resources[resourceLogicalId] = templateResources[resourceLogicalId];

          // TODO update so that deep refs and other intrinsic functions are supported
          // TODO furthermore super poor performance (-1)
          _.forEach(templateOutputs, (output, outputLogicalId) => { // eslint-disable-line
            if (!_.isEmpty(output.Value.Ref)) {
              const refVal = output.Value.Ref;
              if (resourceLogicalId === refVal) {
                currentStack.Outputs[outputLogicalId] = output;
              }
            }
          });
        }
      }
    }

    return BbPromise.resolve(stacks);
  },

  uploadStackFiles(stacks) {
    if (this.options.noDeploy) {
      return BbPromise.resolve(stacks);
    }

    this.serverless.cli.log('Uploading separate stack files to S3...');

    const uploadRequests = stacks.map((stack, index) => {
      const body = JSON.stringify(stack);
      const stackNumber = index + 1;
      const fileName = `cloudformation-template-nested-stack-${stackNumber}.json`;

      const params = {
        Bucket: this.bucketName,
        Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
        Body: body,
        ContentType: 'application/json',
      };

      const uploadRequest = this.provider.request(
        'S3',
        'putObject',
        params,
        this.options.stage,
        this.options.region
      );

      return uploadRequest;
    });

    return BbPromise.all(uploadRequests)
      .then(() => BbPromise.resolve(stacks));
  },

  updateCompiledCloudFormationTemplate(stacks) {
    const parentTemplate = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'The parent stack AWS CloudFormation template for this Serverless application',
      Resources: {},
      Outputs: {},
    };

    const stackResourceTemplate = {
      Type: 'AWS::CloudFormation::Stack',
      Properties: {
        TemplateURL: '',
      },
    };

    stacks.forEach((stack, index) => {
      const stackResource = _.cloneDeep(stackResourceTemplate);

      const stackNumber = index + 1;
      const resourceLogicalId = `NestedStack${stackNumber}`;

      const fileName = `cloudformation-template-nested-stack-${stackNumber}.json`;
      const templateURL = `https://s3.amazonaws.com/${
        this.bucketName
        }/${
          this.serverless.service.package.artifactDirectoryName
        }/${
          fileName
        }`;
      stackResource.Properties.TemplateURL = templateURL;

      parentTemplate.Resources[resourceLogicalId] = stackResource;
    });


    this.serverless.service.provider.compiledCloudFormationTemplate = parentTemplate;

    return BbPromise.resolve(stacks);
  },

  writeStacksToDisk(stacks) {
    stacks.forEach((stack, index) => {
      const stackNumber = index + 1;
      const fileName = `cloudformation-template-nested-stack-${stackNumber}.json`;
      const destPath = path.join(
        this.serverless.config.servicePath,
        '.serverless',
        fileName
      );

      this.serverless.utils.writeFileSync(destPath, stack);
    });

    return BbPromise.resolve();
  },
};
