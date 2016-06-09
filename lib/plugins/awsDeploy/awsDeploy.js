'use strict';

const BbPromise = require('bluebird');
const validateInput = require('./lib/validateInput');
const initializeResources = require('./lib/initializeResources');
const createStack = require('./lib/createStack');
const deployFunctions = require('./lib/deployFunctions');
const updateStack = require('./lib/updateStack');

const AWS = require('aws-sdk');

class awsDeploy {
  constructor(serverless) {
    this.serverless = serverless;

    Object.assign(
      this,
      validateInput,
      initializeResources,
      createStack,
      deployFunctions,
      updateStack
    );

    this.hooks = {
      'before:deploy:initializeResources': (options) => {
        this.options = options || {};

        const config = {
          region: this.options.region,
        };

        this.CloudFormation = new AWS.CloudFormation(config);
        this.S3 = new AWS.S3(config);
        BbPromise.promisifyAll(this.CloudFormation, { suffix: 'Promised' });
        BbPromise.promisifyAll(this.S3, { suffix: 'Promised' });

        this.validateInput();
      },

      'deploy:initializeResources': () => {
        this.initializeResources();
      },

      'deploy:createProviderStacks': () => {
        this.createStack();
      },

      'deploy:deploy': () => {
        return BbPromise.bind(this)
          .then(this.deployFunctions)
          .then(this.updateStack)
          .then(() => this.serverless.cli.log('Deployment successful!'));
      },
    };
  }
}

module.exports = awsDeploy;
