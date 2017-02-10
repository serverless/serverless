'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      ApiGatewayStage: {
        Type: 'AWS::ApiGateway::Stage',
        Properties: {
          RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
          DeploymentId: { Ref: this.apiGatewayDeploymentLogicalId },
          StageName: this.options.stage,
        },
        DependsOn: [this.apiGatewayDeploymentLogicalId],
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
              `.execute-api.${this.options.region}.amazonaws.com/${this.options.stage}`,
            ],
          ],
        },
      },
    });

    return BbPromise.resolve();
  },
};
