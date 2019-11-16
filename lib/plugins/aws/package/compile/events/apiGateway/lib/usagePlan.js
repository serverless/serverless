'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

function createUsagePlanResource(that, name) {
  const resourceTemplate = {
    Type: 'AWS::ApiGateway::UsagePlan',
    DependsOn: that.apiGatewayDeploymentLogicalId,
    Properties: {
      ApiStages: [
        {
          ApiId: that.provider.getApiGatewayRestApiId(),
          Stage: that.provider.getStage(),
        },
      ],
      Description: `Usage plan "${name}" for ${
        that.serverless.service.service
      } ${that.provider.getStage()} stage`,
      UsagePlanName: `${that.serverless.service.service}-${name}-${that.provider.getStage()}`,
    },
  };
  const template = _.cloneDeep(resourceTemplate);
  // this is done for backward compatibility
  if (name === 'default') {
    // create old legacy resources
    template.Properties.UsagePlanName = `${
      that.serverless.service.service
    }-${that.provider.getStage()}`;
    template.Properties.Description = `Usage plan for ${
      that.serverless.service.service
    } ${that.provider.getStage()} stage`;
    // assign quota
    if (
      _.has(that.serverless.service.provider, 'usagePlan.quota') &&
      that.serverless.service.provider.usagePlan.quota !== null
    ) {
      _.merge(template, {
        Properties: {
          Quota: _.merge(
            { Limit: that.serverless.service.provider.usagePlan.quota.limit },
            { Offset: that.serverless.service.provider.usagePlan.quota.offset },
            { Period: that.serverless.service.provider.usagePlan.quota.period }
          ),
        },
      });
    }
    // assign throttle
    if (
      _.has(that.serverless.service.provider, 'usagePlan.throttle') &&
      that.serverless.service.provider.usagePlan.throttle !== null
    ) {
      _.merge(template, {
        Properties: {
          Throttle: _.merge(
            { BurstLimit: that.serverless.service.provider.usagePlan.throttle.burstLimit },
            { RateLimit: that.serverless.service.provider.usagePlan.throttle.rateLimit }
          ),
        },
      });
    }
  } else {
    // assign quota
    const quotaProperties = that.serverless.service.provider.usagePlan.reduce(
      (accum, planObject) => {
        if (planObject[name] && planObject[name].quota) {
          return planObject[name].quota;
        }
        return accum;
      },
      {}
    );
    if (!_.isEmpty(quotaProperties)) {
      _.merge(template, {
        Properties: {
          Quota: _.merge(
            { Limit: quotaProperties.limit },
            { Offset: quotaProperties.offset },
            { Period: quotaProperties.period }
          ),
        },
      });
    }
    // assign throttle
    const throttleProperties = that.serverless.service.provider.usagePlan.reduce(
      (accum, planObject) => {
        if (planObject[name] && planObject[name].throttle) {
          return planObject[name].throttle;
        }
        return accum;
      },
      {}
    );
    if (!_.isEmpty(throttleProperties)) {
      _.merge(template, {
        Properties: {
          Throttle: _.merge(
            { BurstLimit: throttleProperties.burstLimit },
            { RateLimit: throttleProperties.rateLimit }
          ),
        },
      });
    }
  }
  return template;
}

module.exports = {
  compileUsagePlan() {
    if (this.serverless.service.provider.usagePlan || this.serverless.service.provider.apiKeys) {
      const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      this.apiGatewayUsagePlanNames = [];

      if (_.isArray(this.serverless.service.provider.usagePlan)) {
        _.forEach(this.serverless.service.provider.usagePlan, planObject => {
          const usagePlanName = Object.keys(planObject)[0];
          const logicalId = this.provider.naming.getUsagePlanLogicalId(usagePlanName);
          const resourceTemplate = createUsagePlanResource(this, usagePlanName);
          _.merge(resources, {
            [logicalId]: resourceTemplate,
          });
          this.apiGatewayUsagePlanNames.push(usagePlanName);
        });
      } else {
        const usagePlanName = 'default';
        const logicalId = this.provider.naming.getUsagePlanLogicalId();
        const resourceTemplate = createUsagePlanResource(this, usagePlanName);
        _.merge(resources, {
          [logicalId]: resourceTemplate,
        });
        this.apiGatewayUsagePlanNames.push(usagePlanName);
      }
    }
    return BbPromise.resolve();
  },
};
