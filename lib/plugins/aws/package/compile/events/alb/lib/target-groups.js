'use strict';

const resolveLambdaTarget = require('../../../../../utils/resolve-lambda-target');

const healthCheckDefaults = {
  HealthCheckEnabled: false,
  HealthCheckPath: '/',
  HealthCheckIntervalSeconds: 35,
  HealthCheckTimeoutSeconds: 30,
  HealthyThresholdCount: 5,
  UnhealthyThresholdCount: 5,
  Matcher: { HttpCode: '200' },
};

module.exports = {
  compileTargetGroups() {
    this.validated.events.forEach((event) => {
      const {
        functionName,
        albId,
        multiValueHeaders = false,
        healthCheck,
        targetGroupName,
      } = event;

      const targetGroupLogicalId = this.provider.naming.getAlbTargetGroupLogicalId(
        functionName,
        albId,
        multiValueHeaders
      );
      const registerTargetPermissionLogicalId =
        this.provider.naming.getLambdaRegisterTargetPermissionLogicalId(functionName);

      const healthCheckProperties = { HealthCheckEnabled: healthCheckDefaults.HealthCheckEnabled };
      if (healthCheck) {
        Object.assign(healthCheckProperties, healthCheckDefaults);
        if (healthCheck.enabled != null) {
          healthCheckProperties.HealthCheckEnabled = healthCheck.enabled;
        }
        if (healthCheck.intervalSeconds != null) {
          healthCheckProperties.HealthCheckIntervalSeconds = healthCheck.intervalSeconds;
        }
        if (healthCheck.path != null) {
          healthCheckProperties.HealthCheckPath = healthCheck.path;
        }
        if (healthCheck.timeoutSeconds != null) {
          healthCheckProperties.HealthCheckTimeoutSeconds = healthCheck.timeoutSeconds;
        }
        if (healthCheck.healthyThresholdCount != null) {
          healthCheckProperties.HealthyThresholdCount = healthCheck.healthyThresholdCount;
        }
        if (healthCheck.unhealthyThresholdCount) {
          healthCheckProperties.UnhealthyThresholdCount = healthCheck.unhealthyThresholdCount;
        }
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
          Name:
            targetGroupName ||
            this.provider.naming.generateAlbTargetGroupName(functionName, albId, multiValueHeaders),
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
