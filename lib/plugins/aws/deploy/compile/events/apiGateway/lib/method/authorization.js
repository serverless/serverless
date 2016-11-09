'use strict';

const _ = require('lodash');

module.exports = {
  getMethodAuthorization(http) {
    if (http.authorizer) {
      const authorizerLogicalId = this.provider.naming
        .getLogicalAuthorizerName(http.authorizer.name);

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
