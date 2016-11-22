'use strict';

const _ = require('lodash');
const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  create() {
    // Note: using three dots instead of ellipsis to support non uni-code consoles.
    this.serverless.cli.log('Creating Stack...');
    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.options.stage };

    // Merge additional stack tags
    if (typeof this.serverless.service.provider.stackTags === 'object') {
      stackTags = _.extend(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      OnFailure: 'ROLLBACK',
      Capabilities: [
        'CAPABILITY_IAM',
        'CAPABILITY_NAMED_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(this.serverless.service.provider
        .compiledCloudFormationTemplate),
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    return this.provider.request(
      'CloudFormation',
      'createStack',
      params,
      this.options.stage,
      this.options.region
    ).then((cfData) => this.monitorStack('create', cfData));
  },

  createStack() {
    const stackName = this.provider.naming.getStackName();
    if (/^[^a-zA-Z].+|.*[^a-zA-Z0-9-].*/.test(stackName) || stackName.length > 128) {
      const errorMessage = [
        `The stack service name "${stackName}" is not valid. `,
        'A service name should only contain alphanumeric',
        ' (case sensitive) and hyphens. It should start',
        ' with an alphabetic character and shouldn\'t',
        ' exceed 128 characters.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    return BbPromise.bind(this)
      // always write the template to disk, whether we are deploying or not
      .then(this.writeCreateTemplateToDisk)
      .then(() => {
        if (this.options.noDeploy) {
          return BbPromise.resolve();
        }
        return this.provider.request('CloudFormation',
          'describeStackResources',
          { StackName: stackName },
          this.options.stage,
          this.options.region)
          .then(() => BbPromise.resolve('alreadyCreated'));
      })
      .catch((e) => {
        if (e.message.indexOf('does not exist') > -1) {
          if (this.serverless.service.provider.deploymentBucket) {
            this.createLater = true;
            return BbPromise.resolve();
          }
          return BbPromise.bind(this)
            .then(this.create);
        }

        throw new this.serverless.classes.Error(e);
      });
  },

  // helper methods
  writeCreateTemplateToDisk() {
    if (this.serverless.service.provider.deploymentBucket) {
      return BbPromise.resolve();
    }
    const cfTemplateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless', 'cloudformation-template-create-stack.json');

    this.serverless.utils.writeFileSync(cfTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },
};
