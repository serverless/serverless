'use strict';

const BbPromise = require('bluebird');
const pathLib = require('path');

const naming = require(pathLib.join(__dirname, '..', '..', 'lib', 'naming.js'));

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');
    const stackName = naming.getStackName();
    const params = {
      StackName: stackName,
    };
    const cfData = {
      StackId: stackName,
    };

    return this.sdk.request('CloudFormation',
      'deleteStack',
      params,
      this.options.stage,
      this.options.region)
      .then(() => cfData);
  },

  removeStack() {
    return BbPromise.bind(this)
      .then(this.remove);
  },
};
