'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRoutes() {
    this.validated.events.forEach(event => {
      const websocketsIntegrationLogicalId = this.provider.naming
        .getWebsocketsIntegrationLogicalId(event.functionName);

      const websocketsRouteLogicalId = this.provider.naming
        .getWebsocketsRouteLogicalId(event.route);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsRouteLogicalId]: {
          Type: 'AWS::ApiGatewayV2::Route',
          Properties: {
            ApiId: {
              Ref: this.websocketsApiLogicalId,
            },
            RouteKey: event.route,
            AuthorizationType: 'NONE',
            Target: {
              'Fn::Join': ['/',
                [
                  'integrations',
                  { Ref: websocketsIntegrationLogicalId },
                ],
              ],
            },
          },
        },
      });
    });

    return BbPromise.resolve();
  },
};
