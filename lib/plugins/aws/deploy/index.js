'use strict';

const BbPromise = require('bluebird');
const validate = require('../lib/validate');
const monitorStack = require('../lib/monitorStack');
const createStack = require('./lib/createStack');
const mergeCustomProviderResources = require('./lib/mergeCustomProviderResources');
const generateArtifactDirectoryName = require('./lib/generateArtifactDirectoryName');
const setBucketName = require('./lib/setBucketName');
const cleanupS3Bucket = require('./lib/cleanupS3Bucket');
const uploadArtifacts = require('./lib/uploadArtifacts');
const updateStack = require('./lib/updateStack');
const configureStack = require('./lib/configureStack');
const listStacks = require('./lib/listStacks');

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
      setBucketName,
      cleanupS3Bucket,
      uploadArtifacts,
      updateStack,
      monitorStack,
      configureStack,
      listStacks
    );

    this.hooks = {
      'before:deploy:initialize': () => BbPromise.bind(this)
        .then(this.validate),

      'deploy:initialize': () => BbPromise.bind(this)
        .then(this.configureStack)
        .then(this.mergeCustomProviderResources),

      'deploy:setupProviderConfiguration': () => BbPromise.bind(this)
        .then(this.createStack)
        .then((cfData) => this.monitorStack('create', cfData)),

      'before:deploy:compileFunctions': () => BbPromise.bind(this)
        .then(this.generateArtifactDirectoryName),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.setBucketName)
        .then(this.cleanupS3Bucket)
        .then(this.uploadArtifacts)
        .then(this.updateStack)
        .then((cfData) => this.monitorStack('update', cfData))
        .then(() => {
          if (this.options.noDeploy) this.serverless.cli.log('Did not deploy due to --noDeploy');
        }),

      'before:deploy:list:log': () => BbPromise.bind(this)
          .then(this.validate),

      'deploy:list:log': () => BbPromise.bind(this)
        .then(this.setBucketName)
        .then(this.listStacks),
    };
  }
}

module.exports = AwsDeploy;
