'use strict';

const { expect } = require('chai');
const runServerless = require('../../../../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../../../../tests/fixtures');

const healthCheckDefaults = {
  HealthCheckEnabled: false,
  HealthCheckPath: '/',
  HealthCheckIntervalSeconds: 35,
  HealthCheckTimeoutSeconds: 30,
  HealthyThresholdCount: 5,
  UnhealthyThresholdCount: 5,
  Matcher: { HttpCode: '200' },
};

describe('ALB TargetGroup Health Checks', () => {
  let cfResources;
  let naming;

  it('should be forcibly reverted to its default state (disabled) if healthCheck is not set', () =>
    fixtures
      .extend('functionHealthCheck')
      .then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        })
      )
      .then(serverless => {
        ({ Resources: cfResources } = serverless.service.provider.compiledCloudFormationTemplate);
        naming = serverless.getProvider('aws').naming;
      })
      .then(() => {
        const albTargetGroupName = naming.getAlbTargetGroupLogicalId('default', '50dc6c495c0c9188');

        const targetGroup = cfResources[albTargetGroupName];
        expect(targetGroup.Type).to.equal('AWS::ElasticLoadBalancingV2::TargetGroup');

        const properties = targetGroup.Properties;
        expect(properties.HealthCheckEnabled).to.equal(healthCheckDefaults.HealthCheckEnabled);
        expect(properties.HealthCheckPath).to.be.undefined;
        expect(properties.HealthCheckIntervalSeconds).to.be.undefined;
        expect(properties.HealthCheckTimeoutSeconds).to.be.undefined;
        expect(properties.HealthyThresholdCount).to.be.undefined;
        expect(properties.UnhealthyThresholdCount).to.be.undefined;
        expect(properties.Matcher).to.be.undefined;
      }));

  it('should be disabled when healthCheck is explicitly false', () =>
    fixtures
      .extend('functionHealthCheck')
      .then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        })
      )
      .then(serverless => {
        ({ Resources: cfResources } = serverless.service.provider.compiledCloudFormationTemplate);
        naming = serverless.getProvider('aws').naming;
      })
      .then(() => {
        const albTargetGroupName = naming.getAlbTargetGroupLogicalId(
          'enabledFalse',
          '50dc6c495c0c9188'
        );

        const targetGroup = cfResources[albTargetGroupName];
        expect(targetGroup.Type).to.equal('AWS::ElasticLoadBalancingV2::TargetGroup');

        const properties = targetGroup.Properties;
        expect(properties.HealthCheckEnabled).to.be.false;
      }));

  it('should be enabled with default settings when healthCheck is explicitly true', () =>
    fixtures
      .extend('functionHealthCheck')
      .then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        })
      )
      .then(serverless => {
        ({ Resources: cfResources } = serverless.service.provider.compiledCloudFormationTemplate);
        naming = serverless.getProvider('aws').naming;
      })
      .then(() => {
        const albTargetGroupName = naming.getAlbTargetGroupLogicalId(
          'enabledTrue',
          '50dc6c495c0c9188'
        );

        const targetGroup = cfResources[albTargetGroupName];
        expect(targetGroup.Type).to.equal('AWS::ElasticLoadBalancingV2::TargetGroup');

        const properties = targetGroup.Properties;
        expect(properties.HealthCheckEnabled).to.be.true;
        expect(properties.HealthCheckPath).to.equal(healthCheckDefaults.HealthCheckPath);
        expect(properties.HealthCheckIntervalSeconds).to.equal(
          healthCheckDefaults.HealthCheckIntervalSeconds
        );
        expect(properties.HealthCheckTimeoutSeconds).to.equal(
          healthCheckDefaults.HealthCheckTimeoutSeconds
        );
        expect(properties.HealthyThresholdCount).to.equal(
          healthCheckDefaults.HealthyThresholdCount
        );
        expect(properties.UnhealthyThresholdCount).to.equal(
          healthCheckDefaults.UnhealthyThresholdCount
        );
        expect(properties.Matcher).to.deep.equal(healthCheckDefaults.Matcher);
      }));

  it('should be enabled with custom settings when healthCheck value is an object', () =>
    fixtures
      .extend('functionHealthCheck')
      .then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        })
      )
      .then(serverless => {
        ({ Resources: cfResources } = serverless.service.provider.compiledCloudFormationTemplate);
        naming = serverless.getProvider('aws').naming;
      })
      .then(() => {
        const albTargetGroupName = naming.getAlbTargetGroupLogicalId(
          'enabledAdvanced',
          '50dc6c495c0c9188'
        );

        const targetGroup = cfResources[albTargetGroupName];
        expect(targetGroup.Type).to.equal('AWS::ElasticLoadBalancingV2::TargetGroup');

        const properties = targetGroup.Properties;
        expect(properties.HealthCheckEnabled).to.be.true;
        expect(properties.HealthCheckPath).to.equal('/health');
        expect(properties.HealthCheckIntervalSeconds).to.equal(70);
        expect(properties.HealthCheckTimeoutSeconds).to.equal(50);
        expect(properties.HealthyThresholdCount).to.equal(7);
        expect(properties.UnhealthyThresholdCount).to.equal(7);
        expect(properties.Matcher.HttpCode).to.equal('200-299');
      }));

  it('should be use defaults for any undefined advanced settings', () =>
    fixtures
      .extend('functionHealthCheck')
      .then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        })
      )
      .then(serverless => {
        ({ Resources: cfResources } = serverless.service.provider.compiledCloudFormationTemplate);
        naming = serverless.getProvider('aws').naming;
      })
      .then(() => {
        const albTargetGroupName = naming.getAlbTargetGroupLogicalId(
          'enabledAdvancedPartial',
          '50dc6c495c0c9188'
        );

        const targetGroup = cfResources[albTargetGroupName];
        expect(targetGroup.Type).to.equal('AWS::ElasticLoadBalancingV2::TargetGroup');

        const properties = targetGroup.Properties;
        expect(properties.HealthCheckEnabled).to.be.true;
        expect(properties.HealthCheckPath).to.equal('/health');
        expect(properties.HealthCheckIntervalSeconds).to.equal(70);
        expect(properties.HealthCheckTimeoutSeconds).to.equal(
          healthCheckDefaults.HealthCheckTimeoutSeconds
        );
        expect(properties.HealthyThresholdCount).to.equal(
          healthCheckDefaults.HealthyThresholdCount
        );
        expect(properties.UnhealthyThresholdCount).to.equal(
          healthCheckDefaults.UnhealthyThresholdCount
        );
        expect(properties.Matcher).to.deep.equal(healthCheckDefaults.Matcher);
      }));
});
