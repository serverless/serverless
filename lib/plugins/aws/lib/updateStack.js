'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

const NO_UPDATE_MESSAGE = 'No updates are to be performed.';

module.exports = {
  createFallback() {
    this.createLater = false;
    this.serverless.cli.log('Creating Stack...');

    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.provider.getStage() };
    const compiledTemplateFileName = 'compiled-cloudformation-template.json';
    const templateUrl = `https://s3.amazonaws.com/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

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

    if (this.serverless.service.provider.cfnRole) {
      params.RoleARN = this.serverless.service.provider.cfnRole;
    }

    return this.provider.request('CloudFormation',
      'createStack',
      params)
      .then((cfData) => this.monitorStack('create', cfData));
  },

  update() {
    const compiledTemplateFileName = 'compiled-cloudformation-template.json';
    const templateUrl = `https://s3.amazonaws.com/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    this.serverless.cli.log('Updating Stack...');
    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.provider.getStage() };

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

    if (this.serverless.service.provider.cfnRole) {
      params.RoleARN = this.serverless.service.provider.cfnRole;
    }

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (this.serverless.service.provider.stackPolicy &&
        this.serverless.service.provider.stackPolicy.length) {
      params.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    return this.provider.request('CloudFormation',
      'updateStack',
      params)
      .then((cfData) => this.monitorStack('update', cfData))
      .catch((e) => {
        if (e.message === NO_UPDATE_MESSAGE) {
          return;
        }
        throw e;
      });
  },

  updateStack() {
    return BbPromise.bind(this)
      .then(() => {
        if (this.createLater) {
          return BbPromise.bind(this)
            .then(this.createFallback);
        }
        return BbPromise.bind(this)
          .then(this.update);
      });
  },
};
