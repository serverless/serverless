'use strict';

const BbPromise = require('bluebird');
const { progress, log } = require('@serverless/utils/log');
const ServerlessError = require('../../../../serverless-error');
const isChangeSetWithoutChanges = require('../../utils/is-change-set-without-changes');

const inactiveStateNames = new Set(['REVIEW_IN_PROGRESS']);

module.exports = {
  async create() {
    // Note: using three dots instead of ellipsis to support non uni-code consoles.
    progress.get('main').notice('Creating CloudFormation stack', { isMainEvent: true });
    const stackName = this.provider.naming.getStackName();
    let monitorCfData;

    if (this.serverless.service.provider.deploymentMethod === 'direct') {
      const params = this.getCreateStackParams({
        templateBody: this.serverless.service.provider.coreCloudFormationTemplate,
      });
      monitorCfData = await this.provider.request('CloudFormation', 'createStack', params);
    } else {
      // Change-set based deployment
      const changeSetName = this.provider.naming.getStackChangeSetName();
      const createChangeSetParams = this.getCreateChangeSetParams({
        changeSetType: 'CREATE',
        templateBody: this.serverless.service.provider.coreCloudFormationTemplate,
      });

      const executeChangeSetParams = this.getExecuteChangeSetParams();

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
        return;
      }

      this.provider.didCreateService = true;
      log.info('Executing created change set');
      await this.provider.request('CloudFormation', 'executeChangeSet', executeChangeSetParams);
      monitorCfData = changeSetDescription;
    }
    await this.monitorStack('create', monitorCfData);
  },

  async createStack() {
    const stackName = this.provider.naming.getStackName();
    if (/^[^a-zA-Z].+|.*[^a-zA-Z0-9-].*/.test(stackName) || stackName.length > 128) {
      const errorMessage = [
        `The stack service name "${stackName}" is not valid. `,
        'A service name should only contain alphanumeric',
        ' (case sensitive) and hyphens. It should start',
        " with an alphabetic character and shouldn't",
        ' exceed 128 characters.',
      ].join('');
      throw new ServerlessError(errorMessage, 'INVALID_STACK_NAME_ERROR');
    }

    return BbPromise.bind(this)
      .then(() =>
        this.provider
          .request('CloudFormation', 'describeStacks', { StackName: stackName })
          .then((data) => {
            const shouldCheckStackOutput =
              // check stack output only if acceleration is requested
              this.provider.isS3TransferAccelerationEnabled() &&
              // custom deployment bucket won't generate any output (no check)
              !this.serverless.service.provider.deploymentBucket;
            if (shouldCheckStackOutput) {
              const isAlreadyAccelerated = data.Stacks[0].Outputs.some(
                (output) => output.OutputKey === 'ServerlessDeploymentBucketAccelerated'
              );

              if (!isAlreadyAccelerated) {
                log.info('Not using S3 Transfer Acceleration (1st deploy)');
                this.provider.disableTransferAccelerationForCurrentDeploy();
              }
            }

            const stackStatus = data.Stacks[0].StackStatus;
            if (inactiveStateNames.has(stackStatus)) {
              const errorMessage = [
                'Service cannot be deployed as the CloudFormation stack ',
                `is in the '${stackStatus}' state. `,
                'This may signal either that stack is currently deployed by a different entity, ',
                'or that the previous deployment failed and was left in an abnormal state, ',
                "in which case you can mitigate the issue by running 'sls remove' command",
              ].join('');
              throw new ServerlessError(errorMessage, 'AWS_CLOUDFORMATION_INACTIVE_STACK');
            }
            return BbPromise.resolve('alreadyCreated');
          })
      )
      .catch((e) => {
        if (e.message.indexOf('does not exist') > -1) {
          if (this.serverless.service.provider.deploymentBucket) {
            this.createLater = true;
            return BbPromise.resolve();
          }
          return BbPromise.bind(this).then(this.create);
        }
        throw e;
      });
  },
};
