'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const createStack = require('./lib/createStack');
const mergeCustomProviderResources = require('./lib/mergeCustomProviderResources');
const generateArtifactDirectoryName = require('./lib/generateArtifactDirectoryName');
const cleanupS3Bucket = require('./lib/cleanupS3Bucket');
const uploadArtifacts = require('./lib/uploadArtifacts');
const deployFunctions = require('./lib/deployFunctions');
const updateStack = require('./lib/updateStack');

const SDK = require('../');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws';
    this.sdk = new SDK(serverless);

    Object.assign(
      this,
      validate,
      createStack,
      generateArtifactDirectoryName,
      mergeCustomProviderResources,
      cleanupS3Bucket,
      uploadArtifacts,
      deployFunctions,
      updateStack
    );

    this.hooks = {
      'before:deploy:initialize': () => BbPromise.bind(this)
          .then(this.validate),

      'deploy:setupProviderConfiguration': () => BbPromise.bind(this).then(this.createStack),

      'before:deploy:compileFunctions': () => BbPromise.bind(this)
        .then(this.generateArtifactDirectoryName),

      'before:deploy:deploy': () => BbPromise.bind(this).then(this.mergeCustomProviderResources),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(() => this.sdk
          .getServerlessDeploymentBucketName(this.options.stage, this.options.region)
            .then((bucketName) => {
              this.bucketName = bucketName;
            })
        )
        .then(this.cleanupS3Bucket)
        .then(this.uploadArtifacts)
        .then(this.deployFunctions)
        .then(this.updateStack)
        .then(() => {
          const msg = this.options.noDeploy ?
            'Did not deploy due to --noDeploy' :
            'Deployment successful!';

          this.serverless.cli.log(msg);
        }),
    };
  }
}

module.exports = AwsDeploy;
