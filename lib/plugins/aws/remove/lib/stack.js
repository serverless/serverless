'use strict';

const BbPromise = require('bluebird');

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const params = {
      StackName: stackName,
    };
    const cfData = {
      StackId: stackName,
    };

    return this.provider.request('CloudFormation',
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
