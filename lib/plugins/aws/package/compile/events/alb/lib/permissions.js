'use strict';

const _ = require('lodash');
const resolveLambdaTarget = require('../../../../../utils/resolve-lambda-target');

module.exports = {
  compilePermissions() {
    this.validated.events.forEach((event) => {
      const { functionName, albId, multiValueHeaders } = event;

      const albPermissionLogicalId =
        this.provider.naming.getLambdaAlbPermissionLogicalId(functionName);
      const registerTargetPermissionLogicalId =
        this.provider.naming.getLambdaRegisterTargetPermissionLogicalId(functionName);
      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        functionName,
        albId,
        multiValueHeaders
      );

      const functionObj = this.serverless.service.getFunction(functionName);
      const albInvokePermission = {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: resolveLambdaTarget(functionName, functionObj),
          Action: 'lambda:InvokeFunction',
          Principal: 'elasticloadbalancing.amazonaws.com',
        },
      };
      const { targetAlias } = this.serverless.service.functions[functionName];
      if (targetAlias) {
        albInvokePermission.DependsOn = [targetAlias.logicalId];
      }
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [albPermissionLogicalId]: _.merge({}, albInvokePermission, {
          Properties: {
            SourceArn: {
              Ref: targetGroupLogicalId,
            },
          },
        }),
        [registerTargetPermissionLogicalId]: albInvokePermission,
      });
    });
  },
};
