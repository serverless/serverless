'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {

  compilePermissions() {
    this.permissionMapping.forEach((singlePermissionMapping) => {
      const lambdaPermissionLogicalId = this.provider.naming
        .getLambdaApiGatewayPermissionLogicalId(singlePermissionMapping.event.functionName,
          singlePermissionMapping.resourceName,
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
            SourceArn: { 'Fn::Join': ['',
              [
                'arn:aws:execute-api:',
                { Ref: 'AWS::Region' },
                ':',
                { Ref: 'AWS::AccountId' },
                ':',
                { Ref: this.apiGatewayRestApiLogicalId },
                `/*/${singlePermissionMapping.event.http.method
                  .toUpperCase()}/${singlePermissionMapping.event.http.path}`,
              ],
            ] },
          },
        },
      });

      if (singlePermissionMapping.event.http.authorizer) {
        const authorizer = singlePermissionMapping.event.http.authorizer;
        const authorizerPermissionLogicalId = this.provider.naming
          .getLambdaApiGatewayAuthorizerPermissionLogicalId(authorizer.name);

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
