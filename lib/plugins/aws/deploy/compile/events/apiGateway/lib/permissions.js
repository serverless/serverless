'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {

  compilePermissions(http) {
    const permissions = {};

    _.forEach(http.events, (httpEvent) => {
      const functionName = httpEvent.functionName;

      if (!(functionName in permissions)) {
        permissions[functionName] = true;
        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [`${functionName}LambdaPermissionApiGateway`]: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                'Fn::GetAtt': [`${functionName}LambdaFunction`, 'Arn'],
              },
              Action: 'lambda:InvokeFunction',
              Principal: 'apigateway.amazonaws.com',
            },
          },
        });
      }

      if (httpEvent.authorizer) {
        const normalizedAuthorizerName = httpEvent.authorizer.name[0].toUpperCase()
          + httpEvent.authorizer.name.substr(1);
        if (!(normalizedAuthorizerName in permissions)) {
          permissions[normalizedAuthorizerName] = true;
          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
            [`${normalizedAuthorizerName}LambdaPermissionApiGateway`]: {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: httpEvent.authorizer.arn,
                Action: 'lambda:InvokeFunction',
                Principal: 'apigateway.amazonaws.com',
              },
            },
          });
        }
      }
    });

    return BbPromise.resolve();
  },
};
