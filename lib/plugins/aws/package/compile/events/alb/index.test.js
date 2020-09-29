'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileAlbEvents = require('./index');
const Serverless = require('../../../../../../Serverless');
const runServerless = require('../../../../../../../test/utils/run-serverless');

describe('AwsCompileAlbEvents', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless, options);
  });

  describe('#constructor()', () => {
    let compileTargetGroupsStub;
    let compileListenerRulesStub;
    let compilePermissionsStub;

    beforeEach(() => {
      compileTargetGroupsStub = sinon.stub(awsCompileAlbEvents, 'compileTargetGroups').resolves();
      compileListenerRulesStub = sinon.stub(awsCompileAlbEvents, 'compileListenerRules').resolves();
      compilePermissionsStub = sinon.stub(awsCompileAlbEvents, 'compilePermissions').resolves();
    });

    afterEach(() => {
      awsCompileAlbEvents.compileTargetGroups.restore();
      awsCompileAlbEvents.compileListenerRules.restore();
      awsCompileAlbEvents.compilePermissions.restore();
    });

    it('should have hooks', () => expect(awsCompileAlbEvents.hooks).to.be.not.empty);

    it('should set the provider variable to be an instanceof AwsProvider', () =>
      expect(awsCompileAlbEvents.provider).to.be.instanceof(AwsProvider));

    describe('"package:compileEvents" promise chain', () => {
      afterEach(() => {
        awsCompileAlbEvents.validate.restore();
      });

      it('should run the promise chain in order', () => {
        const validateStub = sinon.stub(awsCompileAlbEvents, 'validate').returns({
          events: [
            {
              functionName: 'first',
              listenerArn:
                'arn:aws:elasticloadbalancing:' +
                'us-east-1:123456789012:listener/app/my-load-balancer/' +
                '50dc6c495c0c9188/f2f7dc8efc522ab2',
              priority: 1,
              conditions: {
                host: 'example.com',
                path: '/hello',
              },
            },
          ],
        });

        return awsCompileAlbEvents.hooks['package:compileEvents']().then(() => {
          expect(validateStub.calledOnce).to.be.equal(true);
          expect(compileTargetGroupsStub.calledAfter(validateStub)).to.be.equal(true);
          expect(compileListenerRulesStub.calledAfter(compileTargetGroupsStub)).to.be.equal(true);
          expect(compilePermissionsStub.calledAfter(compileListenerRulesStub)).to.be.equal(true);
        });
      });
    });

    it('should resolve if no functions are given', () => {
      awsCompileAlbEvents.serverless.service.functions = {};

      return awsCompileAlbEvents.hooks['package:compileEvents']();
    });
  });

  describe('onUnauthenticatedRequest', () => {
    let cfResources;
    let naming;

    const serverlessConfiguration = (authorizerConfigOverride = {}) => ({
      provider: {
        alb: {
          authorizers: {
            test: Object.assign(
              {
                type: 'cognito',
                userPoolClientId: 'userPoolClientId',
                userPoolArn: 'arn:userPoolArn',
                userPoolDomain: 'userPoolDomain',
                scope: 'openid',
                sessionCookieName: 'sessionCookie',
              },
              authorizerConfigOverride
            ),
          },
        },
      },
      functions: {
        trigger: {
          events: [
            {
              alb: {
                listenerArn:
                  'arn:aws:elasticloadbalancing:' +
                  'us-east-1:123456789012:listener/app/my-load-balancer/' +
                  '50dc6c495c0c9188/f2f7dc8efc522ab2',
                conditions: {
                  path: '/',
                },
                priority: 1,
                authorizer: 'test',
              },
            },
          ],
        },
      },
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

    it('should be "deny" by default', () =>
      runServerless({
        fixture: 'functionDestinations',
        configExt: serverlessConfiguration(),
        cliArgs: ['package'],
      })
        .then(({ cfTemplate, awsNaming }) => {
          ({ Resources: cfResources } = cfTemplate);
          naming = awsNaming;
        })
        .then(() => {
          const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId('trigger', 1);
          const rule = cfResources[albListenerRuleLogicalId];

          expect(rule.Type).to.equal('AWS::ElasticLoadBalancingV2::ListenerRule');
          expect(rule.Properties.Actions).to.have.length(2);
          expect(rule.Properties.Actions[0].Type).to.equal('authenticate-cognito');
          expect(rule.Properties.Actions[0].Order).to.equal(1);
          expect(rule.Properties.Actions[0].AuthenticateCognitoConfig).to.deep.equal(
            baseAuthenticateCognitoConfig()
          );
        }));

    it('supports setting value to "allow"', () =>
      runServerless({
        fixture: 'functionDestinations',
        configExt: serverlessConfiguration({ onUnauthenticatedRequest: 'allow' }),
        cliArgs: ['package'],
      })
        .then(({ cfTemplate, awsNaming }) => {
          ({ Resources: cfResources } = cfTemplate);
          naming = awsNaming;
        })
        .then(() => {
          const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId('trigger', 1);
          const rule = cfResources[albListenerRuleLogicalId];

          expect(rule.Properties.Actions[0].AuthenticateCognitoConfig).to.deep.equal(
            baseAuthenticateCognitoConfig({ OnUnauthenticatedRequest: 'allow' })
          );
        }));

    it('supports setting value to "authenticate"', () =>
      runServerless({
        fixture: 'functionDestinations',
        configExt: serverlessConfiguration({ onUnauthenticatedRequest: 'authenticate' }),
        cliArgs: ['package'],
      })
        .then(({ cfTemplate, awsNaming }) => {
          ({ Resources: cfResources } = cfTemplate);
          naming = awsNaming;
        })
        .then(() => {
          const albListenerRuleLogicalId = naming.getAlbListenerRuleLogicalId('trigger', 1);
          const rule = cfResources[albListenerRuleLogicalId];

          expect(rule.Properties.Actions[0].AuthenticateCognitoConfig).to.deep.equal(
            baseAuthenticateCognitoConfig({ OnUnauthenticatedRequest: 'authenticate' })
          );
        }));
  });
});
