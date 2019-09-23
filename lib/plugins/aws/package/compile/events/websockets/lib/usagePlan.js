'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileUsagePlan() {
    if (this.serverless.service.provider.usagePlan || this.serverless.service.provider.apiKeys) {
      const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      if (_.isArray(this.serverless.service.provider.usagePlan)) {
        _.forEach(this.serverless.service.provider.usagePlan, planObject => {
          const usagePlanName = Object.keys(planObject)[0];
          const logicalId = this.provider.naming.getUsagePlanLogicalId(usagePlanName);

          resources[logicalId].Properties.ApiStages.push({
            ApiId: { Ref: this.provider.naming.getWebsocketsApiLogicalId() },
            Stage: this.provider.getStage(),
          });

          resources[logicalId].DependsOn = [
            resources[logicalId].DependsOn,
            this.provider.naming.getWebsocketsApiLogicalId(),
          ];
        });
      } else {
        // const usagePlanName = 'default';
        const logicalId = this.provider.naming.getUsagePlanLogicalId();

        resources[logicalId].Properties.ApiStages.push({
          ApiId: { Ref: this.provider.naming.getWebsocketsApiLogicalId() },
          Stage: this.provider.getStage(),
        });

        resources[logicalId].DependsOn = [
          resources[logicalId].DependsOn,
          this.provider.naming.getWebsocketsApiLogicalId(),
        ];
      }
    }

    return BbPromise.resolve();
  },
};
