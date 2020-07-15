'use strict';

const resolveLambdaTarget = require('../../../../../utils/resolveLambdaTarget');

module.exports = {
  compileTargetGroups() {
    this.validated.events.forEach(event => {
      const { functionName, albId, multiValueHeaders = false, healthCheck } = event;

      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        functionName,
        albId,
        multiValueHeaders
      );
      const registerTargetPermissionLogicalId = this.provider.naming.getLambdaRegisterTargetPermissionLogicalId(
        functionName
      );

      const healthCheckProperties = {};
      if (healthCheck) {
        healthCheckProperties.HealthCheckEnabled = healthCheck.enabled;
        healthCheckProperties.HealthCheckIntervalSeconds = healthCheck.intervalSeconds;
        healthCheckProperties.HealthCheckPath = healthCheck.path;
        healthCheckProperties.HealthCheckTimeoutSeconds = healthCheck.timeoutSeconds;
        healthCheckProperties.HealthyThresholdCount = healthCheck.healthyThresholdCount;
        healthCheckProperties.UnhealthyThresholdCount = healthCheck.unhealthyThresholdCount;
        if (healthCheck.matcher && healthCheck.matcher.httpCode) {
          healthCheckProperties.Matcher = { HttpCode: healthCheck.matcher.httpCode };
        }
      }

      const functionObj = this.serverless.service.getFunction(functionName);
      const TargetGroup = {
        Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        Properties: {
          TargetType: 'lambda',
          Targets: [
            {
              Id: resolveLambdaTarget(functionName, functionObj),
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
      Object.assign(TargetGroup.Properties, healthCheckProperties);
      Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [targetGroupLogicalId]: TargetGroup,
      });
    });
  },
};
