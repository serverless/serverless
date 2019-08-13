'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileApi() {
    const apiGateway = this.serverless.service.provider.apiGateway || {};

    // immediately return if we're using an external websocket API id
    if (apiGateway.websocketApiId) {
      return BbPromise.resolve();
    }

    this.websocketsApiLogicalId = this.provider.naming.getWebsocketsApiLogicalId();

    const RouteSelectionExpression =
      this.serverless.service.provider.websocketsApiRouteSelectionExpression ||
      '$request.body.action';

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.websocketsApiLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: {
          Name: this.provider.naming.getWebsocketsApiName(),
          RouteSelectionExpression,
          Description:
            this.serverless.service.provider.websocketsDescription || 'Serverless Websockets',
          ProtocolType: 'WEBSOCKET',
        },
      },
    });

    const defaultRoleResource = this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[this.provider.naming.getRoleLogicalId()];

    if (defaultRoleResource) {
      // insert policy that allows functions to postToConnection
      const websocketsPolicy = {
        Effect: 'Allow',
        Action: ['execute-api:ManageConnections'],
        Resource: ['arn:aws:execute-api:*:*:*/@connections/*'],
      };

      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        this.provider.naming.getRoleLogicalId()
      ].Properties.Policies[0].PolicyDocument.Statement.push(websocketsPolicy);
    }

    return BbPromise.resolve();
  },
};
