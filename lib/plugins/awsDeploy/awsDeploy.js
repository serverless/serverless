'use strict';

const BbPromise = require('bluebird');
const validateInput = require('./lib/validateInput');
const createStack = require('./lib/createStack');
const deployFunctions = require('./lib/deployFunctions');
const compileFunctions = require('./lib/compileFunctions');
const updateStack = require('./lib/updateStack');

const AWS = require('aws-sdk');

class awsDeploy {
  constructor(serverless) {
    this.serverless = serverless;

    Object.assign(this, validateInput,createStack, deployFunctions, compileFunctions, updateStack);

    this.hooks = {
      'deploy:deploy': (options) => {
        this.options = options || {};

        const config = {
          region: this.options.region,
        };
        this.CloudFormation = new AWS.CloudFormation(config);
        BbPromise.promisifyAll(this.CloudFormation, { suffix: 'Promised' });

        return BbPromise.bind(this)
          .then(this.validateInput)
          .then(this.createStack)
          .then(this.deployFunctions)
          .then(this.compileFunctions)
          .then(this.updateStack)
          .then(() => this.serverless.cli.log('Deployment Successful!'));
      },
    };
  }
}

module.exports = awsDeploy;
