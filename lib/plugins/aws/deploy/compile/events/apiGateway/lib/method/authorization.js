'use strict';

module.exports = {
  getMethodAuthorization(http) {
    if (http.authorizer) {
      const normalizedAuthorizerName = http.authorizer.name[0].toUpperCase()
        + http.authorizer.name.substr(1);
      const authorizerLogicalId = `${normalizedAuthorizerName}ApiGatewayAuthorizer`;

      return {
        Properties: {
          AuthorizationType: 'CUSTOM',
          AuthorizerId: { Ref: authorizerLogicalId },
        },
        DependsOn: authorizerLogicalId,
      };
    }
    return {
      Properties: {
        AuthorizationType: 'NONE',
      },
    };
  },
};
