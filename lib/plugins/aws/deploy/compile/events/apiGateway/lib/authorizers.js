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

        const authorizerLogicalId = this.provider.naming.getLogicalAuthorizerName(authorizer.name);

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
