'use strict';

const runServerless = require('../../../../../../../../utils/run-serverless');
const { expect } = require('chai');

describe('lib/plugins/aws/package/compile/eents/alb/index.test.js', () => {
  let cfResources;
  let naming;

  before(async () => {
    const baseEventConfig = {
      listenerArn:
        'arn:aws:elasticloadbalancing:' +
        'us-east-1:123456789012:listener/app/my-load-balancer/' +
        '50dc6c495c0c9188/f2f7dc8efc522ab2',
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
            events: [{ alb: { ...baseEventConfig, priority: 1, authorizer: 'deny' } }],
          },
          fnAuthorizerOnUnauthenticatedRequestAllow: {
            handler: 'index.handler',
            events: [{ alb: { ...baseEventConfig, priority: 2, authorizer: 'allow' } }],
          },
          fnAuthorizerOnUnauthenticatedRequestAuthenticate: {
            handler: 'index.handler',
            events: [{ alb: { ...baseEventConfig, priority: 3, authorizer: 'authenticate' } }],
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
});
