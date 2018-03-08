'use strict';

const BbPromise = require('bluebird');

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');
    const stackName = this.provider.naming.getStackName();
    const params = {
      StackName: stackName,
    };

    if (this.serverless.service.provider.cfnRole) {
      params.RoleARN = this.serverless.service.provider.cfnRole;
    }

    const cfData = {
      StackId: stackName,
    };

    return this.provider.request('CloudFormation',
      'deleteStack',
      params)
      .then(() => cfData);
  },

  removeStack() {
    return BbPromise.bind(this)
      .then(this.remove);
  },
};
