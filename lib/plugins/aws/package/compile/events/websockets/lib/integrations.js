'use strict';

const _ = require('lodash');

module.exports = {
  compileIntegrations() {
    this.validated.events.forEach((event) => {
      const websocketsIntegrationLogicalId = this.provider.naming.getWebsocketsIntegrationLogicalId(
        event.functionName
      );

      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(event.functionName);
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsIntegrationLogicalId]: {
          Type: 'AWS::ApiGatewayV2::Integration',
          Properties: {
            ApiId: this.provider.getApiGatewayWebsocketApiId(),
            IntegrationType: 'AWS_PROXY',
            IntegrationUri: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  { Ref: 'AWS::Partition' },
                  ':apigateway:',
                  { Ref: 'AWS::Region' },
                  ':lambda:path/2015-03-31/functions/',
                  { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] },
                  '/invocations',
                ],
              ],
            },
          },
        },
      });
    });
  },
};
