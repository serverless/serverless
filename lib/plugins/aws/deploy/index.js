'use strict';

const BbPromise = require('bluebird');
const validateInput = require('./lib/validate');
const initializeResources = require('./lib/initializeResources');
const createStack = require('./lib/createStack');
const deployFunctions = require('./lib/deployFunctions');
const updateStack = require('./lib/updateStack');

const SDK = require('../');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.sdk = new SDK(serverless);

    Object.assign(
      this,
      validateInput,
      initializeResources,
      createStack,
      deployFunctions,
      updateStack
    );

    this.hooks = {
      'before:deploy:initializeResources': () => BbPromise.bind(this)
          .then(this.validateInput),

      'deploy:initializeResources': () => BbPromise.bind(this).then(this.initializeResources),

      'deploy:createProviderStacks': () => BbPromise.bind(this).then(this.createStack),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.deployFunctions)
        .then(this.updateStack)
        .then(() => this.serverless.cli.log('Deployment successful!')),
    };
  }
}

module.exports = AwsDeploy;
