'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const getS3EndpointForRegion = require('../utils/getS3EndpointForRegion');

const NO_UPDATE_MESSAGE = 'No updates are to be performed.';

module.exports = {
  createFallback() {
    this.createLater = false;
    this.serverless.cli.log('Creating Stack...');

    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.provider.getStage() };
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    const templateUrl = `https://${s3Endpoint}/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    // Merge additional stack tags
    if (typeof this.serverless.service.provider.stackTags === 'object') {
      stackTags = _.extend(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      OnFailure: 'ROLLBACK',
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map(key => ({ Key: key, Value: stackTags[key] })),
    };

    if (
      this.serverless.service.provider.compiledCloudFormationTemplate &&
      this.serverless.service.provider.compiledCloudFormationTemplate.Transform
    ) {
      params.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    if (this.serverless.service.provider.cfnRole) {
      params.RoleARN = this.serverless.service.provider.cfnRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      params.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    return this.provider
      .request('CloudFormation', 'createStack', params)
      .then(cfData => this.monitorStack('create', cfData));
  },

  update() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    const templateUrl = `https://${s3Endpoint}/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    this.serverless.cli.log('Updating Stack...');
    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.provider.getStage() };

    // Merge additional stack tags
    if (typeof this.serverless.service.provider.stackTags === 'object') {
      stackTags = _.extend(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map(key => ({ Key: key, Value: stackTags[key] })),
    };

    if (
      this.serverless.service.provider.compiledCloudFormationTemplate &&
      this.serverless.service.provider.compiledCloudFormationTemplate.Transform
    ) {
      params.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    if (this.serverless.service.provider.cfnRole) {
      params.RoleARN = this.serverless.service.provider.cfnRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      params.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (
      this.serverless.service.provider.stackPolicy &&
      !_.isEmpty(this.serverless.service.provider.stackPolicy)
    ) {
      params.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    return this.provider
      .request('CloudFormation', 'updateStack', params)
      .then(cfData => this.monitorStack('update', cfData))
      .catch(e => {
        if (e.message === NO_UPDATE_MESSAGE) {
          return BbPromise.resolve();
        }
        throw e;
      });
  },

  updateStack() {
    return BbPromise.bind(this).then(() => {
      if (this.createLater) {
        return BbPromise.bind(this).then(this.createFallback);
      }
      return BbPromise.bind(this).then(this.update);
    });
  },
};
