'use strict';

const _ = require('lodash');

module.exports = {
  compileApi() {
    const apiGateway = this.serverless.service.provider.apiGateway || {};

    // immediately return if we're using an external websocket API id
    if (apiGateway.websocketApiId) {
      return;
    }

    if (
      this.serverless.service.provider.tags &&
      (!this.serverless.service.provider.websocket ||
        !this.serverless.service.provider.websocket.useProviderTags)
    ) {
      this.serverless._logDeprecation(
        'AWS_WEBSOCKET_API_USE_PROVIDER_TAGS',
        'Starting with next major version, the provider tags ' +
          'will be applied to Websocket Api Gateway by default. \n' +
          'Set "provider.websocket.useProviderTags" to "true" ' +
          'to adapt to the new behavior now.'
      );
    }

    this.websocketsApiLogicalId = this.provider.naming.getWebsocketsApiLogicalId();

    const RouteSelectionExpression =
      this.serverless.service.provider.websocketsApiRouteSelectionExpression ||
      '$request.body.action';

    const properties = {
      Name: this.provider.naming.getWebsocketsApiName(),
      RouteSelectionExpression,
      Description:
        this.serverless.service.provider.websocketsDescription || 'Serverless Websockets',
      ProtocolType: 'WEBSOCKET',
    };

    // Tags
    if (
      this.serverless.service.provider.tags &&
      this.serverless.service.provider.websocket &&
      this.serverless.service.provider.websocket.useProviderTags
    ) {
      const tags = Object.assign({}, this.serverless.service.provider.tags);
      properties.Tags = tags;
    }

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.websocketsApiLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: properties,
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
