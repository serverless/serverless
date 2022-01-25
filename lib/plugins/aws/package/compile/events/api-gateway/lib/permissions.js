'use strict';

const awsArnRegExs = require('../../../../../utils/arn-regular-expressions');

module.exports = {
  compilePermissions() {
    const cfResources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    this.permissionMapping.forEach(
      ({ lambdaLogicalId, lambdaAliasName, lambdaAliasLogicalId, event }) => {
        const lambdaPermissionLogicalId =
          this.provider.naming.getLambdaApiGatewayPermissionLogicalId(event.functionName);

        const functionArnGetter = { 'Fn::GetAtt': [lambdaLogicalId, 'Arn'] };
        Object.assign(cfResources, {
          [lambdaPermissionLogicalId]: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: lambdaAliasName
                ? { 'Fn::Join': [':', [functionArnGetter, lambdaAliasName]] }
                : functionArnGetter,
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
            DependsOn: lambdaAliasLogicalId || undefined,
          },
        });

        if (event.http.authorizer && event.http.authorizer.arn) {
          const authorizer = event.http.authorizer;
          const authorizerPermissionLogicalId =
            this.provider.naming.getLambdaApiGatewayPermissionLogicalId(authorizer.name);

          if (
            (authorizer.type || '').toUpperCase() === 'COGNITO_USER_POOLS' ||
            (typeof authorizer.arn === 'string' &&
              awsArnRegExs.cognitoIdpArnExpr.test(authorizer.arn))
          ) {
            return;
          }
          if (cfResources[authorizerPermissionLogicalId]) return;

          if (authorizer.managedExternally) return;

          Object.assign(cfResources, {
            [authorizerPermissionLogicalId]: {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: authorizer.logicalId ? { Ref: authorizer.logicalId } : authorizer.arn,
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
            },
          });
        }
      }
    );
  },
};
