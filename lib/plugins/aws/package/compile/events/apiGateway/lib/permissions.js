'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {

  compilePermissions() {
    this.permissionMapping.forEach((singlePermissionMapping) => {
      const lambdaPermissionLogicalId = this.provider.naming
        .getLambdaApiGatewayPermissionLogicalId(singlePermissionMapping.event.functionName);

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
                '/*/*',
              ],
            ] },
          },
        },
      });

      if (singlePermissionMapping.event.http.authorizer) {
        const authorizer = singlePermissionMapping.event.http.authorizer;
        const authorizerPermissionLogicalId = this.provider.naming
          .getLambdaApiGatewayPermissionLogicalId(authorizer.name);

        if (typeof authorizer.arn === 'string' && authorizer.arn.match(/^arn:aws:cognito-idp/)) {
          return;
        }

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
