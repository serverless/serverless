import _ from 'lodash'
import awsArnRegExs from '../../../../../../utils/arn-regular-expressions.js'

export default {
  getMethodAuthorization(http) {
    if (_.get(http, 'authorizer.type') === 'AWS_IAM') {
      return {
        Properties: {
          AuthorizationType: 'AWS_IAM',
        },
      }
    }

    if (http.authorizer) {
      if (http.authorizer.type === 'JWT' && http.authorizer.jwtLogicalId) {
        const jwtReturn = {
          Properties: {
            AuthorizationType: 'JWT',
            AuthorizerId: { Ref: http.authorizer.jwtLogicalId },
          },
          DependsOn: [http.authorizer.jwtLogicalId],
        }
        if (http.authorizer.scopes && http.authorizer.scopes.length) {
          jwtReturn.Properties.AuthorizationScopes = http.authorizer.scopes
        }
        return jwtReturn
      }

      if (http.authorizer.type && http.authorizer.authorizerId) {
        const authorizationType = (() => {
          if (
            http.authorizer.type.toUpperCase() === 'TOKEN' ||
            http.authorizer.type.toUpperCase() === 'REQUEST'
          ) {
            return 'CUSTOM'
          }

          // Only JWT is normalized: other types keep the value as written,
          // so existing templates compile unchanged.
          if (http.authorizer.type.toUpperCase() === 'JWT') return 'JWT'
          return http.authorizer.type
        })()

        const authReturn = {
          Properties: {
            AuthorizationType: authorizationType,
            AuthorizerId: http.authorizer.authorizerId,
          },
        }
        if (
          (authorizationType.toUpperCase() === 'COGNITO_USER_POOLS' ||
            authorizationType === 'JWT') &&
          http.authorizer.scopes &&
          http.authorizer.scopes.length
        ) {
          authReturn.Properties.AuthorizationScopes = http.authorizer.scopes
        }
        return authReturn
      }

      const authorizerLogicalId = this.provider.naming.getAuthorizerLogicalId(
        http.authorizer.name,
      )

      const authorizerArn = http.authorizer.arn

      let authorizationType
      if (
        (http.authorizer.type || '').toUpperCase() === 'COGNITO_USER_POOLS' ||
        (typeof authorizerArn === 'string' &&
          awsArnRegExs.cognitoIdpArnExpr.test(authorizerArn))
      ) {
        authorizationType = 'COGNITO_USER_POOLS'
        const cognitoReturn = {
          Properties: {
            AuthorizationType: authorizationType,
            AuthorizerId: { Ref: authorizerLogicalId },
          },
          DependsOn: [authorizerLogicalId],
        }
        if (http.authorizer.scopes && http.authorizer.scopes.length) {
          cognitoReturn.Properties.AuthorizationScopes = http.authorizer.scopes
        }
        return cognitoReturn
      }
      authorizationType = 'CUSTOM'
      return {
        Properties: {
          AuthorizationType: authorizationType,
          AuthorizerId: { Ref: authorizerLogicalId },
        },
        DependsOn: [authorizerLogicalId],
      }
    }

    return {
      Properties: {
        AuthorizationType: 'NONE',
      },
    }
  },
}
