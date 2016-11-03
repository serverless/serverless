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
          AuthorizerUri: { 'Fn::Join': ['',
            [
              'arn:aws:apigateway:',
              { Ref: 'AWS::Region' },
              ':lambda:path/2015-03-31/functions/',
              authorizer.arn,
              '/invocations',
            ],
          ] },
          IdentitySource: authorizer.identitySource,
          Name: authorizer.name,
          RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
          Type: 'TOKEN',
        };

        if (typeof authorizer.identityValidationExpression === 'string') {
          _.assign(authorizerProperties, {
            IdentityValidationExpression: authorizer.identityValidationExpression,
          });
        }

        const normalizedAuthorizerName = authorizer.name[0].toUpperCase()
          + authorizer.name.substr(1);

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [`${normalizedAuthorizerName}ApiGatewayAuthorizer`]: {
            Type: 'AWS::ApiGateway::Authorizer',
            Properties: authorizerProperties,
          },
        });
      }
    });
    return BbPromise.resolve();
  },
};
