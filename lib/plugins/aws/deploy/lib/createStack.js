'use strict';

const BbPromise = require('bluebird');
const ServerlessError = require('../../../../serverless-error');
const { legacy, progress, log } = require('@serverless/utils/log');

module.exports = {
  async create() {
    // Note: using three dots instead of ellipsis to support non uni-code consoles.
    legacy.log('Creating Stack...');
    progress.get('main').notice('Creating CloudFormation stack');
    log.info('Creating CloudFormation stack');
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
      OnFailure: 'DELETE',
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      Parameters: [],
      TemplateBody: JSON.stringify(this.serverless.service.provider.coreCloudFormationTemplate),
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

    return this.provider
      .request('CloudFormation', 'createStack', params)
      .then((cfData) => this.monitorStack('create', cfData));
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
                legacy.log('Not using S3 Transfer Acceleration (1st deploy)');
                log.info('Not using S3 Transfer Acceleration (1st deploy)');
                this.provider.disableTransferAccelerationForCurrentDeploy();
              }
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
