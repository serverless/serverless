'use strict';

const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/alb/index');
const Serverless = require('../../../../../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#validate()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless);
  });

  it('should detect alb event definitions', () => {
    awsCompileAlbEvents.serverless.service.functions = {
      first: {
        events: [
          {
            alb: {
              listenerArn:
                'arn:aws:elasticloadbalancing:' +
                'us-east-1:123456789012:listener/app/my-load-balancer/' +
                '50dc6c495c0c9188/f2f7dc8efc522ab2',
              priority: 1,
              conditions: {
                host: 'example.com',
                path: '/hello',
                method: 'GET',
                ip: ['192.168.0.1/1', 'fe80:0000:0000:0000:0204:61ff:fe9d:f156/3'],
              },
            },
          },
        ],
      },
      second: {
        events: [
          {
            alb: {
              listenerArn:
                'arn:aws:elasticloadbalancing:' +
                'us-east-1:123456789012:listener/app/my-load-balancer/' +
                '50dc6c495c0c9188/f2f7dc8efc522ab2',
              priority: 2,
              conditions: {
                path: '/world',
                method: ['POST', 'GET'],
                query: {
                  foo: 'bar',
                },
              },
            },
          },
        ],
      },
    };

    const validated = awsCompileAlbEvents.validate();

    expect(validated.events).to.deep.equal([
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
          method: ['GET'],
          ip: ['192.168.0.1/1', 'fe80:0000:0000:0000:0204:61ff:fe9d:f156/3'],
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
          method: ['POST', 'GET'],
          query: {
            foo: 'bar',
          },
        },
      },
    ]);
  });

  it('should detect all alb authorizers declared in provider', () => {
    awsCompileAlbEvents.serverless.service.functions = {};
    awsCompileAlbEvents.serverless.service.provider.alb = {
      authorizers: {
        myFirstAuth: {
          type: 'cognito',
          userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
          userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
          userPoolDomain: 'your-test-domain',
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
        },
      },
    };

    const validated = awsCompileAlbEvents.validate();

    expect(validated.authorizers).to.deep.equal({
      myFirstAuth: {
        type: 'cognito',
        userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
        userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
        userPoolDomain: 'your-test-domain',
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
    });
  });

  describe('#validateListenerArnAndExtractAlbId()', () => {
    it('returns the alb ID when given a valid listener ARN', () => {
      const listenerArn =
        'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2';
      expect(awsCompileAlbEvents.validateListenerArn(listenerArn, 'functionname')).to.deep.equal({
        albId: '50dc6c495c0c9188',
        listenerId: 'f2f7dc8efc522ab2',
      });
    });

    it('returns the alb ID when given a valid listener ARN using non-standard partition', () => {
      const listenerArn =
        'arn:aws-us-gov:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2';
      expect(awsCompileAlbEvents.validateListenerArn(listenerArn, 'functionname')).to.deep.equal({
        albId: '50dc6c495c0c9188',
        listenerId: 'f2f7dc8efc522ab2',
      });
    });

    it('returns the ref when given an object for the listener ARN', () => {
      const listenerArn = { Ref: 'HTTPListener1' };
      expect(awsCompileAlbEvents.validateListenerArn(listenerArn, 'functionname')).to.deep.equal({
        albId: 'HTTPListener1',
        listenerId: 'HTTPListener1',
      });
    });
  });

  describe('#validatePriorities()', () => {
    it('should throw if multiple events use the same priority and the same listener', () => {
      const albEvents = [
        { priority: 1, listenerId: 'aaa', functionName: 'foo' },
        { priority: 1, listenerId: 'aaa', functionName: 'bar' },
      ];
      expect(() => awsCompileAlbEvents.validatePriorities(albEvents)).to.throw(
        /^((?!Serverless limitation).)*$/
      );
    });

    it('should throw a special error if multiple events use the same priority and a different listener in the same function', () => {
      const albEvents = [
        { priority: 1, listenerId: 'aaa', functionName: 'foo' },
        { priority: 1, listenerId: 'bbb', functionName: 'foo' },
      ];
      expect(() => awsCompileAlbEvents.validatePriorities(albEvents)).to.throw(
        /Serverless limitation/
      );
    });

    it('should not throw if multiple events use the same priority and a different listener in different functions', () => {
      const albEvents = [
        { priority: 1, listenerId: 'aaa', functionName: 'foo' },
        { priority: 1, listenerId: 'bbb', functionName: 'bar' },
      ];
      expect(() => awsCompileAlbEvents.validatePriorities(albEvents)).to.not.throw();
    });

    it('should not throw when all priorities are unique', () => {
      const albEvents = [
        { priority: 1, listenerId: 'aaa', functionName: 'foo' },
        { priority: 2, listenerId: 'bbb', functionName: 'bar' },
      ];
      expect(() => awsCompileAlbEvents.validatePriorities(albEvents)).to.not.throw();
    });
  });

  describe('#validateEventAuthorizers()', () => {
    it('returns valid authorizer array when string provided', () => {
      const event = {
        alb: {
          authorizer: 'myFirstAuth',
        },
      };
      const auths = {
        myFirstAuth: {},
      };
      expect(awsCompileAlbEvents.validateEventAuthorizers(event, auths, '')).to.deep.equal([
        'myFirstAuth',
      ]);
    });

    it('returns valid authorizer array when array provided', () => {
      const event = {
        alb: {
          authorizer: ['myFirstAuth', 'mySecondAuth'],
        },
      };
      const auths = {
        myFirstAuth: {},
        mySecondAuth: {},
      };
      expect(awsCompileAlbEvents.validateEventAuthorizers(event, auths, '')).to.deep.equal([
        'myFirstAuth',
        'mySecondAuth',
      ]);
    });

    it('throws an error when authorizer does not match any registered authorizers in provider', () => {
      const event = {
        alb: {
          authorizer: 'unknownAuth',
        },
      };
      const auths = {
        myFirstAuth: {},
      };
      expect(() =>
        awsCompileAlbEvents.validateEventAuthorizers(event, auths, 'functionName')
      ).to.throw(
        'No match for "unknownAuth" in function "functionName" found in registered ALB authorizers'
      );
    });
  });
});
