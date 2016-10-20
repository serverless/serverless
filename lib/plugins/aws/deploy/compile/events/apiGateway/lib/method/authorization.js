'use strict';

module.exports = {
  getMethodAuthorization(httpEvent) {
    if (httpEvent.authorizer) {
      const normalizedAuthorizerName = httpEvent.authorizer.name[0].toUpperCase()
        + httpEvent.authorizer.name.substr(1);
      const authorizerLogicalId = `${normalizedAuthorizerName}ApiGatewayAuthorizer`;

      return {
        Properties: {
          AuthorizationType: 'CUSTOM',
          AuthorizerId: { Ref: authorizerLogicalId },
          DependsOn: authorizerLogicalId,
        },
      };
    }
    return {
      Properties: {
        AuthorizationType: 'NONE',
      },
    };
  },
};
