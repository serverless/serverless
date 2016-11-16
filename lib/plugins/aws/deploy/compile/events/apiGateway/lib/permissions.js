'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {

  compilePermissions() {
    this.permissionMapping.forEach((singlePermissionMapping) => {
      const lambdaPermissionLogicalId = this.provider.naming
        .getLambdaApiGatewayPermissionLogicalId(singlePermissionMapping.event.functionName,
          singlePermissionMapping.event.http.method);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [lambdaPermissionLogicalId]: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [singlePermissionMapping.lambdaLogicalId, 'Arn'],
            },
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
            SourceArn: {
              'Fn::GetAtt': [singlePermissionMapping.methodLogicalId, 'Arn'],
            },
          },
        },
      });

      if (singlePermissionMapping.event.http.authorizer) {
        const authorizer = singlePermissionMapping.event.http.authorizer;
        const authorizerPermissionLogicalId = this.provider.naming
          .getLambdaApiGatewayPermissionLogicalId(authorizer.name);

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [authorizerPermissionLogicalId]: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: authorizer.arn,
              Action: 'lambda:InvokeFunction',
              Principal: 'apigateway.amazonaws.com',
              // no need for SourceArn here because authorizers
              // are created at the REST API Level
            },
          },
        });
      }
    });

    return BbPromise.resolve();
  },
};
