'use strict';

const BbPromise = require('bluebird');
const validateInput = require('./lib/validateInput');
const emptyS3Bucket = require('./lib/emptyS3Bucket');

const AWS = require('aws-sdk');

class AwsRemoveResources {
  constructor(serverless) {
    this.serverless = serverless;

    Object.assign(this, validateInput, emptyS3Bucket);

    this.hooks = {
      'remove:resources:removeResources': (options) => {
        this.options = options || {};

        const config = {
          region: this.options.region,
        };

        this.S3 = new AWS.S3(config);
        BbPromise.promisifyAll(this.S3, { suffix: 'Promised' });

        return BbPromise.bind(this)
          .then(this.validateInput)
          .then(this.emptyS3Bucket)
          .then(() => this.serverless.cli.log('Resource removal successful!'));
      },
    };
  }
}

module.exports = AwsRemoveResources;
