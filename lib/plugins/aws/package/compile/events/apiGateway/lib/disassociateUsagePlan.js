'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  disassociateUsagePlan() {
    const apiKeys = this.serverless.service.provider.apiKeys;

    if (apiKeys && apiKeys.length) {
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
};
