'use strict';

const BbPromise = require('bluebird');
const validate = require('./lib/validate');
const emptyS3Bucket = require('./lib/bucket');
const removeStack = require('./lib/stack');
const SDK = require('../');

class AwsRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = 'aws';
    this.sdk = new SDK(serverless);

    Object.assign(this, validate, emptyS3Bucket, removeStack);

    this.hooks = {
      'remove:remove': () => BbPromise.bind(this)
          .then(this.validate)
          .then(this.emptyS3Bucket)
          .then(this.removeStack)
          .then(() => this.serverless.cli.log('Resource removal successful!')),
    };
  }
}

module.exports = AwsRemove;
