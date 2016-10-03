'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileAuthorizers(http) {
    _.forEach(http.events, (httpEvent) => {
      if (httpEvent.authorizer) {
        const authorizer = httpEvent.authorizer;
        const identitySource = authorizer.identitySource || 'method.request.header.Authorization';
        const resultTtlInSeconds = authorizer.resultTtlInSeconds ?
          Number.parseInt(authorizer.resultTtlInSeconds, 10) : 300;

        const authorizerTemplate = {
          Type: 'AWS::ApiGateway::Authorizer',
          Properties: {
            AuthorizerResultTtlInSeconds: resultTtlInSeconds,
            AuthorizerUri: { 'Fn::Join': ['',
              [
                'arn:aws:apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                authorizer.arn,
                '/invocations',
              ],
            ] },
            IdentitySource: identitySource,
            Name: authorizer.name,
            RestApiId: { Ref: this.restApiLogicalId },
            Type: 'TOKEN',
          },
        };

        if (typeof authorizer.identityValidationExpression === 'string') {
          authorizerTemplate.Properties.IdentityValidationExpression =
            authorizer.identityValidationExpression;
        }

        const normalizedAuthorizerName = authorizer.name[0].toUpperCase()
          + authorizer.name.substr(1);
        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [`${normalizedAuthorizerName}ApiGatewayAuthorizer`]: authorizerTemplate,
        });
      }
    });
    return BbPromise.resolve();
  },
};
