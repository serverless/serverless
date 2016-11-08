'use strict';

const _ = require('lodash');

module.exports = {
  getMethodAuthorization(http) {
    if (http.authorizer) {
      const normalizedAuthorizerName = _.capitalize(http.authorizer.name);
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
