'use strict';

const BbPromise = require('bluebird');
const naming = require('../../lib/naming')

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');
    const stackName = naming.getStackName();
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
