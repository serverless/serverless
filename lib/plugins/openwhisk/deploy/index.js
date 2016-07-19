'use strict';

const BbPromise = require('bluebird');
const initializeResources = require('./lib/initializeResources');
const deployFunctions = require('./lib/deployFunctions');
const deployRules = require('./lib/deployRules');

class OpenWhiskDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      initializeResources,
      deployFunctions,
      deployRules
    );

    this.hooks = {
      'deploy:initializeResources': () => BbPromise.bind(this).then(this.initializeResources),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.deployFunctions)
        .then(this.deployRules)
        .then(() => this.serverless.cli.log('Deployment successful!')),
    };
  }
}

module.exports = OpenWhiskDeploy;
