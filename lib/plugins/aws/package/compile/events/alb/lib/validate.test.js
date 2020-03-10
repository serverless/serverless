'use strict';

const _ = require('lodash');
const expect = require('chai').expect;
const AwsCompileAlbEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#validate()', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
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

  it('should throw when given an invalid query condition', () => {
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
                path: '/hello',
                query: 'ss',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileAlbEvents.validate()).to.throw(Error);
  });

  it('should throw when given an invalid ip condition', () => {
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
                path: '/hello',
                ip: '1.1.1.1',
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileAlbEvents.validate()).to.throw(Error);
  });

  it('should throw when given an invalid header condition', () => {
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
                path: '/hello',
                header: ['foo'],
              },
            },
          },
        ],
      },
    };

    expect(() => awsCompileAlbEvents.validate()).to.throw(Error);
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

    it('throws an error if the listener ARN is missing', () => {
      const listenerArns = [undefined, null, false, ''];
      _.forEach(listenerArns, listenerArn => {
        expect(() => awsCompileAlbEvents.validateListenerArn(listenerArn, 'functionname')).to.throw(
          'listenerArn is missing in function "functionname".'
        );
      });
    });

    it('throws an error if the listener ARN is invalid', () => {
      const listenerArns = [
        // ALB listener rule (not a listener)
        'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener-rule/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2/9683b2d02a6cabee',
        // ELB
        'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/net/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
        // Non ec2 ARN
        'arn:aws:iam::123456789012:server-certificate/division_abc/subdivision_xyz/ProdServerCert',
        // Object without a ref
        { foo: 'bar' },
      ];
      _.forEach(listenerArns, listenerArn => {
        const event = { alb: { listenerArn } };
        expect(() => awsCompileAlbEvents.validateListenerArn(event, 'functionname')).to.throw(
          'Invalid ALB listenerArn in function "functionname".'
        );
      });
    });
  });

  describe('#validateIpCondition()', () => {
    it('should throw if ip is not a valid ipv6 or ipv4 cidr block', () => {
      const event = { alb: { conditions: { ip: 'fe80:0000:0000:0000:0204:61ff:fe9d:f156/' } } };
      expect(() => awsCompileAlbEvents.validateIpCondition(event, '')).to.throw(Error);
    });

    it('should return the value as array if it is a valid ipv6 cidr block', () => {
      const event = { alb: { conditions: { ip: 'fe80:0000:0000:0000:0204:61ff:fe9d:f156/127' } } };
      expect(awsCompileAlbEvents.validateIpCondition(event, '')).to.deep.equal([
        'fe80:0000:0000:0000:0204:61ff:fe9d:f156/127',
      ]);
    });

    it('should return the value as array if it is a valid ipv4 cidr block', () => {
      const event = { alb: { conditions: { ip: '192.168.0.1/21' } } };
      expect(awsCompileAlbEvents.validateIpCondition(event, '')).to.deep.equal(['192.168.0.1/21']);
    });
  });

  describe('#validateQueryCondition()', () => {
    it('should throw if query is not an object', () => {
      const event = { alb: { conditions: { query: 'foo' } } };
      expect(() => awsCompileAlbEvents.validateQueryCondition(event, '')).to.throw(Error);
    });

    it('should return the value if it is an object', () => {
      const event = { alb: { conditions: { query: { foo: 'bar' } } } };
      expect(awsCompileAlbEvents.validateQueryCondition(event, '')).to.deep.equal({ foo: 'bar' });
    });
  });

  describe('#validateHeaderCondition()', () => {
    it('should throw if header does not have the required properties', () => {
      const event = { alb: { conditions: { header: { name: 'foo', value: 'bar' } } } };
      expect(() => awsCompileAlbEvents.validateHeaderCondition(event, '')).to.throw(Error);
    });

    it('should throw if header.values is not an array', () => {
      const event = { alb: { conditions: { header: { name: 'foo', values: 'bar' } } } };
      expect(() => awsCompileAlbEvents.validateHeaderCondition(event, '')).to.throw(Error);
    });

    it('should return the value if it is valid', () => {
      const event = { alb: { conditions: { header: { name: 'foo', values: ['bar'] } } } };
      expect(awsCompileAlbEvents.validateHeaderCondition(event, '')).to.deep.equal({
        name: 'foo',
        values: ['bar'],
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

  describe('#validateMultiValueHeadersAttribute()', () => {
    it('should throw when multiValueHeaders value is not a boolean', () => {
      const event = { alb: { multiValueHeaders: 'true' } };
      expect(() => awsCompileAlbEvents.validateMultiValueHeadersAttribute(event, '')).to.throw(
        /Invalid ALB event "multiValueHeaders" attribute/
      );
    });

    it('should return multiValueHeaders attribute value when given a boolean', () => {
      const event = { alb: { multiValueHeaders: true } };
      expect(awsCompileAlbEvents.validateMultiValueHeadersAttribute(event, '')).to.equal(true);
    });
  });

  describe('#validateCognitoAuth()', () => {
    let baseValidEvent;

    beforeEach(() => {
      baseValidEvent = {
        alb: {
          authenticateCognito: {
            userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
            userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
            userPoolDomain: 'your-test-domain',
          },
        },
      };
    });

    it('returns valid cognito authentication config when supported event params given', () => {
      baseValidEvent.alb.authenticateCognito.requestExtraParams = { preference: 'azure' };
      baseValidEvent.alb.authenticateCognito.scope = 'first_name age';
      baseValidEvent.alb.authenticateCognito.sessionCookieName = 'x-api-key';
      baseValidEvent.alb.authenticateCognito.sessionTimeout = 7000;
      expect(awsCompileAlbEvents.validateCognitoAuth(baseValidEvent, '')).to.deep.equal({
        userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
        userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
        userPoolDomain: 'your-test-domain',
        onUnauthenticatedRequest: 'deny',
        requestExtraParams: {
          preference: 'azure',
        },
        scope: 'first_name age',
        sessionCookieName: 'x-api-key',
        sessionTimeout: 7000,
      });
    });

    it('returns valid cognito authentication config when allowUnauthenticated is true', () => {
      baseValidEvent.alb.authenticateCognito.allowUnauthenticated = true;
      expect(awsCompileAlbEvents.validateCognitoAuth(baseValidEvent, '')).to.deep.equal({
        userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
        userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE',
        userPoolDomain: 'your-test-domain',
        onUnauthenticatedRequest: 'allow',
      });
    });

    it('throws an error when authenticateCognito is not of type Object', () => {
      const event = { alb: { authenticateCognito: '' } };
      expect(() => awsCompileAlbEvents.validateCognitoAuth(event, 'functionName')).to.throw(
        'Invalid ALB event "authenticateCognito" attribute in function "functionName".\n You must provide a object.'
      );
    });

  });

  describe('#validateOidcAuth()', () => {
    let baseValidEvent;

    beforeEach(() => {
      baseValidEvent = {
        alb: {
          authenticateOidc: {
            authorizationEndpoint: 'https://example.com',
            clientId: 'i-am-client',
            clientSecret: 'i-am-secret',
            issuer: 'https://www.iamscam.com',
            tokenEndpoint: 'http://somewhere.org',
            userInfoEndpoint: 'https://another-example.com',
          },
        },
      };
    });

    it('returns valid oidc authentication config when supported event params provided', () => {
      baseValidEvent.alb.authenticateOidc.requestExtraParams = { key: 'value' };
      baseValidEvent.alb.authenticateOidc.scope = 'first_name other_name';
      baseValidEvent.alb.authenticateOidc.sessionCookieName = '🍪';
      baseValidEvent.alb.authenticateOidc.sessionTimeout = 15;
      expect(awsCompileAlbEvents.validateOidcAuth(baseValidEvent, '')).to.deep.equal({
        authorizationEndpoint: 'https://example.com',
        clientId: 'i-am-client',
        clientSecret: 'i-am-secret',
        issuer: 'https://www.iamscam.com',
        tokenEndpoint: 'http://somewhere.org',
        userInfoEndpoint: 'https://another-example.com',
        onUnauthenticatedRequest: 'deny',
        requestExtraParams: {
          key: 'value',
        },
        scope: 'first_name other_name',
        sessionCookieName: '🍪',
        sessionTimeout: 15,
      });
    });

    it('returns valid oidc authentication config when allowUnauthenticated is true', () => {
      baseValidEvent.alb.authenticateOidc.allowUnauthenticated = true;
      expect(awsCompileAlbEvents.validateOidcAuth(baseValidEvent, '')).to.deep.equal({
        authorizationEndpoint: 'https://example.com',
        clientId: 'i-am-client',
        clientSecret: 'i-am-secret',
        issuer: 'https://www.iamscam.com',
        tokenEndpoint: 'http://somewhere.org',
        userInfoEndpoint: 'https://another-example.com',
        onUnauthenticatedRequest: 'allow',
      });
    });

    it('returns valid oidc authentication config when clientSecret is omitted and useExistingClientSecret provided', () => {
      delete baseValidEvent.alb.authenticateOidc.clientSecret;
      baseValidEvent.alb.authenticateOidc.useExistingClientSecret = true;
      expect(awsCompileAlbEvents.validateOidcAuth(baseValidEvent, '')).to.deep.equal({
        authorizationEndpoint: 'https://example.com',
        clientId: 'i-am-client',
        onUnauthenticatedRequest: 'deny',
        issuer: 'https://www.iamscam.com',
        tokenEndpoint: 'http://somewhere.org',
        userInfoEndpoint: 'https://another-example.com',
        useExistingClientSecret: true,
      });
    });

    it('throws an error when authenticateOidc is not of type Object', () => {
      const event = { alb: { authenticateOidc: '' } };
      expect(() => awsCompileAlbEvents.validateOidcAuth(event, 'functionName')).to.throw(
        'Invalid ALB event "authenticateOidc" attribute in function "functionName".\n You must provide a object.'
      );
    });

  });

});
