'use strict';

const BbPromise = require('bluebird');
const validateInput = require('./lib/validate');
const emptyS3Bucket = require('./lib/bucket');
const removeStack = require('./lib/stack');
const SDK = require('../');

class AwsRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.sdk = new SDK(serverless);
    this.options = options || {};

    Object.assign(this, validateInput, emptyS3Bucket, removeStack);

    this.hooks = {
      'remove:remove': () => BbPromise.bind(this)
          .then(this.validateInput)
          .then(this.emptyS3Bucket)
          .then(this.removeStack)
          .then(() => this.serverless.cli.log('Resource removal successful!')),
    };
  }
}

module.exports = AwsRemove;
