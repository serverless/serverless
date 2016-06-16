'use strict';

const BbPromise = require('bluebird');

const validateInput       = require('./lib/validateInput');
const initializeResources = require('./lib/initializeResources');
const createResourceGroup = require('./lib/createResourceGroup');
const deployFunctions     = require('./lib/deployFunctions');

class AzureDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    Object.assign(
      this,
      validateInput,
      initializeResources,
      createResourceGroup,
      deployFunctions
    );

    this.hooks = {
      'before:deploy:initializeResources': () => {
        // Todo: test that the Azure CLI is installed
      },

      'deploy:initializeResources': () => {
        // Read the general template, merge with existing configuration,
        // potentially add features
        return BbPromise.bind(this)
          .then(this.initializeResources);
      },

      'deploy:createProviderStacks': () => {
        // Todo: See ./lib/createResourceGroup. If we want
        // to create a resource group, it should happen in this
        // step.
        //
        // Todo: Obviously, at first deploy we need to create a
        // functions web app. Choose a fix naming convention
        // and either create or deploy into an existing one.
        // --website mywebsite[.azurewebsites.net] (check env, then param)
        // (if it doesn't exist, create a new one)
        // (save this in the serverless.env.yml to ensure that the user
        // has to do this only once, together with stage/region)
        //
        // Todo: Do we really need this step? Should we handle this
        // in deploy?
        return BbPromise.bind(this)
          .then(this.createResourceGroup);
      },

      'deploy:deploy': () => {
        // Todo: See ./lib/deployFunctions. This is where rubber
        // hits the road and functions should be deployed to Azure
        return BbPromise.bind(this)
          // Optional: If you need to this in two steps, add a
          // .then(this.createOrUpdateWebsite)
          .then(this.deployFunctions)
          .then(() => this.serverless.cli.log('Deployment successful!'));
      },
    };
  }
}

module.exports = AzureDeploy;
