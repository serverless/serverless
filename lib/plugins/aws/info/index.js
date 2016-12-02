'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const getStackInfo = require('./getStackInfo');
const getApiKeyValues = require('./getApiKeyValues');
const display = require('./display');

class AwsInfo {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    this.options = options || {};
    Object.assign(
      this,
      validate,
      getStackInfo,
      getApiKeyValues,
      display
    );

    this.hooks = {
      'info:info': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.getStackInfo)
        .then(this.getApiKeyValues)
        .then(this.display),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(() => {
          if (this.options.noDeploy) {
            return BbPromise.resolve();
          }
          return BbPromise.bind(this)
            .then(this.validate)
            .then(this.getStackInfo)
            .then(this.getApiKeyValues)
            .then(this.display);
        }),
    };
  }
}

module.exports = AwsInfo;
