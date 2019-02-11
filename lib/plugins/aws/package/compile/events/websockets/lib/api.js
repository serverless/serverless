'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileApi() {
    this.websocketsApiLogicalId = this.provider.naming.getWebsocketsApiLogicalId();

    const RouteSelectionExpression = this.serverless.service.provider
        .websocketsApiRouteSelectionExpression || '$request.body.action';

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.websocketsApiLogicalId]: {
        Type: 'AWS::ApiGatewayV2::Api',
        Properties: {
          Name: this.provider.naming.getWebsocketsApiName(),
          RouteSelectionExpression,
          Description: this.serverless.service.provider.websocketsDescription || '',
          ProtocolType: 'WEBSOCKET',
        },
      },
    });

    return BbPromise.resolve();
  },
};
