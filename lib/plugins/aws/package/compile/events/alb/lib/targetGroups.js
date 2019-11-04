'use strict';

module.exports = {
  compileTargetGroups() {
    this.validated.events.forEach(event => {
      const { functionName, albId } = event;

      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        functionName,
        albId
      );
      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
      const lambdaPermissionLogicalId = this.provider.naming.getLambdaAlbPermissionLogicalId(
        functionName
      );

      Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [targetGroupLogicalId]: {
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
            Name: this.provider.naming.getAlbTargetGroupName(functionName, albId),
            Tags: [
              {
                Key: 'Name',
                Value: this.provider.naming.getAlbTargetGroupNameTagValue(functionName, albId),
              },
            ],
          },
          DependsOn: [lambdaPermissionLogicalId],
        },
      });
    });
  },
};
