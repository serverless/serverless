'use strict';

const BbPromise = require('bluebird');

const naming = require('../../lib/naming.js');

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
