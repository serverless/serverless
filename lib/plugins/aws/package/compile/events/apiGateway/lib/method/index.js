'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileMethods() {
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
          RestApiId: this.provider.getApiGatewayRestApiId(),
        },
      };

      if (event.http.private) {
        template.Properties.ApiKeyRequired = true;
      } else {
        template.Properties.ApiKeyRequired = false;
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
        extraCognitoPoolClaims = _.map(claims, (claim) => {
          if (typeof claim === 'string') {
            const colonIndex = claim.indexOf(':');
            if (colonIndex !== -1) {
              const subClaim = claim.substring(colonIndex + 1);
              return `"${subClaim}": "$context.authorizer.claims['${claim}']"`;
            }
          }
          return `"${claim}": "$context.authorizer.claims.${claim}"`;
        });
      }
      const requestTemplates = template.Properties.Integration.RequestTemplates;
      _.forEach(requestTemplates, (value, key) => {
        let claimsString = '';
        if (extraCognitoPoolClaims && extraCognitoPoolClaims.length > 0) {
          claimsString = extraCognitoPoolClaims.join(',').concat(',');
        }
        requestTemplates[key] = value.replace('extraCognitoPoolClaims', claimsString);
      });

      this.apiGatewayMethodLogicalIds.push(methodLogicalId);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [methodLogicalId]: template,
      });
    });

    return BbPromise.resolve();
  },
};
