'use strict';

module.exports = {
  getMethodAuthorization(http) {
    if (http.authorizer) {
      const authorizerLogicalId = this.provider.naming
        .getAuthorizerLogicalId(http.authorizer.name);

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
