'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
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

  disassociateUsagePlan() {
    if (this.serverless.service.provider.apiKeys) {
      this.serverless.cli.log('Removing usage plan association...');
      const stackName = `${this.serverless.service.service}-${this.options.stage}`;
      return BbPromise.all([
        this.provider.request('CloudFormation',
          'describeStackResource',
          {
            StackName: stackName,
            LogicalResourceId: this.provider.naming.getRestApiLogicalId(),
          },
          this.options.stage,
          this.options.region),
        this.provider.request('APIGateway',
          'getUsagePlans', {},
          this.options.stage,
          this.options.region),
      ]).then((data) => data[1].items.filter((item) =>
          _.includes(item.apiStages
            .map(apistage => apistage.apiId), data[0].StackResourceDetail.PhysicalResourceId)))
        .then((items) => BbPromise.all(_.flattenDeep(items.map(item =>
          item.apiStages.map(apiStage =>
            this.provider.request('APIGateway',
              'updateUsagePlan', {
                usagePlanId: item.id,
                patchOperations: [{
                  op: 'remove',
                  path: '/apiStages',
                  value: `${apiStage.apiId}:${apiStage.stage}`,
                }],
              },
              this.options.stage,
              this.options.region))))));
    }
    return BbPromise.resolve();
  },

  removeStack() {
    return BbPromise.bind(this)
      .then(this.disassociateUsagePlan)
      .then(this.remove);
  },
};
