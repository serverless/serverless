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
          StageName: this.options.stage,
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
              `.execute-api.${this.options.region}.amazonaws.com/${this.options.stage}`,
            ],
          ],
        },
      },
    });

    // Create a CloudFormation Ref for the stage
    // then you can use it in a resources: Resource
    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
      ServerlessStage: {
        Description: 'The Stage option from serverless',
        Value: this.options.stage,
      },
    });

    return BbPromise.resolve();
  },
};
