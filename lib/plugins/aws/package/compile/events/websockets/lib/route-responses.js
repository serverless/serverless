'use strict';

module.exports = {
  compileRouteResponses() {
    this.validated.events.forEach((event) => {
      if (!event.routeResponseSelectionExpression) {
        return;
      }

      const websocketsRouteResponseLogicalId =
        this.provider.naming.getWebsocketsRouteResponseLogicalId(event.route);

      const websocketsRouteLogicalId = this.provider.naming.getWebsocketsRouteLogicalId(
        event.route
      );

      Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsRouteResponseLogicalId]: {
          Type: 'AWS::ApiGatewayV2::RouteResponse',
          Properties: {
            ApiId: this.provider.getApiGatewayWebsocketApiId(),
            RouteId: {
              Ref: websocketsRouteLogicalId,
            },
            RouteResponseKey: '$default',
          },
        },
      });
    });
  },
};
