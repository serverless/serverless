'use strict';

const _ = require('lodash');

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
  const usagePlan = _.get(that.serverless.service.provider.apiGateway, 'usagePlan');
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
    if (_.get(usagePlan, 'quota')) {
      // #7747, could not replace _.merge with Object.assign, as this does deep merges
      _.merge(template, {
        Properties: {
          Quota: Object.assign(
            { Limit: usagePlan.quota.limit },
            { Offset: usagePlan.quota.offset },
            { Period: usagePlan.quota.period }
          ),
        },
      });
    }
    // assign throttle
    if (_.get(usagePlan, 'throttle')) {
      // #7747, could not replace _.merge with Object.assign, as this does deep merges
      _.merge(template, {
        Properties: {
          Throttle: Object.assign(
            { BurstLimit: usagePlan.throttle.burstLimit },
            { RateLimit: usagePlan.throttle.rateLimit }
          ),
        },
      });
    }
  } else {
    // assign quota
    const quotaProperties = usagePlan.reduce((accum, planObject) => {
      if (planObject[name] && planObject[name].quota) {
        return planObject[name].quota;
      }
      return accum;
    }, {});
    if (Object.keys(quotaProperties).length) {
      // #7747, could not replace _.merge with Object.assign, as this does deep merges
      _.merge(template, {
        Properties: {
          Quota: Object.assign(
            { Limit: quotaProperties.limit },
            { Offset: quotaProperties.offset },
            { Period: quotaProperties.period }
          ),
        },
      });
    }
    // assign throttle
    const throttleProperties = usagePlan.reduce((accum, planObject) => {
      if (planObject[name] && planObject[name].throttle) {
        return planObject[name].throttle;
      }
      return accum;
    }, {});
    if (Object.keys(throttleProperties).length) {
      // #7747, could not replace _.merge with Object.assign, as this does deep merges
      _.merge(template, {
        Properties: {
          Throttle: Object.assign(
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
    const apiKeys = _.get(this.serverless.service.provider.apiGateway, 'apiKeys');
    const usagePlan = _.get(this.serverless.service.provider.apiGateway, 'usagePlan');
    if (usagePlan || apiKeys) {
      const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      this.apiGatewayUsagePlanNames = [];

      if (Array.isArray(usagePlan)) {
        usagePlan.forEach((planObject) => {
          const usagePlanName = Object.keys(planObject)[0];
          const logicalId = this.provider.naming.getUsagePlanLogicalId(usagePlanName);
          const resourceTemplate = createUsagePlanResource(this, usagePlanName);
          Object.assign(resources, {
            [logicalId]: resourceTemplate,
          });
          this.apiGatewayUsagePlanNames.push(usagePlanName);
        });
      } else {
        const usagePlanName = 'default';
        const logicalId = this.provider.naming.getUsagePlanLogicalId();
        const resourceTemplate = createUsagePlanResource(this, usagePlanName);
        Object.assign(resources, {
          [logicalId]: resourceTemplate,
        });
        this.apiGatewayUsagePlanNames.push(usagePlanName);
      }
    }
  },
};
