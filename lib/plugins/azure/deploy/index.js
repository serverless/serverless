'use strict';

const BbPromise = require('bluebird');

const validateInput = require('./lib/validateInput');
const initializeResources = require('./lib/initializeResources');
const createResourceGroup = require('./lib/createResourceGroup');
const deployResources = require('./lib/deployResources');
const deployFunctions = require('./lib/deployFunctions');
const azureCli = require('../utils/azureCli');

class AzureDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      validateInput,
      initializeResources,
      createResourceGroup,
      deployResources,
      deployFunctions
    );

    this.hooks = {
      // Read the general template, merge with existing configuration,
      // potentially add features
      'deploy:initializeResources': () => {
        return BbPromise.bind(this)
          .then(this.initializeResources);
      },

      'before:deploy:createProviderStacks': () => azureCli.setMode('arm'),

      'deploy:createProviderStacks': () => {
        // 1) Create resource group, deleting an existing one if it is
        //    in the way
        return BbPromise.bind(this)
          .then(this.createResourceGroup);
      },

      'deploy:deploy': () => {
        // 1) Create resources and website with functions extension installed
        // 2) Deploy functions to said webite
        return BbPromise.bind(this)
          // Optional: If you need to this in two steps, add a
          .then(this.deployResources)
          .then(this.deployFunctions)
          .then(() => this.serverless.cli.log('Deployment successful!'));
      },
    };
  }
}

module.exports = AzureDeploy;
