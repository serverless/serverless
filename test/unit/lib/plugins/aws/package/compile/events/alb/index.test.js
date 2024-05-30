'use strict'

const runServerless = require('../../../../../../../../utils/run-serverless')
const ServerlessError = require('../../../../../../../../../lib/serverless-error')
const { use: chaiUse, expect } = require('chai')
const chaiAsPromised = require('chai-as-promised')

chaiUse(chaiAsPromised)

describe('test/unit/lib/plugins/aws/package/compile/events/alb/index.test.js', () => {
  let cfResources
  let naming

  const albId = '50dc6c495c0c9188'
  const baseEventConfig = {
    listenerArn: `arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/${albId}/f2f7dc8efc522ab2`,
  }

  const validBaseEventConfig = {
    ...baseEventConfig,
    conditions: {
      path: '/',
    },
  }

  before(async () => {
    const baseAuthorizerConfig = {
      type: 'cognito',
      userPoolClientId: 'userPoolClientId',
      userPoolArn: 'arn:userPoolArn',
      userPoolDomain: 'userPoolDomain',
      scope: 'openid',
      sessionCookieName: 'sessionCookie',
    }

    const { awsNaming, cfTemplate } = await runServerless({
      fixture: 'function',
      command: 'package',
      configExt: {
        provider: {
          alb: {
            authorizers: {
              deny: baseAuthorizerConfig,
              allow: {
                ...baseAuthorizerConfig,
                onUnauthenticatedRequest: 'allow',
              },
              authenticate: {
                ...baseAuthorizerConfig,
                onUnauthenticatedRequest: 'authenticate',
              },
            },
          },
        },
        functions: {
          fnAuthorizerOnUnauthenticatedRequestDeny: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...validBaseEventConfig,
                  priority: 1,
                  authorizer: 'deny',
                },
              },
            ],
          },
          fnAuthorizerOnUnauthenticatedRequestAllow: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...validBaseEventConfig,
                  priority: 2,
                  authorizer: 'allow',
                },
              },
            ],
          },
          fnAuthorizerOnUnauthenticatedRequestAuthenticate: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...validBaseEventConfig,
                  priority: 3,
                  authorizer: 'authenticate',
                },
              },
            ],
          },
          fnConditionsHostOnly: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...baseEventConfig,
                  priority: 4,
                  conditions: { host: 'example.com' },
                },
              },
            ],
          },
          fnConditionsPathOnly: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...baseEventConfig,
                  priority: 5,
                  conditions: { path: '/' },
                },
              },
            ],
          },
          fnConditionsMultipleHostsOnly: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...baseEventConfig,
                  priority: 6,
                  conditions: { host: ['example1.com', 'example2.com'] },
                },
              },
            ],
          },
          fnAlbTargetGroupName: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...validBaseEventConfig,
                  priority: 7,
                  targetGroupName: 'custom-targetgroup-name',
                },
              },
            ],
          },
          fnSingleHeaderCondition: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...validBaseEventConfig,
                  priority: 8,
                  conditions: {
                    header: { name: 'dummyName', values: ['dummyValue'] },
                  },
                },
              },
            ],
          },
          fnMultiHeaderCondition: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...validBaseEventConfig,
                  priority: 9,
                  conditions: {
                    header: [
                      { name: 'dummyName1', values: ['dummyValue1'] },
                      { name: 'dummyName2', values: ['dummyValue2'] },
                      {
                        name: 'dummyName3',
                        values: ['dummyMultiValue1', 'dummyMultiValue2'],
                      },
                    ],
                  },
                },
              },
            ],
          },
          fnIpCondition: {
            handler: 'index.handler',
            events: [
              {
                alb: {
                  ...validBaseEventConfig,
                  priority: 10,
                  conditions: {
                    ip: [
                      'fe80:0000:0000:0000:0204:61ff:fe9d:f156/6',
                      '192.168.0.1/0',
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    })
    cfResources = cfTemplate.Resources
    naming = awsNaming
  })

  const baseAuthenticateCognitoConfig = (override = {}) =>
    Object.assign(
      {
        UserPoolArn: 'arn:userPoolArn',
        UserPoolClientId: 'userPoolClientId',
        UserPoolDomain: 'userPoolDomain',
        OnUnauthenticatedRequest: 'deny',
        Scope: 'openid',
        SessionCookieName: 'sessionCookie',
        AuthenticationRequestExtraParams: undefined,
        SessionTimeout: undefined,
      },
      override,
    )

  describe('should support `onUnauthenticatedRequest`', () => {
    it('should "deny" by default', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnAuthorizerOnUnauthenticatedRequestDeny',
        1,
      )
      const rule = cfResources[albListenerRuleLogicalId]

      expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule')
      expect(rule.Properties.Actions).to.have.length(2)
      expect(rule.Properties.Actions[0].Type).to.equal('authenticate-cognito')
      expect(rule.Properties.Actions[0].Order).to.equal(1)
      expect(
        rule.Properties.Actions[0].AuthenticateCognitoConfig,
      ).to.deep.equal(baseAuthenticateCognitoConfig())
    })

    it('supports support `allow`', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnAuthorizerOnUnauthenticatedRequestAllow',
        2,
      )
      const rule = cfResources[albListenerRuleLogicalId]

      expect(
        rule.Properties.Actions[0].AuthenticateCognitoConfig,
      ).to.deep.equal(
        baseAuthenticateCognitoConfig({ OnUnauthenticatedRequest: 'allow' }),
      )
    })

    it('should support `authenticate`', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnAuthorizerOnUnauthenticatedRequestAuthenticate',
        3,
      )
      const rule = cfResources[albListenerRuleLogicalId]

      expect(
        rule.Properties.Actions[0].AuthenticateCognitoConfig,
      ).to.deep.equal(
        baseAuthenticateCognitoConfig({
          OnUnauthenticatedRequest: 'authenticate',
        }),
      )
    })
  })

  describe('alb rule conditions', () => {
    it('should support rule without path', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnConditionsHostOnly',
        4,
      )
      const rule = cfResources[albListenerRuleLogicalId]

      expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule')
      expect(rule.Properties.Conditions).to.have.length(1)
      expect(rule.Properties.Conditions[0].Field).to.equal('host-header')
      expect(
        rule.Properties.Conditions[0].HostHeaderConfig.Values,
      ).to.have.length(1)
      expect(rule.Properties.Conditions[0].HostHeaderConfig.Values[0]).to.equal(
        'example.com',
      )
    })

    it('should should support rule with path', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnConditionsPathOnly',
        5,
      )
      const rule = cfResources[albListenerRuleLogicalId]

      expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule')
      expect(rule.Properties.Conditions).to.have.length(1)
      expect(rule.Properties.Conditions[0].Field).to.equal('path-pattern')
      expect(rule.Properties.Conditions[0].Values).to.have.length(1)
      expect(rule.Properties.Conditions[0].Values[0]).to.equal('/')
    })

    it('should support multiple host rules', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnConditionsMultipleHostsOnly',
        6,
      )
      const rule = cfResources[albListenerRuleLogicalId]

      expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule')
      expect(rule.Properties.Conditions).to.have.length(1)
      expect(rule.Properties.Conditions[0].Field).to.equal('host-header')
      expect(
        rule.Properties.Conditions[0].HostHeaderConfig.Values,
      ).to.have.length(2)
      expect(rule.Properties.Conditions[0].HostHeaderConfig.Values[0]).to.equal(
        'example1.com',
      )
      expect(rule.Properties.Conditions[0].HostHeaderConfig.Values[1]).to.equal(
        'example2.com',
      )
    })

    it('should fail validation if no conditions are set', async () => {
      const runServerlessAction = () =>
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              fnConditionsHostOnly: {
                handler: 'index.handler',
                events: [
                  {
                    alb: {
                      ...baseEventConfig,
                      priority: 1,
                      conditions: {},
                    },
                  },
                ],
              },
            },
          },
        })

      await expect(runServerlessAction())
        .to.eventually.be.rejectedWith(ServerlessError)
        .and.have.property('code', 'ALB_NO_CONDITIONS')
    })
  })

  describe('should support `functions[].events[].alb.targetGroupName` property', () => {
    it('should use it if defined', async () => {
      const albListenerRuleLogicalId = naming.getAlbTargetGroupLogicalId(
        'fnAlbTargetGroupName',
        albId,
        false,
      )

      expect(cfResources[albListenerRuleLogicalId].Properties.Name).to.equal(
        'custom-targetgroup-name',
      )
    })

    it('should reject if `provider.alb.targetGroupPrefix` is also specified', async () => {
      const runServerlessAction = () =>
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              alb: {
                targetGroupPrefix: 'a-prefix',
              },
            },
            functions: {
              fnTargetGroupName: {
                handler: 'index.handler',
                events: [
                  {
                    alb: {
                      ...validBaseEventConfig,
                      priority: 1,
                      targetGroupName: 'custom-targetgroup-name',
                    },
                  },
                ],
              },
            },
          },
        })

      await expect(runServerlessAction())
        .to.eventually.be.rejectedWith(ServerlessError)
        .and.have.property('code', 'ALB_TARGET_GROUP_NAME_EXCLUSIVE')
    })
  })

  describe('should set alb header conditions', () => {
    it('should convert single header condition to array', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnSingleHeaderCondition',
        8,
      )
      const conditions =
        cfResources[albListenerRuleLogicalId].Properties.Conditions
      expect(conditions).to.have.length(1)
      const config = conditions[0].HttpHeaderConfig
      expect(config.HttpHeaderName).to.equal('dummyName')
      expect(config.Values).to.have.length(1)
      expect(config.Values[0]).to.equal('dummyValue')
    })

    it('should support multi header conditions', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnMultiHeaderCondition',
        9,
      )
      const conditions =
        cfResources[albListenerRuleLogicalId].Properties.Conditions
      expect(conditions).to.have.length(3)
      const [cond1, cond2, cond3] = conditions

      const config1 = cond1.HttpHeaderConfig
      expect(config1.HttpHeaderName).to.equal('dummyName1')
      expect(config1.Values).to.have.length(1)
      expect(config1.Values[0]).to.equal('dummyValue1')

      const config2 = cond2.HttpHeaderConfig
      expect(config2.HttpHeaderName).to.equal('dummyName2')
      expect(config2.Values).to.have.length(1)
      expect(config2.Values[0]).to.equal('dummyValue2')

      const config3 = cond3.HttpHeaderConfig
      expect(config3.HttpHeaderName).to.equal('dummyName3')
      expect(config3.Values).to.have.length(2)
      expect(config3.Values[0]).to.equal('dummyMultiValue1')
      expect(config3.Values[1]).to.equal('dummyMultiValue2')
    })
  })

  describe('should set alb ip conditions', () => {
    it('should allow IP CIDR format', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnIpCondition',
        10,
      )
      const conditions =
        cfResources[albListenerRuleLogicalId].Properties.Conditions

      expect(conditions).to.have.length(1)
      const config = conditions[0].SourceIpConfig
      expect(config.Values).to.deep.equal([
        'fe80:0000:0000:0000:0204:61ff:fe9d:f156/6',
        '192.168.0.1/0',
      ])
    })
  })
})
