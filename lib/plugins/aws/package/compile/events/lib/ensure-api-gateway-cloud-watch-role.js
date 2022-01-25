'use strict';

const { memoize } = require('lodash');
const BbPromise = require('bluebird');
const { addCustomResourceToService } = require('../../../../custom-resources');

module.exports = memoize(async (provider) =>
  BbPromise.try(() => {
    // There may be a specific role ARN provided in the configuration
    const config = provider.serverless.service.provider;
    const restApi = config.logs && config.logs.restApi;
    const configuredRoleArn = restApi && restApi.role;

    // Check for CloudWatch role may be disabled, if so, skip it
    const configuredRoleManagedExternally = restApi && restApi.roleManagedExternally;
    if (configuredRoleManagedExternally) {
      return null;
    }

    const cfTemplate = provider.serverless.service.provider.compiledCloudFormationTemplate;
    const customResourceLogicalId =
      provider.naming.getCustomResourceApiGatewayAccountCloudWatchRoleResourceLogicalId();
    const customResourceFunctionLogicalId =
      provider.naming.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId();

    cfTemplate.Resources[customResourceLogicalId] = {
      Type: 'Custom::ApiGatewayAccountRole',
      Version: 1.0,
      Properties: {
        ServiceToken: {
          'Fn::GetAtt': [customResourceFunctionLogicalId, 'Arn'],
        },
        RoleArn: configuredRoleArn,
      },
    };

    return addCustomResourceToService(provider, 'apiGatewayCloudWatchRole', [
      {
        Effect: 'Allow',
        Resource: {
          'Fn::Join': [
            ':',
            ['arn', { Ref: 'AWS::Partition' }, 'iam:', { Ref: 'AWS::AccountId' }, 'role/*'],
          ],
        },
        Action: [
          'iam:AttachRolePolicy',
          'iam:CreateRole',
          'iam:ListAttachedRolePolicies',
          'iam:PassRole',
        ],
      },
      {
        Effect: 'Allow',
        Resource: {
          'Fn::Join': [':', ['arn', { Ref: 'AWS::Partition' }, 'apigateway:*::/account']],
        },
        Action: ['apigateway:GET', 'apigateway:PATCH'],
      },
    ]);
  })
);
