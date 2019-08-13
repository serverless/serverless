'use strict';

const _ = require('lodash');
const awsArnRegExs = require('../../../../../../utils/arnRegularExpressions');

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
      if (http.authorizer.type && http.authorizer.authorizerId) {
        const authReturn = {
          Properties: {
            AuthorizationType: http.authorizer.type,
            AuthorizerId: http.authorizer.authorizerId,
          },
        };
        if (
          http.authorizer.type === 'COGNITO_USER_POOLS' &&
          http.authorizer.scopes &&
          http.authorizer.scopes.length
        ) {
          authReturn.Properties.AuthorizationScopes = http.authorizer.scopes;
        }
        return authReturn;
      }

      const authorizerLogicalId = this.provider.naming.getAuthorizerLogicalId(http.authorizer.name);

      const authorizerArn = http.authorizer.arn;

      let authorizationType;
      if (typeof authorizerArn === 'string' && awsArnRegExs.cognitoIdpArnExpr.test(authorizerArn)) {
        authorizationType = 'COGNITO_USER_POOLS';
        const cognitoReturn = {
          Properties: {
            AuthorizationType: authorizationType,
            AuthorizerId: { Ref: authorizerLogicalId },
          },
          DependsOn: authorizerLogicalId,
        };
        if (http.authorizer.scopes && http.authorizer.scopes.length) {
          cognitoReturn.Properties.AuthorizationScopes = http.authorizer.scopes;
        }
        return cognitoReturn;
      }
      authorizationType = 'CUSTOM';
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
