'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {

  compilePermissions() {
    this.validated.events.forEach((event) => {
      const lambdaPermissionLogicalId = this.provider.naming
        .getLambdaApiGatewayPermissionName(event.functionName);
      const lambdaLogicalId = this.provider.naming
        .getLogicalLambdaName(event.functionName);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [lambdaPermissionLogicalId]: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            },
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
          },
        },
      });

      if (event.http.authorizer) {
        const authorizer = event.http.authorizer;
        const authorizerPermissionLogicalId = this.provider.naming
          .getLambdaApiGatewayPermissionName(authorizer.name);

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [authorizerPermissionLogicalId]: {
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
