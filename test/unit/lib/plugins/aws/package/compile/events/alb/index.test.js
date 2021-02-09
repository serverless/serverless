'use strict';

const runServerless = require('../../../../../../../../utils/run-serverless');
const ServerlessError = require('../../../../../../../../../lib/serverless-error');
const { use: chaiUse, expect } = require('chai');
const chaiAsPromised = require('chai-as-promised');

chaiUse(chaiAsPromised);

describe('lib/plugins/aws/package/compile/eents/alb/index.test.js', () => {
  let cfResources;
  let naming;

  const baseEventConfig = {
    listenerArn:
      'arn:aws:elasticloadbalancing:' +
      'us-east-1:123456789012:listener/app/my-load-balancer/' +
      '50dc6c495c0c9188/f2f7dc8efc522ab2',
  };

  before(async () => {
    const validBaseEventConfig = {
      ...baseEventConfig,
      conditions: {
        path: '/',
      },
    };

    const baseAuthorizerConfig = {
      type: 'cognito',
      userPoolClientId: 'userPoolClientId',
      userPoolArn: 'arn:userPoolArn',
      userPoolDomain: 'userPoolDomain',
      scope: 'openid',
      sessionCookieName: 'sessionCookie',
    };

    const { awsNaming, cfTemplate } = await runServerless({
      fixture: 'function',
      cliArgs: ['package'],
      configExt: {
        provider: {
          alb: {
            authorizers: {
              deny: baseAuthorizerConfig,
              allow: { ...baseAuthorizerConfig, onUnauthenticatedRequest: 'allow' },
              authenticate: { ...baseAuthorizerConfig, onUnauthenticatedRequest: 'authenticate' },
            },
          },
        },
        functions: {
          fnAuthorizerOnUnauthenticatedRequestDeny: {
            handler: 'index.handler',
            events: [{ alb: { ...validBaseEventConfig, priority: 1, authorizer: 'deny' } }],
          },
          fnAuthorizerOnUnauthenticatedRequestAllow: {
            handler: 'index.handler',
            events: [{ alb: { ...validBaseEventConfig, priority: 2, authorizer: 'allow' } }],
          },
          fnAuthorizerOnUnauthenticatedRequestAuthenticate: {
            handler: 'index.handler',
            events: [{ alb: { ...validBaseEventConfig, priority: 3, authorizer: 'authenticate' } }],
          },
          fnConditionsHostOnly: {
            handler: 'index.handler',
            events: [
              { alb: { ...baseEventConfig, priority: 4, conditions: { host: 'example.com' } } },
            ],
          },
          fnConditionsPathOnly: {
            handler: 'index.handler',
            events: [{ alb: { ...baseEventConfig, priority: 5, conditions: { path: '/' } } }],
          },
        },
      },
    });
    cfResources = cfTemplate.Resources;
    naming = awsNaming;
  });

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
      override
    );

  describe('should support `onUnauthenticatedRequest`', () => {
    it('should "deny" by default', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnAuthorizerOnUnauthenticatedRequestDeny',
        1
      );
      const rule = cfResources[albListenerRuleLogicalId];

      expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule');
      expect(rule.Properties.Actions).to.have.length(2);
      expect(rule.Properties.Actions[0].Type).to.equal('authenticate-cognito');
      expect(rule.Properties.Actions[0].Order).to.equal(1);
      expect(rule.Properties.Actions[0].AuthenticateCognitoConfig).to.deep.equal(
        baseAuthenticateCognitoConfig()
      );
    });

    it('supports support `allow`', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnAuthorizerOnUnauthenticatedRequestAllow',
        2
      );
      const rule = cfResources[albListenerRuleLogicalId];

      expect(rule.Properties.Actions[0].AuthenticateCognitoConfig).to.deep.equal(
        baseAuthenticateCognitoConfig({ OnUnauthenticatedRequest: 'allow' })
      );
    });

    it('should support `authenticate`', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnAuthorizerOnUnauthenticatedRequestAuthenticate',
        3
      );
      const rule = cfResources[albListenerRuleLogicalId];

      expect(rule.Properties.Actions[0].AuthenticateCognitoConfig).to.deep.equal(
        baseAuthenticateCognitoConfig({ OnUnauthenticatedRequest: 'authenticate' })
      );
    });
  });

  describe('alb rule conditions', () => {
    it('should support rule without path', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnConditionsHostOnly',
        4
      );
      const rule = cfResources[albListenerRuleLogicalId];

      expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule');
      expect(rule.Properties.Conditions).to.have.length(1);
      expect(rule.Properties.Conditions[0].Field).to.equal('host-header');
      expect(rule.Properties.Conditions[0].Values).to.have.length(1);
      expect(rule.Properties.Conditions[0].Values[0]).to.equal('example.com');
    });

    it('should should support rule with path', () => {
      const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId(
        'fnConditionsPathOnly',
        5
      );
      const rule = cfResources[albListenerRuleLogicalId];

      expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule');
      expect(rule.Properties.Conditions).to.have.length(1);
      expect(rule.Properties.Conditions[0].Field).to.equal('path-pattern');
      expect(rule.Properties.Conditions[0].Values).to.have.length(1);
      expect(rule.Properties.Conditions[0].Values[0]).to.equal('/');
    });

    it('should fail validation if no conditions are set', async () => {
      const runServerlessAction = () =>
        runServerless({
          fixture: 'function',
          cliArgs: ['package'],
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
        });

      await expect(runServerlessAction())
        .to.eventually.be.rejectedWith(ServerlessError)
        .and.have.property('code', 'ALB_NO_CONDITIONS');
    });
  });
});
