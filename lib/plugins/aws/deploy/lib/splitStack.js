'use strict';

const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const traverse = require('traverse');
const markovCluster = require('../../utils/markovCluster');

module.exports = {
  splitStack() {
    if (!this.serverless.service.provider.useStackSplitting) return BbPromise.resolve();

    return BbPromise.bind(this)
      .then(this.createDepGraph)
      .then(this.clusterDepGraph)
      .then(this.generateStacks)
      .then(this.uploadStackFiles)
      .then(this.updateCompiledCloudFormationTemplate)
      .then(this.writeStacksToDisk);
  },

  createDepGraph() {
    const items = this.serverless.service.provider.compiledCloudFormationTemplate;

    const resources = items.Resources;
    const resourcesLogicalIds = Object.keys(resources);
    const outputs = items.Outputs;
    const outputsLogicalIds = Object.keys(outputs);
    const allLogicalIds = _.union(resourcesLogicalIds, outputsLogicalIds);

    const graph = {};

    traverse(items).forEach(function (prop) {
      // add all the resources and outputs to the graph
      // note: this.path looks something like this --> ['Resources', 'ResourceLogicalId', ...]
      const type = this.path[0] === 'Resources' ? 'resource' : 'output';
      const name = this.path[1];
      if ((type === 'resource' || type === 'output') && this.path.length === 2) {
        graph[name] = [];
      }

      // create the dependencies
      // remove the first two items from this.path since they'll be something
      // like ['Resources', 'ResourceLogicalId', ...] to filter out dependencies by key
      const subPath = this.path.slice(2, this.path.length);
      if (subPath.length && _.isString(prop)) {
        if (allLogicalIds.includes(prop)) {
          const dependantName = name;
          const dependencyName = prop;

          // ensure that only unique values are "pushed"
          graph[dependantName] = _.union(graph[dependantName], [dependencyName]);
        }
      }
    });

    this.serverless.service.provider.cloudFormationDependencyGraph = graph;

    return BbPromise.resolve();
  },

  clusterDepGraph() {
    const graph = this.serverless.service.provider.cloudFormationDependencyGraph;

    const clustered = markovCluster(graph, 2, 2);

    return BbPromise.resolve(clustered);
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
