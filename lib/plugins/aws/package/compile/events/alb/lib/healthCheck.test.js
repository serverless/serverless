'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../test/utils/run-serverless');

const { expect } = chai;

const healthCheckDefaults = {
  HealthCheckEnabled: false,
  HealthCheckPath: '/',
  HealthCheckIntervalSeconds: 35,
  HealthCheckTimeoutSeconds: 30,
  HealthyThresholdCount: 5,
  UnhealthyThresholdCount: 5,
  Matcher: { HttpCode: '200' },
};

const serverlessConfigurationExtension = {
  functions: {
    default: {
      handler: 'index.handler',
      events: [
        {
          alb: {
            listenerArn:
              'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
            conditions: {
              path: '/',
            },
            priority: 1,
          },
        },
      ],
    },
    enabledTrue: {
      handler: 'index.handler',
      events: [
        {
          alb: {
            listenerArn:
              'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
            conditions: {
              path: '/',
            },
            priority: 2,
            healthCheck: true,
          },
        },
      ],
    },
    enabledFalse: {
      handler: 'index.handler',
      events: [
        {
          alb: {
            listenerArn:
              'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
            conditions: {
              path: '/',
            },
            priority: 3,
            healthCheck: false,
          },
        },
      ],
    },
    enabledAdvanced: {
      handler: 'index.handler',
      events: [
        {
          alb: {
            listenerArn:
              'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
            conditions: {
              path: '/',
            },
            priority: 4,
            healthCheck: {
              path: '/health',
              intervalSeconds: 70,
              timeoutSeconds: 50,
              healthyThresholdCount: 7,
              unhealthyThresholdCount: 7,
              matcher: {
                httpCode: '200-299',
              },
            },
          },
        },
      ],
    },
    enabledAdvancedPartial: {
      handler: 'index.handler',
      events: [
        {
          alb: {
            listenerArn:
              'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
            conditions: {
              path: '/',
            },
            priority: 5,
            healthCheck: {
              path: '/health',
              intervalSeconds: 70,
            },
          },
        },
      ],
    },
  },
};

describe('ALB TargetGroup Health Checks', () => {
  let cfResources;
  let naming;

  before(() =>
    runServerless({
      fixture: 'function',
      configExt: serverlessConfigurationExtension,
      cliArgs: ['package'],
    }).then(({ cfTemplate, awsNaming }) => {
      ({ Resources: cfResources } = cfTemplate);
      naming = awsNaming;
    })
  );

  it('should be forcibly reverted to its default state (disabled) if healthCheck is not set', () => {
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
  });

  it('should be disabled when healthCheck is explicitly false', () => {
    const albTargetGroupName = naming.getAlbTargetGroupLogicalId(
      'enabledFalse',
      '50dc6c495c0c9188'
    );

    const targetGroup = cfResources[albTargetGroupName];
    expect(targetGroup.Type).to.equal('AWS::ElasticLoadBalancingV2::TargetGroup');

    const properties = targetGroup.Properties;
    expect(properties.HealthCheckEnabled).to.be.false;
  });

  it('should be enabled with default settings when healthCheck is explicitly true', () => {
    const albTargetGroupName = naming.getAlbTargetGroupLogicalId('enabledTrue', '50dc6c495c0c9188');

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
    expect(properties.HealthyThresholdCount).to.equal(healthCheckDefaults.HealthyThresholdCount);
    expect(properties.UnhealthyThresholdCount).to.equal(
      healthCheckDefaults.UnhealthyThresholdCount
    );
    expect(properties.Matcher).to.deep.equal(healthCheckDefaults.Matcher);
  });

  it('should be enabled with custom settings when healthCheck value is an object', () => {
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
  });

  it('should use defaults for any undefined advanced settings', () => {
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
    expect(properties.HealthyThresholdCount).to.equal(healthCheckDefaults.HealthyThresholdCount);
    expect(properties.UnhealthyThresholdCount).to.equal(
      healthCheckDefaults.UnhealthyThresholdCount
    );
    expect(properties.Matcher).to.deep.equal(healthCheckDefaults.Matcher);
  });
});
