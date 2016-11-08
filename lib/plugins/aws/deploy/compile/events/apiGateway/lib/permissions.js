'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {

  compilePermissions() {
    this.validated.events.forEach((event) => {
      const normalizedFunctionName = _.capitalize(event.functionName);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [`${normalizedFunctionName}LambdaPermissionApiGateway`]: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [`${normalizedFunctionName}LambdaFunction`, 'Arn'],
            },
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
          },
        },
      });

      if (event.http.authorizer) {
        const authorizer = event.http.authorizer;
        const normalizedAuthorizerName = _.capitalize(authorizer.name);

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [`${normalizedAuthorizerName}LambdaPermissionApiGateway`]: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: authorizer.arn,
              Action: 'lambda:InvokeFunction',
              Principal: 'apigateway.amazonaws.com',
            },
          },
        });
      }
    });

    return BbPromise.resolve();
  },
};
