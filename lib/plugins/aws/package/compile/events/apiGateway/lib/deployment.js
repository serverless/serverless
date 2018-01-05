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
          StageName: this.provider.getStage(),
        },
        DependsOn: this.apiGatewayMethodLogicalIds,
      },
    });

    // create CLF Output for endpoint
    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
      ServiceEndpoint: {
        Description: 'URL of the service endpoint',
        Value: {
          'Fn::Join': ['',
            [
              'https://',
              { Ref: this.apiGatewayRestApiLogicalId },
              `.execute-api.${
                this.provider.getRegion()
              }.amazonaws.com/${
                this.provider.getStage()
              }`,
            ],
          ],
        },
      },
    });
    return BbPromise.resolve();
  },
};
