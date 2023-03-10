'use strict';

const _ = require('lodash');
const resolveLambdaTarget = require('../../../../../utils/resolve-lambda-target');

module.exports = {
  compileIntegrations() {
    this.validated.events.forEach((event) => {
      const websocketsIntegrationLogicalId = this.provider.naming.getWebsocketsIntegrationLogicalId(
        event.functionName
      );
      const functionObj = this.serverless.service.getFunction(event.functionName);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsIntegrationLogicalId]: {
          Type: 'AWS::ApiGatewayV2::Integration',
          DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
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
                  resolveLambdaTarget(event.functionName, functionObj),
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
