'use strict';

const _ = require('lodash');

module.exports = {
  getMethodAuthorization(http) {
    if (_.get(http, 'authorizer.type') === 'AWS_IAM') {
      return {
        Properties: {
          AuthorizationType: 'AWS_IAM',
        },
      };
    }

    if (http.authorizer) {
      const authorizerLogicalId = this.provider.naming
        .getAuthorizerLogicalId(http.authorizer.name);

      let authorizationType;
      const authorizerArn = http.authorizer.arn;
      if (typeof authorizerArn === 'string' && authorizerArn.match(/^arn:aws:cognito-idp/)) {
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
