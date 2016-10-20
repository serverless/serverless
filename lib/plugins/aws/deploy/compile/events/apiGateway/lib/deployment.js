'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    this.deploymentLogicalId = `ApiGatewayDeployment${(new Date()).getTime().toString()}`;

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.deploymentLogicalId]: {
        Type: 'AWS::ApiGateway::Deployment',
        Properties: {
          RestApiId: { Ref: this.restApiLogicalId },
          StageName: this.options.stage,
        },
        DependsOn: this.methodLogicalIds,
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
              { Ref: this.restApiLogicalId },
              `.execute-api.${this.options.region}.amazonaws.com/${this.options.stage}`,
            ],
          ],
        },
      },
    });
    return BbPromise.resolve();
  },
};
