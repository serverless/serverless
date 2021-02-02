'use strict';

const _ = require('lodash');
const awsArnRegExs = require('../../../../../utils/arnRegularExpressions');

module.exports = {
  compileAuthorizers() {
    this.validated.events.forEach((event) => {
      if (event.http.authorizer && event.http.authorizer.arn) {
        const authorizer = event.http.authorizer;
        const authorizerProperties = {
          AuthorizerResultTtlInSeconds: authorizer.resultTtlInSeconds,
          IdentitySource: authorizer.identitySource,
          Name: authorizer.name,
          RestApiId: this.provider.getApiGatewayRestApiId(),
        };

        if (typeof authorizer.identityValidationExpression === 'string') {
          Object.assign(authorizerProperties, {
            IdentityValidationExpression: authorizer.identityValidationExpression,
          });
        }

        const authorizerLogicalId = this.provider.naming.getAuthorizerLogicalId(authorizer.name);

        if (
          (authorizer.type || '').toUpperCase() === 'COGNITO_USER_POOLS' ||
          (typeof authorizer.arn === 'string' &&
            awsArnRegExs.cognitoIdpArnExpr.test(authorizer.arn))
        ) {
          authorizerProperties.Type = 'COGNITO_USER_POOLS';
          authorizerProperties.ProviderARNs = [authorizer.arn];
        } else {
          authorizerProperties.AuthorizerUri = {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                authorizer.arn,
                '/invocations',
              ],
            ],
          };
          authorizerProperties.Type = authorizer.type ? authorizer.type.toUpperCase() : 'TOKEN';
        }

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [authorizerLogicalId]: {
            Type: 'AWS::ApiGateway::Authorizer',
            Properties: authorizerProperties,
          },
        });
      }
    });
  },
};
