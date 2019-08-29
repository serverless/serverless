'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const monitorStack = require('../lib/monitorStack');
const emptyS3Bucket = require('./lib/bucket');
const removeStack = require('./lib/stack');

class AwsRemove {
  constructor(serverless, opts) {
    this.serverless = serverless;
    this.options = opts || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, emptyS3Bucket, removeStack, monitorStack);

    this.hooks = {
      'remove:remove': () => {
        const options = {};
        if (this.serverless.service.provider.asyncStackOperation) {
          options.async = true;
        }

        return BbPromise.bind(this)
          .then(this.validate)
          .then(this.emptyS3Bucket)
          .then(this.removeStack)
          .then(cfData => this.monitorStack('removal', cfData, options));
      },
    };
  }
}

module.exports = AwsRemove;
