'use strict';

const BbPromise = require('bluebird');
const getS3EndpointForRegion = require('../utils/get-s3-endpoint-for-region');
const { log, progress } = require('@serverless/utils/log');
const isChangeSetWithoutChanges = require('../utils/is-change-set-without-changes');

module.exports = {
  async createFallback() {
    this.createLater = false;
    progress.get('main').notice('Creating CloudFormation stack', { isMainEvent: true });

    const stackName = this.provider.naming.getStackName();
    const changeSetName = this.provider.naming.getStackChangeSetName();

    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    const templateUrl = `https://${s3Endpoint}/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    const createChangeSetParams = this.getCreateChangeSetParams({
      changeSetType: 'CREATE',
      templateUrl,
    });

    const executeChangeSetParams = this.getExecuteChangeSetParams();

    // Create new change set
    this.provider.didCreateService = true;
    log.info('Creating new change set');
    await this.provider.request('CloudFormation', 'createChangeSet', createChangeSetParams);

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
    return await this.monitorStack('create', changeSetDescription);
  },

  async update() {
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion());
    const templateUrl = `https://${s3Endpoint}/${this.bucketName}/${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`;

    const stackName = this.provider.naming.getStackName();
    const changeSetName = this.provider.naming.getStackChangeSetName();

    const createChangeSetParams = this.getCreateChangeSetParams({
      changeSetType: 'UPDATE',
      templateUrl,
    });

    const executeChangeSetParams = this.getExecuteChangeSetParams();

    // Ensure that previous change set has been removed
    await this.provider.request('CloudFormation', 'deleteChangeSet', {
      StackName: stackName,
      ChangeSetName: changeSetName,
    });

    // Create new change set
    log.info('Creating new change set');
    await this.provider.request('CloudFormation', 'createChangeSet', createChangeSetParams);

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

    await this.monitorStack('update', changeSetDescription);

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
