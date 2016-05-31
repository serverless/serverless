'use strict';

const BbPromise = require('bluebird');
const deployCore = require('./lib/deployCore');
const deployFunctions = require('./lib/deployFunctions');
const compile = require('./lib/compile');
const updateStack = require('./lib/updateStack');

const AWS = require('aws-sdk');

class awsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    const config = {
      region: this.options.region,
    };
    this.CloudFormation = new AWS.CloudFormation(config);
    BbPromise.promisifyAll(this.CloudFormation, { suffix: 'Promised' });

    Object.assign(this, deployCore, deployFunctions, compile, updateStack);
  }


}

module.exports = awsDeploy;
