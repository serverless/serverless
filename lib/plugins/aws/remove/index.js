'use strict';

const validate = require('../lib/validate');
const monitorStack = require('../lib/monitorStack');
const emptyS3Bucket = require('./lib/bucket');
const removeStack = require('./lib/stack');
const removeEcrRepository = require('./lib/ecr');
const checkIfEcrRepositoryExists = require('../lib/checkIfEcrRepositoryExists');
const { log, style, progress } = require('@serverless/utils/log');

const mainProgress = progress.get('main');

class AwsRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      emptyS3Bucket,
      removeStack,
      monitorStack,
      removeEcrRepository,
      checkIfEcrRepositoryExists
    );

    this.hooks = {
      'initialize': async () => {
        if (this.serverless.processedInput.commands.join(' ') === 'remove') {
          log.notice(
            `Removing ${this.serverless.service.service} from stage ${this.serverless
              .getProvider('aws')
              .getStage()} ${style.aside(`(${this.serverless.getProvider('aws').getRegion()})`)}`
          );
          log.info(); // Ensure gap between verbose logging
        }
      },
      'remove:remove': async () => {
        const doesEcrRepositoryExistPromise = this.checkIfEcrRepositoryExists();
        await this.validate();
        mainProgress.notice('Removing objects from S3 bucket', { isMainEvent: true });
        await this.emptyS3Bucket();
        mainProgress.notice('Removing CloudFormation stack', { isMainEvent: true });
        const cfData = await this.removeStack();
        await this.monitorStack('delete', cfData);
        if (await doesEcrRepositoryExistPromise) {
          mainProgress.notice('Removing ECR repository', { isMainEvent: true });
          await this.removeEcrRepository();
        }
      },
      'finalize': () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'remove') return;
        log.notice();
        log.notice.success(
          `Service ${this.serverless.service.service} has been successfully removed ${style.aside(
            `(${Math.floor(
              (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
            )}s)`
          )}`
        );
      },
    };
  }
}

module.exports = AwsRemove;
