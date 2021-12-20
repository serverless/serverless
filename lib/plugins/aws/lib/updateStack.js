'use strict';

const BbPromise = require('bluebird');
const getS3EndpointForRegion = require('../utils/getS3EndpointForRegion');
const { log, legacy, progress } = require('@serverless/utils/log');
const isChangeSetWithoutChanges = require('../utils/is-change-set-without-changes');

module.exports = {
  async createFallback() {
    this.createLater = false;
    legacy.log('Creating Stack...');
    progress.get('main').notice('Creating CloudFormation stack', { isMainEvent: true });

    const stackName = this.provider.naming.getStackName();
    const changeSetName = this.provider.naming.getStackChangeSetName();

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

    const createChangeSetParams = {
      StackName: stackName,
      ChangeSetName: changeSetName,
      ChangeSetType: 'CREATE',
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    const executeChangeSetParams = {
      StackName: stackName,
      ChangeSetName: changeSetName,
    };

    if (
      this.serverless.service.provider.compiledCloudFormationTemplate &&
      this.serverless.service.provider.compiledCloudFormationTemplate.Transform
    ) {
      createChangeSetParams.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      createChangeSetParams.RoleARN = customDeploymentRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      createChangeSetParams.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    if (this.serverless.service.provider.stackParameters) {
      createChangeSetParams.Parameters = this.serverless.service.provider.stackParameters;
    }

    if (this.serverless.service.provider.disableRollback) {
      executeChangeSetParams.DisableRollback = this.serverless.service.provider.disableRollback;
    }

    // Create new change set
    this.provider.didCreateService = true;
    log.info('Creating new change set');
    const changeSet = await this.provider.request(
      'CloudFormation',
      'createChangeSet',
      createChangeSetParams
    );

    // Wait for changeset to be created
    log.info('Waiting for new change set to be created');
    const changeSetDescription = await this.waitForChangeSetCreation(changeSetName, stackName);

    // Check if stack has changes
    if (isChangeSetWithoutChanges(changeSetDescription)) {
      // Cleanup changeset when it does not include any changes
      log.info('Created change set does not include any changes, removing it');
      await this.provider.request('CloudFormation', 'deleteChangeSet', {
        StackName: stackName,
        ChangeSetName: changeSetName,
      });
      this.serverless.service.provider.deploymentWithEmptyChangeSet = true;
      return false;
    }

    log.info('Executing created change set');
    await this.provider.request('CloudFormation', 'executeChangeSet', executeChangeSetParams);
    return await this.monitorStack('create', changeSet);
  },

  async update() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    const templateUrl = `https://${s3Endpoint}/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    legacy.log('Updating Stack...');
    const stackName = this.provider.naming.getStackName();
    const changeSetName = this.provider.naming.getStackChangeSetName();
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

    const createChangeSetParams = {
      StackName: stackName,
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
      ChangeSetName: changeSetName,
      ChangeSetType: 'UPDATE',
    };

    const executeChangeSetParams = {
      StackName: stackName,
      ChangeSetName: changeSetName,
    };

    if (
      this.serverless.service.provider.compiledCloudFormationTemplate &&
      this.serverless.service.provider.compiledCloudFormationTemplate.Transform
    ) {
      createChangeSetParams.Capabilities.push('CAPABILITY_AUTO_EXPAND');
    }

    const customDeploymentRole = this.provider.getCustomDeploymentRole();
    if (customDeploymentRole) {
      createChangeSetParams.RoleARN = customDeploymentRole;
    }

    if (this.serverless.service.provider.notificationArns) {
      createChangeSetParams.NotificationARNs = this.serverless.service.provider.notificationArns;
    }

    if (this.serverless.service.provider.stackParameters) {
      createChangeSetParams.Parameters = this.serverless.service.provider.stackParameters;
    }

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (
      this.serverless.service.provider.stackPolicy &&
      Object.keys(this.serverless.service.provider.stackPolicy).length
    ) {
      createChangeSetParams.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    if (this.serverless.service.provider.rollbackConfiguration) {
      createChangeSetParams.RollbackConfiguration =
        this.serverless.service.provider.rollbackConfiguration;
    }

    if (this.serverless.service.provider.disableRollback) {
      executeChangeSetParams.DisableRollback = this.serverless.service.provider.disableRollback;
    }

    // Ensure that previous change set has been removed
    await this.provider.request('CloudFormation', 'deleteChangeSet', {
      StackName: stackName,
      ChangeSetName: changeSetName,
    });

    // Create new change set
    log.info('Creating new change set');
    const changeSet = await this.provider.request(
      'CloudFormation',
      'createChangeSet',
      createChangeSetParams
    );

    // Wait for changeset to be created
    log.info('Waiting for new change set to be created');
    const changeSetDescription = await this.waitForChangeSetCreation(changeSetName, stackName);

    // Check if stack has changes
    if (isChangeSetWithoutChanges(changeSetDescription)) {
      // Cleanup changeset when it does not include any changes
      log.info('Created change set does not include any changes, removing it');
      await this.provider.request('CloudFormation', 'deleteChangeSet', {
        StackName: stackName,
        ChangeSetName: changeSetName,
      });
      this.serverless.service.provider.deploymentWithEmptyChangeSet = true;
      return false;
    }

    log.info('Executing created change set');
    await this.provider.request('CloudFormation', 'executeChangeSet', executeChangeSetParams);

    await this.monitorStack('update', changeSet);

    return true;
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
