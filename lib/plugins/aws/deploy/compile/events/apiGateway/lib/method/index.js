'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

  compileMethods() {
    this.apiGatewayMethodLogicalIds = [];
    this.permissionMapping = [];

    this.validated.events.forEach((event) => {
      const resourceId = this.getResourceId(event.http.path);
      const resourceName = this.getResourceName(event.http.path);
      const requestParameters = (event.http.request && event.http.request.parameters) || {};

      const template = {
        Type: 'AWS::ApiGateway::Method',
        Properties: {
          HttpMethod: event.http.method.toUpperCase(),
          RequestParameters: requestParameters,
          ResourceId: resourceId,
          RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
        },
      };

      if (event.http.private) {
        template.Properties.ApiKeyRequired = true;
      }

      const methodLogicalId = this.provider.naming
        .getMethodLogicalId(resourceName, event.http.method);
      const lambdaLogicalId = this.provider.naming
        .getLambdaLogicalId(event.functionName);

      const singlePermissionMapping = { resourceName, lambdaLogicalId, event };
      this.permissionMapping.push(singlePermissionMapping);

      _.merge(template,
        this.getMethodAuthorization(event.http),
        this.getMethodIntegration(event.http, lambdaLogicalId, methodLogicalId),
        this.getMethodResponses(event.http)
      );

      let extraCognitoPoolClaims;
      if (event.http.authorizer) {
        const claims = event.http.authorizer.claims || [];
        extraCognitoPoolClaims = _.map(claims, claim =>
            `"${claim}": "$context.authorizer.claims.${claim}",`
        );
      }
      const requestTemplates = template.Properties.Integration.RequestTemplates;
      _.forEach(requestTemplates, (value, key) => {
        requestTemplates[key] =
          value.replace('extraCognitoPoolClaims', extraCognitoPoolClaims || '');
      });

      this.apiGatewayMethodLogicalIds.push(methodLogicalId);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [methodLogicalId]: template,
      });
    });

    return BbPromise.resolve();
  },
};
