'use strict';

const BbPromise = require('bluebird');
const validate = require('./lib/validate');
const zipService = require('./lib/zipService');
const packageService = require('./lib/packageService');
const cleanup = require('./lib/cleanup');

class Package {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      validate,
      zipService,
      packageService,
      cleanup
    );

    this.hooks = {
      'deploy:cleanup': () => BbPromise.bind(this)
        .then(this.cleanup),

      'deploy:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.packageService),
    };
  }
}

module.exports = Package;
