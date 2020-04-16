'use strict';

const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileListenerRules()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  it('should create ELB listener rule resources', () => {
    awsCompileAlbEvents.validated = {
      events: [
        {
          functionName: 'first',
          albId: '50dc6c495c0c9188',
          listenerId: 'f2f7dc8efc522ab2',
          listenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/f2f7dc8efc522ab2',
          priority: 1,
          conditions: {
            host: ['example.com'],
            path: ['/hello'],
          },
        },
        {
          functionName: 'second',
          albId: '50dc6c495c0c9188',
          listenerId: 'f2f7dc8efc522ab2',
          listenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/f2f7dc8efc522ab2',
          priority: 2,
          conditions: {
            path: ['/world'],
          },
        },
        {
          functionName: 'third',
          albId: '50dc6c495c0c9188',
          listenerId: 'f2f7dc8efc522ab2',
          listenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/f2f7dc8efc522ab2',
          priority: 3,
          conditions: {
            path: ['/auth'],
          },
          authorizers: ['myFirstAuth', 'mySecondAuth'],
        },
      ],
      authorizers: {
        myFirstAuth: {
          type: 'cognito',
          userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
          userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
          userPoolDomain: 'my-test-user-pool-domain',
          onUnauthenticatedRequest: 'allow',
        },
        mySecondAuth: {
          type: 'oidc',
          authorizationEndpoint: 'https://example.com',
          clientId: 'i-am-client',
          clientSecret: 'i-am-secret',
          issuer: 'https://www.iamscam.com',
          tokenEndpoint: 'http://somewhere.org',
          userInfoEndpoint: 'https://another-example.com',
          onUnauthenticatedRequest: 'deny',
        },
      },
    };

    awsCompileAlbEvents.compileListenerRules();

    const resources =
      awsCompileAlbEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    expect(resources.FirstAlbListenerRule1).to.deep.equal({
      Type: 'AWS::ElasticLoadBalancingV2::ListenerRule',
      Properties: {
        Actions: [
          {
            TargetGroupArn: {
              Ref: 'FirstAlbTargetGroup50dc6c495c0c9188',
            },
            Type: 'forward',
          },
        ],
        Conditions: [
          {
            Field: 'path-pattern',
            Values: ['/hello'],
          },
          {
            Field: 'host-header',
            Values: ['example.com'],
          },
        ],
        ListenerArn:
          'arn:aws:elasticloadbalancing:' +
          'us-east-1:123456789012:listener/app/my-load-balancer/' +
          '50dc6c495c0c9188/f2f7dc8efc522ab2',
        Priority: 1,
      },
    });
    expect(resources.SecondAlbListenerRule2).to.deep.equal({
      Type: 'AWS::ElasticLoadBalancingV2::ListenerRule',
      Properties: {
        Actions: [
          {
            TargetGroupArn: {
              Ref: 'SecondAlbTargetGroup50dc6c495c0c9188',
            },
            Type: 'forward',
          },
        ],
        Conditions: [
          {
            Field: 'path-pattern',
            Values: ['/world'],
          },
        ],
        ListenerArn:
          'arn:aws:elasticloadbalancing:' +
          'us-east-1:123456789012:listener/app/my-load-balancer/' +
          '50dc6c495c0c9188/f2f7dc8efc522ab2',
        Priority: 2,
      },
    });
    expect(resources.ThirdAlbListenerRule3).to.deep.equal({
      Type: 'AWS::ElasticLoadBalancingV2::ListenerRule',
      Properties: {
        Actions: [
          {
            Type: 'authenticate-cognito',
            Order: 1,
            AuthenticateCognitoConfig: {
              UserPoolArn:
                'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
              UserPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
              UserPoolDomain: 'my-test-user-pool-domain',
              OnUnauthenticatedRequest: 'allow',
              AuthenticationRequestExtraParams: undefined,
              Scope: undefined,
              SessionCookieName: undefined,
              SessionTimeout: undefined,
            },
          },
          {
            Type: 'authenticate-oidc',
            Order: 2,
            AuthenticateOidcConfig: {
              AuthorizationEndpoint: 'https://example.com',
              ClientId: 'i-am-client',
              ClientSecret: 'i-am-secret',
              Issuer: 'https://www.iamscam.com',
              TokenEndpoint: 'http://somewhere.org',
              UserInfoEndpoint: 'https://another-example.com',
              OnUnauthenticatedRequest: 'deny',
              AuthenticationRequestExtraParams: undefined,
              Scope: undefined,
              SessionCookieName: undefined,
              SessionTimeout: undefined,
            },
          },
          {
            TargetGroupArn: {
              Ref: 'ThirdAlbTargetGroup50dc6c495c0c9188',
            },
            Order: 3,
            Type: 'forward',
          },
        ],
        Conditions: [
          {
            Field: 'path-pattern',
            Values: ['/auth'],
          },
        ],
        ListenerArn:
          'arn:aws:elasticloadbalancing:' +
          'us-east-1:123456789012:listener/app/my-load-balancer/' +
          '50dc6c495c0c9188/f2f7dc8efc522ab2',
        Priority: 3,
      },
    });
  });
});
