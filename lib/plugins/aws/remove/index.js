'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const monitorStack = require('../lib/monitorStack');
const emptyS3Bucket = require('./lib/bucket');
const removeStack = require('./lib/stack');

class AwsRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, emptyS3Bucket, removeStack, monitorStack);

    this.hooks = {
      'remove:remove': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.emptyS3Bucket)
        .then(this.removeStack)
        .then((cfData) => this.monitorStack('removal', cfData)),
    };
  }
}

module.exports = AwsRemove;
