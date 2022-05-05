'use strict';

const _ = require('lodash');

module.exports = {
  compileApi() {
    const apiGateway = this.serverless.service.provider.apiGateway || {};

    // immediately return if we're using an external websocket API id
    if (apiGateway.websocketApiId) {
      return;
    }

    this.websocketsApiLogicalId = this.provider.naming.getWebsocketsApiLogicalId();

    const RouteSelectionExpression = _.get(
      this.provider,
      'serverless.service.provider.websockets.routeSelectionExpression'
    )
      ? this.serverless.service.provider.websockets.routeSelectionExpression ||
        '$request.body.action'
      : this.serverless.service.provider.websocketsRouteSelectionExpression ||
        '$request.body.action';

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.websocketsApiLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: {
          Name: this.provider.naming.getWebsocketsApiName(),
          RouteSelectionExpression,
          Description: this.serverless.service.provider.websockets
            ? this.serverless.service.provider.websockets.description || 'Serverless Websockets'
            : this.serverless.service.provider.websocketsDescription || 'Serverless Websockets',
          ProtocolType: 'WEBSOCKET',
        },
      },
    });

    const defaultRoleResource =
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        this.provider.naming.getRoleLogicalId()
      ];

    if (defaultRoleResource) {
      // insert policy that allows functions to postToConnection
      const websocketsPolicy = {
        Effect: 'Allow',
        Action: ['execute-api:ManageConnections'],
        Resource: [{ 'Fn::Sub': 'arn:${AWS::Partition}:execute-api:*:*:*/@connections/*' }],
      };

      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        this.provider.naming.getRoleLogicalId()
      ].Properties.Policies[0].PolicyDocument.Statement.push(websocketsPolicy);
    }
  },
};
