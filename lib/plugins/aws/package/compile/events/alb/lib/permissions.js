'use strict';

const _ = require('lodash');

module.exports = {
  compilePermissions() {
    this.validated.events.forEach(event => {
      const { functionName, albId, multiValueHeaders } = event;

      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
      const albPermissionLogicalId = this.provider.naming.getLambdaAlbPermissionLogicalId(
        functionName
      );
      const registerTargetPermissionLogicalId = this.provider.naming.getLambdaRegisterTargetPermissionLogicalId(
        functionName
      );
      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        functionName,
        albId,
        multiValueHeaders
      );

      const albInvokePermission = {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'elasticloadbalancing.amazonaws.com',
        },
      };

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
