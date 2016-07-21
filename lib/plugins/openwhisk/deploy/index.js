'use strict';

const BbPromise = require('bluebird');
const initializeResources = require('./lib/initializeResources');
const deployFunctions = require('./lib/deployFunctions');
const deployRules = require('./lib/deployRules');
const deployTriggers = require('./lib/deployTriggers');
const deployFeeds = require('./lib/deployFeeds');

class OpenWhiskDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      initializeResources,
      deployFunctions,
      deployRules,
      deployTriggers,
      deployFeeds
    );

    this.hooks = {
      'deploy:initializeResources': () => BbPromise.bind(this).then(this.initializeResources),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.deployFunctions)
        .then(this.deployTriggers)
        .then(this.deployFeeds)
        .then(this.deployRules)
        .then(() => this.serverless.cli.log('Deployment successful!')),
    };
  }
}

module.exports = OpenWhiskDeploy;
