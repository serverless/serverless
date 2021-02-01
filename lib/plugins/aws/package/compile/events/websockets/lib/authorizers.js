'use strict';

const _ = require('lodash');

module.exports = {
  compileAuthorizers() {
    this.validated.events.forEach((event) => {
      if (!event.authorizer) {
        return;
      }
      const websocketsAuthorizerLogicalId = this.provider.naming.getWebsocketsAuthorizerLogicalId(
        event.authorizer.name
      );

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsAuthorizerLogicalId]: {
          Type: 'AWS::ApiGatewayV2::Authorizer',
          Properties: {
            ApiId: this.provider.getApiGatewayWebsocketApiId(),
            Name: event.authorizer.name,
            AuthorizerType: 'REQUEST',
            AuthorizerUri: event.authorizer.uri,
            IdentitySource: event.authorizer.identitySource,
          },
        },
      });
    });

    return;
  },
};
