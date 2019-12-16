'use strict';

module.exports = {
  compileTargetGroups() {
    this.validated.events.forEach(event => {
      const { functionName, albId, multiValueHeaders = false } = event;

      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        functionName,
        albId,
        multiValueHeaders
      );
      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
      const registerTargetPermissionLogicalId = this.provider.naming.getLambdaRegisterTargetPermissionLogicalId(
        functionName
      );

      const TargetGroup = {
        Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        Properties: {
          TargetType: 'lambda',
          Targets: [
            {
              Id: {
                'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
              },
            },
          ],
          Name: this.provider.naming.getAlbTargetGroupName(functionName, albId, multiValueHeaders),
          Tags: [
            {
              Key: 'Name',
              Value: this.provider.naming.getAlbTargetGroupNameTagValue(functionName, albId),
            },
          ],
          TargetGroupAttributes: [
            {
              Key: 'lambda.multi_value_headers.enabled',
              Value: multiValueHeaders,
            },
          ],
        },
        DependsOn: [registerTargetPermissionLogicalId],
      };
      Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [targetGroupLogicalId]: TargetGroup,
      });
    });
  },
};
