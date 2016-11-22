'use strict';

const BbPromise = require('bluebird');
const deleteDeploymentBucket = require('./lib/deleteDeploymentBucket');
const getAllFunctions = require('../shared/getAllFunctions');
const deleteFunctions = require('../shared/deleteFunctions');
const validate = require('../shared/validate');
const getDeploymentBucket = require('../shared/getDeploymentBucket');
const monitorFunctions = require('../shared/monitorFunctions');

class GoogleRemove {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('google');

    Object.assign(
      this,
      validate,
      getDeploymentBucket,
      deleteDeploymentBucket,
      getAllFunctions,
      deleteFunctions,
      monitorFunctions
    );

    this.hooks = {
      'before:remove:remove': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.getDeploymentBucket),

      'remove:remove': () => BbPromise.bind(this)
        .then(this.deleteDeploymentBucket)
        .then(this.getAllFunctions)
        .then(this.deleteFunctions)
        .then(this.monitorFunctions)
        .then(() => this.serverless.cli.log('Service successfully removed')),
    };
  }
}

module.exports = GoogleRemove;
