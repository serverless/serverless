'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileAuthorizers() {
    this.validated.events.forEach((event) => {
      if (event.http.authorizer) {
        const authorizer = event.http.authorizer;
        const authorizerProperties = {
          AuthorizerResultTtlInSeconds: authorizer.resultTtlInSeconds,
          IdentitySource: authorizer.identitySource,
          Name: authorizer.name,
          RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
        };

        if (typeof authorizer.identityValidationExpression === 'string') {
          _.assign(authorizerProperties, {
            IdentityValidationExpression: authorizer.identityValidationExpression,
          });
        }

        const authorizerLogicalId = this.provider.naming.getAuthorizerLogicalId(authorizer.name);

        if (typeof authorizer.arn === 'string' && authorizer.arn.match(/^arn:aws:cognito-idp/)) {
          authorizerProperties.Type = 'COGNITO_USER_POOLS';
          authorizerProperties.ProviderARNs = [authorizer.arn];
        } else {
          authorizerProperties.AuthorizerUri =
          { 'Fn::Join': ['',
            [
              'arn:aws:apigateway:',
              { Ref: 'AWS::Region' },
              ':lambda:path/2015-03-31/functions/',
              authorizer.arn,
              '/invocations',
            ],
          ] };
          authorizerProperties.Type = 'TOKEN';
        }

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [authorizerLogicalId]: {
            Type: 'AWS::ApiGateway::Authorizer',
            Properties: authorizerProperties,
          },
        });
      }
    });
    return BbPromise.resolve();
  },
};
