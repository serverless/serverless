'use strict';

module.exports = {
  getMethodAuthorization(http) {
    if (http.authorizer) {
      const authorizerLogicalId = this.provider.naming
        .getAuthorizerLogicalId(http.authorizer.name);

      let authorizationType;
      const authorizerArn = http.authorizer.arn;
      if (http.authorizer.poolarn) {
        authorizationType = 'COGNITO_USER_POOLS';
      } else {
        authorizationType = 'CUSTOM';
      }

      return {
        Properties: {
          AuthorizationType: authorizationType,
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
