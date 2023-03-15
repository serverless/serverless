'use strict';

const _ = require('lodash');
const awsArnRegExs = require('../../../../../../utils/arn-regular-expressions');

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
        const authorizationType = (() => {
          if (
            http.authorizer.type.toUpperCase() === 'TOKEN' ||
            http.authorizer.type.toUpperCase() === 'REQUEST'
          ) {
            return 'CUSTOM';
          }

          return http.authorizer.type;
        })();

        const authReturn = {
          Properties: {
            AuthorizationType: authorizationType,
            AuthorizerId: http.authorizer.authorizerId,
          },
        };
        if (
          http.authorizer.type.toUpperCase() === 'COGNITO_USER_POOLS' &&
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
      if (
        (http.authorizer.type || '').toUpperCase() === 'COGNITO_USER_POOLS' ||
        (typeof authorizerArn === 'string' && awsArnRegExs.cognitoIdpArnExpr.test(authorizerArn))
      ) {
        authorizationType = 'COGNITO_USER_POOLS';
        const cognitoReturn = {
          Properties: {
            AuthorizationType: authorizationType,
            AuthorizerId: { Ref: authorizerLogicalId },
          },
          DependsOn: [authorizerLogicalId],
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
        DependsOn: [authorizerLogicalId],
      };
    }

    return {
      Properties: {
        AuthorizationType: 'NONE',
      },
    };
  },
};
