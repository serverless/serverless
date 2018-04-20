'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileUsagePlan() {
    if (this.serverless.service.provider.usagePlan || this.serverless.service.provider.apiKeys) {
      this.apiGatewayUsagePlanLogicalId = this.provider.naming.getUsagePlanLogicalId();
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [this.apiGatewayUsagePlanLogicalId]: {
          Type: 'AWS::ApiGateway::UsagePlan',
          DependsOn: this.apiGatewayDeploymentLogicalId,
          Properties: {
            ApiStages: [
              {
                ApiId: this.provider.getApiGatewayRestApiId(),
                Stage: this.provider.getStage(),
              },
            ],
            Description: `Usage plan for ${this.serverless.service.service} ${
              this.provider.getStage()} stage`,
            UsagePlanName: `${this.serverless.service.service}-${
              this.provider.getStage()}`,
          },
        },
      });
      if (_.has(this.serverless.service.provider, 'usagePlan.quota')
        && this.serverless.service.provider.usagePlan.quota !== null) {
        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [this.apiGatewayUsagePlanLogicalId]: {
            Properties: {
              Quota: _.merge(
                { Limit: this.serverless.service.provider.usagePlan.quota.limit },
                { Offset: this.serverless.service.provider.usagePlan.quota.offset },
                { Period: this.serverless.service.provider.usagePlan.quota.period }),
            },
          },
        });
      }
      if (_.has(this.serverless.service.provider, 'usagePlan.throttle')
        && this.serverless.service.provider.usagePlan.throttle !== null) {
        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [this.apiGatewayUsagePlanLogicalId]: {
            Properties: {
              Throttle: _.merge(
                { BurstLimit: this.serverless.service.provider.usagePlan.throttle.burstLimit },
                { RateLimit: this.serverless.service.provider.usagePlan.throttle.rateLimit }),
            },
          },
        });
      }
    }
    return BbPromise.resolve();
  },
};
