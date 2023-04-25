'use strict';

const _ = require('lodash');

module.exports = {
  compileMethods() {
    this.permissionMapping = [];

    this.validated.events.forEach((event) => {
      const resourceId = this.getResourceId(event.http.path);
      const resourceName = this.getResourceName(event.http.path);

      const requestParameters = {};
      if (event.http.request && event.http.request.parameters) {
        Object.entries(event.http.request.parameters).forEach(([key, value]) => {
          requestParameters[key] = (() => {
            if (!_.isObject(value)) return value;
            return value.required != null ? value.required : true;
          })();
        });
      }

      const apiGatewayPermission = this.provider.naming.getLambdaApiGatewayPermissionLogicalId(
        event.functionName
      );
      const template = {
        Type: 'AWS::ApiGateway::Method',
        Properties: {
          HttpMethod: event.http.method.toUpperCase(),
          RequestParameters: requestParameters,
          ResourceId: resourceId,
          RestApiId: this.provider.getApiGatewayRestApiId(),
          OperationName: event.http.operationId,
        },
        DependsOn: [apiGatewayPermission],
      };

      if (event.http.private) {
        template.Properties.ApiKeyRequired = true;
      } else {
        template.Properties.ApiKeyRequired = false;
      }

      const methodLogicalId = this.provider.naming.getMethodLogicalId(
        resourceName,
        event.http.method
      );

      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(event.functionName);
      const functionObject = this.serverless.service.functions[event.functionName];
      const lambdaAliasName = functionObject.targetAlias && functionObject.targetAlias.name;
      const lambdaAliasLogicalId =
        functionObject.targetAlias && functionObject.targetAlias.logicalId;

      const singlePermissionMapping = {
        resourceName,
        lambdaLogicalId,
        lambdaAliasName,
        lambdaAliasLogicalId,
        event,
      };
      this.permissionMapping.push(singlePermissionMapping);

      if (lambdaAliasLogicalId) {
        template.DependsOn.push(lambdaAliasLogicalId);
      }

      _.merge(
        template,
        this.getMethodAuthorization(event.http),
        this.getMethodIntegration(event.http, {
          lambdaLogicalId,
          lambdaAliasName,
        }),
        this.getMethodResponses(event.http)
      );

      let extraCognitoPoolClaims;
      if (event.http.authorizer) {
        const claims = event.http.authorizer.claims || [];
        extraCognitoPoolClaims = claims.map((claim) => {
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
      if (requestTemplates) {
        Object.entries(requestTemplates).forEach(([key, value]) => {
          let claimsString = '';
          if (extraCognitoPoolClaims && extraCognitoPoolClaims.length > 0) {
            claimsString = extraCognitoPoolClaims.join(',').concat(',');
          }
          requestTemplates[key] = value.replace('extraCognitoPoolClaims', claimsString);
        });
      }

      this.apiGatewayMethodLogicalIds.push(methodLogicalId);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [methodLogicalId]: template,
      });
    });
  },
};
