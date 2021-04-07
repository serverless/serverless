'use strict';

const BbPromise = require('bluebird');
const getS3EndpointForRegion = require('../utils/getS3EndpointForRegion');

const NO_UPDATE_MESSAGE = 'No updates are to be performed.';

module.exports = {
  async createFallback() {
    this.createLater = false;
    this.serverless.cli.log('Creating Stack...');

    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.provider.getStage() };
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    const templateUrl = `https://${s3Endpoint}/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    // Merge additional stack tags
    if (this.serverless.service.provider.stackTags) {
      const customKeys = Object.keys(this.serverless.service.provider.stackTags);
      const collisions = Object.keys(stackTags).filter((defaultKey) =>
        customKeys.some((key) => defaultKey.toLowerCase() === key.toLowerCase())
      );

      // Delete collisions upfront
      for (const key of collisions) {
        delete stackTags[key];
      }

      stackTags = Object.assign(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      OnFailure: 'DELETE',
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    if (
      this.serverless.service.provider.compiledCloudFormationTemplate &&
      this.serverless.service.provider.compiledCloudFormationTemplate.Transform
    ) {
      params.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      params.RoleARN = customDeploymentRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      params.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    if (this.serverless.service.provider.stackParameters) {
      params.Parameters = this.serverless.service.provider.stackParameters;
    }

    return this.provider
      .request('CloudFormation', 'createStack', params)
      .then((cfData) => this.monitorStack('create', cfData));
  },

  async update() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    const templateUrl = `https://${s3Endpoint}/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    this.serverless.cli.log('Updating Stack...');
    const stackName = this.provider.naming.getStackName();
    let stackTags = { STAGE: this.provider.getStage() };

    // Merge additional stack tags
    if (this.serverless.service.provider.stackTags) {
      const customKeys = Object.keys(this.serverless.service.provider.stackTags);
      const collisions = Object.keys(stackTags).filter((defaultKey) =>
        customKeys.some((key) => defaultKey.toLowerCase() === key.toLowerCase())
      );

      // Delete collisions upfront
      for (const key of collisions) {
        delete stackTags[key];
      }

      stackTags = Object.assign(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    if (
      this.serverless.service.provider.compiledCloudFormationTemplate &&
      this.serverless.service.provider.compiledCloudFormationTemplate.Transform
    ) {
      params.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      params.RoleARN = customDeploymentRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      params.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    if (this.serverless.service.provider.stackParameters) {
      params.Parameters = this.serverless.service.provider.stackParameters;
    }

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (
      this.serverless.service.provider.stackPolicy &&
      Object.keys(this.serverless.service.provider.stackPolicy).length
    ) {
      params.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    if (this.serverless.service.provider.rollbackConfiguration) {
      params.RollbackConfiguration = this.serverless.service.provider.rollbackConfiguration;
    }

    let cfData;
    try {
      cfData = await this.provider.request('CloudFormation', 'updateStack', params);
    } catch (e) {
      if (e.message.includes(NO_UPDATE_MESSAGE)) {
        return;
      }
      throw e;
    }

    await this.monitorStack('update', cfData);
  },

  async updateStack() {
    return BbPromise.bind(this).then(() => {
      if (this.createLater) {
        return BbPromise.bind(this).then(this.createFallback);
      }
      return BbPromise.bind(this).then(this.update);
    });
  },
};
