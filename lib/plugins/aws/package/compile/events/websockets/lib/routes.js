'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRoutes() {
    this.validated.events.forEach(event => {
      const websocketsIntegrationLogicalId = this.provider.naming.getWebsocketsIntegrationLogicalId(
        event.functionName
      );

      const websocketsRouteLogicalId = this.provider.naming.getWebsocketsRouteLogicalId(
        event.route
      );

      const routeTemplate = {
        [websocketsRouteLogicalId]: {
          Type: 'AWS::ApiGatewayV2::Route',
          Properties: {
            ApiId: this.provider.getApiGatewayWebsocketApiId(),
            RouteKey: event.route,
            AuthorizationType: 'NONE',
            Target: {
              'Fn::Join': ['/', ['integrations', { Ref: websocketsIntegrationLogicalId }]],
            },
          },
        },
      };

      if (event.authorizer) {
        routeTemplate[websocketsRouteLogicalId].Properties.AuthorizationType = 'CUSTOM';
        routeTemplate[websocketsRouteLogicalId].Properties.AuthorizerId = {
          Ref: this.provider.naming.getWebsocketsAuthorizerLogicalId(event.authorizer.name),
        };
      }
      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        routeTemplate
      );
    });

    return BbPromise.resolve();
  },
};
