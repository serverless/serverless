'use strict';

const validate = require('../lib/validate');
const monitorStack = require('../lib/monitorStack');
const emptyS3Bucket = require('./lib/bucket');
const removeStack = require('./lib/stack');
const removeEcrRepository = require('./lib/ecr');
const checkIfEcrRepositoryExists = require('../lib/checkIfEcrRepositoryExists');

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
      'remove:remove': async () => {
        const doesEcrRepositoryExistPromise = this.checkIfEcrRepositoryExists();
        await this.validate();
        await this.emptyS3Bucket();
        const cfData = await this.removeStack();
        await this.monitorStack('delete', cfData);
        if (await doesEcrRepositoryExistPromise) {
          await this.removeEcrRepository();
        }
      },
    };
  }
}

module.exports = AwsRemove;
