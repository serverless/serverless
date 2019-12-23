'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const awsArnRegExs = require('../../../../../utils/arnRegularExpressions');

module.exports = {
  compilePermissions() {
    this.permissionMapping.forEach(
      ({ lambdaLogicalId, lambdaAliasName, lambdaAliasLogicalId, event }) => {
        const lambdaPermissionLogicalId = this.provider.naming.getLambdaApiGatewayPermissionLogicalId(
          event.functionName
        );

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [lambdaPermissionLogicalId]: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                'Fn::Join': [
                  ':',
                  [
                    {
                      'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                    },
                    ...(lambdaAliasName ? [lambdaAliasName] : []),
                  ],
                ],
              },
              Action: 'lambda:InvokeFunction',
              Principal: 'apigateway.amazonaws.com',
              SourceArn: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':execute-api:',
                    { Ref: 'AWS::Region' },
                    ':',
                    { Ref: 'AWS::AccountId' },
                    ':',
                    this.provider.getApiGatewayRestApiId(),
                    '/*/*',
                  ],
                ],
              },
            },
            DependsOn: lambdaAliasLogicalId,
          },
        });

        if (event.http.authorizer && event.http.authorizer.arn) {
          const authorizer = event.http.authorizer;
          const authorizerPermissionLogicalId = this.provider.naming.getLambdaApiGatewayPermissionLogicalId(
            authorizer.name
          );

          if (
            typeof authorizer.arn === 'string' &&
            awsArnRegExs.cognitoIdpArnExpr.test(authorizer.arn)
          ) {
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
      }
    );

    return BbPromise.resolve();
  },
};
