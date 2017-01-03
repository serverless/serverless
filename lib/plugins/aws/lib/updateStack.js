'use strict';

const _ = require('lodash');
const path = require('path');
const BbPromise = require('bluebird');

const NO_UPDATE_MESSAGE = 'No updates are to be performed.';

module.exports = {
  createFallback() {
    this.createLater = false;
    this.serverless.cli.log('Creating Stack...');

    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.options.stage };
    const templateUrl = `https://s3.amazonaws.com/${
      this.bucketName
      }/${
      this.serverless.service.package.artifactDirectoryName
      }/compiled-cloudformation-template.json`;
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
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    return this.provider.request('CloudFormation',
      'createStack',
      params,
      this.options.stage,
      this.options.region)
      .then((cfData) => this.monitorStack('create', cfData));
  },

  update() {
    const templateUrl = `https://s3.amazonaws.com/${
        this.bucketName
      }/${
        this.serverless.service.package.artifactDirectoryName
      }/compiled-cloudformation-template.json`;

    this.serverless.cli.log('Updating Stack...');
    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.options.stage };

    // Merge additional stack tags
    if (typeof this.serverless.service.provider.stackTags === 'object') {
      stackTags = _.extend(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
        'CAPABILITY_NAMED_IAM',
      ],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (this.serverless.service.provider.stackPolicy &&
        this.serverless.service.provider.stackPolicy.length) {
      params.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    return this.provider.request('CloudFormation',
      'updateStack',
      params,
      this.options.stage,
      this.options.region)
      .then((cfData) => this.monitorStack('update', cfData))
      .catch((e) => {
        if (e.message === NO_UPDATE_MESSAGE) {
          return;
        }
        throw e;
      });
  },

  updateStack() {
    // just write the template to disk if a deployment should not be performed
    return BbPromise.bind(this)
      .then(this.writeUpdateTemplateToDisk)
      .then(() => {
        if (this.options.noDeploy) {
          return BbPromise.resolve();
        } else if (this.createLater) {
          return BbPromise.bind(this)
            .then(this.createFallback);
        }
        return BbPromise.bind(this)
          .then(this.update);
      });
  },

  // helper methods
  writeUpdateTemplateToDisk() {
    const updateOrCreate = this.createLater ? 'create' : 'update';
    const cfTemplateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless', `cloudformation-template-${updateOrCreate}-stack.json`);

    this.serverless.utils.writeFileSync(cfTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },
};
