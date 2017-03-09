'use strict';

/*
 * serverless package => package in default .serverless dir
 * serverless package --package => package in custom path
 *
 * serverless deploy => package in default .serverless & deploy from default .serverless
 * serverless deploy --package => deploy from custom path
 */

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const runPackage = require('./lib/runPackage');
const extendedValidate = require('./lib/extendedValidate');
const monitorStack = require('../lib/monitorStack');
const createStack = require('./lib/createStack');
const setBucketName = require('../lib/setBucketName');
const cleanupS3Bucket = require('./lib/cleanupS3Bucket');
const uploadArtifacts = require('./lib/uploadArtifacts');
const updateStack = require('../lib/updateStack');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      runPackage,
      extendedValidate,
      createStack,
      setBucketName,
      cleanupS3Bucket,
      uploadArtifacts,
      updateStack,
      monitorStack
    );

    this.hooks = {
      'deploy:initialize': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.runPackage)
        .then(this.extendedValidate),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.createStack)
        .then(this.setBucketName)
        .then(this.uploadArtifacts)
        .then(this.updateStack),

      'deploy:finalize': () => BbPromise.bind(this)
        .then(this.cleanupS3Bucket),
    };
  }
}

module.exports = AwsDeploy;
