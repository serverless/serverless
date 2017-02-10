'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    this.apiGatewayDeploymentLogicalId = this.provider.naming
      .generateApiGatewayDeploymentLogicalId();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayDeploymentLogicalId]: {
        Type: 'AWS::ApiGateway::Deployment',
        Properties: {
          RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
        },
        DependsOn: this.apiGatewayMethodLogicalIds,
      },
    });

    return BbPromise.resolve();
  },
};
