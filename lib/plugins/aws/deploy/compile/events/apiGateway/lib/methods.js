'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

  compileMethods(http) {
    this.methodLogicalIds = [];

    _.forEach(http.events, (httpEvent) => {
      const resourceId = this.getResourceId(httpEvent.path);
      const resourceName = this.getResourceName(httpEvent.path);
      const requestParameters = (httpEvent.request && httpEvent.request.parameters) || {};

      const template = {
        Type: 'AWS::ApiGateway::Method',
        Properties: {
          HttpMethod: httpEvent.method.toUpperCase(),
          RequestParameters: requestParameters,
          ResourceId: resourceId,
          RestApiId: { Ref: this.restApiLogicalId },
        },
      };

      if (httpEvent.private) {
        template.Properties.ApiKeyRequired = true;
      }

      _.merge(template,
        this.getMethodAuthorization(httpEvent),
        this.getMethodIntegration(httpEvent),
        this.getMethodResponses(httpEvent)
      );

      const methodName = httpEvent.method[0].toUpperCase() +
        httpEvent.method.substr(1).toLowerCase();
      const methodLogicalId = `ApiGatewayMethod${resourceName}${methodName}`;

      this.methodLogicalIds.push(methodLogicalId);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [methodLogicalId]: template,
      });
    });

    return BbPromise.resolve();
  },
};
