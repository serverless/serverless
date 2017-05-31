'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileUsagePlan() {
    this.apiGatewayUsagePlanLogicalId = this.provider.naming.getUsagePlanLogicalId();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayUsagePlanLogicalId]: {
        Type: 'AWS::ApiGateway::UsagePlan',
        DependsOn: [
          this.apiGatewayDeploymentLogicalId,
        ],
        Properties: {
          ApiStages: [
            {
              ApiId: {
                Ref: this.apiGatewayRestApiLogicalId,
              },
              Stage: this.options.stage,
            },
          ],
          Description:
            `Usage plan for ${this.serverless.service.service} ${this.options.stage} stage`,
          UsagePlanName: `${this.serverless.service.service}-usage-plan`,
        },
      },
    });

    return BbPromise.resolve();
  },
};
