'use strict';

const _ = require('lodash');

module.exports = {
  compileDeployment() {
    this.apiGatewayDeploymentLogicalId = this.provider.naming.generateApiGatewayDeploymentLogicalId(
      this.serverless.instanceId
    );

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayDeploymentLogicalId]: {
        Type: 'AWS::ApiGateway::Deployment',
        Properties: {
          RestApiId: this.provider.getApiGatewayRestApiId(),
          StageName: this.provider.getApiGatewayStage(),
          Description: this.provider.getApiGatewayDescription(),
        },
        DependsOn: this.apiGatewayMethodLogicalIds,
      },
    });

    // create CLF Output for endpoint
    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
      ServiceEndpoint: {
        Description: 'URL of the service endpoint',
        Value: {
          'Fn::Join': [
            '',
            [
              'https://',
              this.provider.getApiGatewayRestApiId(),
              '.execute-api.',
              { Ref: 'AWS::Region' },
              '.',
              { Ref: 'AWS::URLSuffix' },
              `/${this.provider.getStage()}`,
            ],
          ],
        },
      },
    });
  },
};
