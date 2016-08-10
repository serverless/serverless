'use strict';

const BbPromise = require('bluebird');
const validate = require('./lib/validate');
const zipService = require('./lib/zipService');
const cleanup = require('./lib/cleanup');

class Package {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      validate,
      zipService,
      cleanup
    );

    this.hooks = {
      'deploy:createDeploymentPackage': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.zipService),

      'deploy:clean': () => BbPromise.bind(this)
        .then(this.cleanup),
    };
  }
}

module.exports = Package;
