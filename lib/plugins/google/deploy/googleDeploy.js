'use strict';

const BbPromise = require('bluebird');
const createDeploymentBucket = require('./lib/createDeploymentBucket');
const generateArtifactDirectoryName = require('./lib/generateArtifactDirectoryName');
const cleanupDeploymentBucket = require('./lib/cleanupDeploymentBucket');
const uploadArtifacts = require('./lib/uploadArtifacts');
const createFunctions = require('./lib/createFunctions');
const getDeploymentBucket = require('../shared/getDeploymentBucket');
const validate = require('../shared/validate');
const getAllFunctions = require('../shared/getAllFunctions');
const deleteFunctions = require('../shared/deleteFunctions');
const monitorFunctions = require('../shared/monitorFunctions');

class GoogleDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('google');

    Object.assign(
      this,
      validate,
      getDeploymentBucket,
      createDeploymentBucket,
      generateArtifactDirectoryName,
      cleanupDeploymentBucket,
      uploadArtifacts,
      getAllFunctions,
      deleteFunctions,
      createFunctions,
      monitorFunctions
    );

    this.hooks = {
      'before:deploy:initialize': () => BbPromise.bind(this)
        .then(this.validate),

      'deploy:setupProviderConfiguration': () => BbPromise.bind(this)
        .then(this.getDeploymentBucket)
        .then(this.createDeploymentBucket),

      'before:deploy:compileFunctions': () => BbPromise.bind(this)
        .then(this.generateArtifactDirectoryName),

      // do an overall cleanup
      'before:deploy:deploy': () => BbPromise.bind(this)
        .then(this.cleanupDeploymentBucket)
        .then(this.getAllFunctions)
        .then(this.deleteFunctions)
        .then(this.monitorFunctions),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.uploadArtifacts)
        .then(this.createFunctions)
        .then(this.monitorFunctions)
        .then(() => this.serverless.cli.log('Service successfully deployed')),
    };
  }
}

module.exports = GoogleDeploy;
