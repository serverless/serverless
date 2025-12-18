import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: Serverless } = await import(
  '../../../../../../../../../lib/serverless.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: AwsCompileAlbEvents } = await import(
  '../../../../../../../../../lib/plugins/aws/package/compile/events/alb/index.js'
)

describe('AwsCompileAlbEvents', () => {
  let serverless
  let awsCompileAlbEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'some-service'
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.service.functions = {
      first: {},
      second: {},
      third: {},
    }

    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless, options)
  })

  describe('constructor', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileAlbEvents.provider).toBeInstanceOf(AwsProvider)
    })

    it('should define hooks', () => {
      expect(awsCompileAlbEvents.hooks).toHaveProperty('package:compileEvents')
    })
  })

  describe('#validate()', () => {
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
                  ip: [
                    '192.168.0.1/1',
                    'fe80:0000:0000:0000:0204:61ff:fe9d:f156/3',
                  ],
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
      }

      const validated = awsCompileAlbEvents.validate()

      expect(validated.events).toEqual([
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
      ])
    })

    it('should detect all alb authorizers declared in provider', () => {
      awsCompileAlbEvents.serverless.service.functions = {}
      awsCompileAlbEvents.serverless.service.provider.alb = {
        authorizers: {
          myFirstAuth: {
            type: 'cognito',
            userPoolArn:
              'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
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
      }

      const validated = awsCompileAlbEvents.validate()

      expect(validated.authorizers).toEqual({
        myFirstAuth: {
          type: 'cognito',
          userPoolArn:
            'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
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
      })
    })

    describe('#validateListenerArnAndExtractAlbId()', () => {
      it('returns the alb ID when given a valid listener ARN', () => {
        const listenerArn =
          'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2'
        expect(
          awsCompileAlbEvents.validateListenerArn(listenerArn, 'functionname'),
        ).toEqual({
          albId: '50dc6c495c0c9188',
          listenerId: 'f2f7dc8efc522ab2',
        })
      })

      it('returns the alb ID when given a valid listener ARN using non-standard partition', () => {
        const listenerArn =
          'arn:aws-us-gov:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2'
        expect(
          awsCompileAlbEvents.validateListenerArn(listenerArn, 'functionname'),
        ).toEqual({
          albId: '50dc6c495c0c9188',
          listenerId: 'f2f7dc8efc522ab2',
        })
      })

      it('returns the ref when given an object for the listener ARN', () => {
        const listenerArn = { Ref: 'HTTPListener1' }
        expect(
          awsCompileAlbEvents.validateListenerArn(listenerArn, 'functionname'),
        ).toEqual({
          albId: 'HTTPListener1',
          listenerId: 'HTTPListener1',
        })
      })
    })

    describe('#validatePriorities()', () => {
      it('should throw if multiple events use the same priority and the same listener', () => {
        const albEvents = [
          { priority: 1, listenerId: 'aaa', functionName: 'foo' },
          { priority: 1, listenerId: 'aaa', functionName: 'bar' },
        ]
        expect(() =>
          awsCompileAlbEvents.validatePriorities(albEvents),
        ).toThrow()
      })

      it('should throw a special error if multiple events use the same priority and a different listener in the same function', () => {
        const albEvents = [
          { priority: 1, listenerId: 'aaa', functionName: 'foo' },
          { priority: 1, listenerId: 'bbb', functionName: 'foo' },
        ]
        expect(() => awsCompileAlbEvents.validatePriorities(albEvents)).toThrow(
          /Serverless limitation/,
        )
      })

      it('should not throw if multiple events use the same priority and a different listener in different functions', () => {
        const albEvents = [
          { priority: 1, listenerId: 'aaa', functionName: 'foo' },
          { priority: 1, listenerId: 'bbb', functionName: 'bar' },
        ]
        expect(() =>
          awsCompileAlbEvents.validatePriorities(albEvents),
        ).not.toThrow()
      })

      it('should not throw when all priorities are unique', () => {
        const albEvents = [
          { priority: 1, listenerId: 'aaa', functionName: 'foo' },
          { priority: 2, listenerId: 'bbb', functionName: 'bar' },
        ]
        expect(() =>
          awsCompileAlbEvents.validatePriorities(albEvents),
        ).not.toThrow()
      })
    })

    describe('#validateEventAuthorizers()', () => {
      it('returns valid authorizer array when string provided', () => {
        const event = {
          alb: {
            authorizer: 'myFirstAuth',
          },
        }
        const auths = {
          myFirstAuth: {},
        }
        expect(
          awsCompileAlbEvents.validateEventAuthorizers(event, auths, ''),
        ).toEqual(['myFirstAuth'])
      })

      it('returns valid authorizer array when array provided', () => {
        const event = {
          alb: {
            authorizer: ['myFirstAuth', 'mySecondAuth'],
          },
        }
        const auths = {
          myFirstAuth: {},
          mySecondAuth: {},
        }
        expect(
          awsCompileAlbEvents.validateEventAuthorizers(event, auths, ''),
        ).toEqual(['myFirstAuth', 'mySecondAuth'])
      })

      it('throws an error when authorizer does not match any registered authorizers in provider', () => {
        const event = {
          alb: {
            authorizer: 'unknownAuth',
          },
        }
        const auths = {
          myFirstAuth: {},
        }
        expect(() =>
          awsCompileAlbEvents.validateEventAuthorizers(
            event,
            auths,
            'functionName',
          ),
        ).toThrow(
          'No match for "unknownAuth" in function "functionName" found in registered ALB authorizers',
        )
      })
    })
  })

  describe('#compileListenerRules()', () => {
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
            userPoolArn:
              'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341',
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
      }

      awsCompileAlbEvents.compileListenerRules()

      const resources =
        awsCompileAlbEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstAlbListenerRule1).toEqual({
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
              HostHeaderConfig: {
                Values: ['example.com'],
              },
            },
          ],
          ListenerArn:
            'arn:aws:elasticloadbalancing:' +
            'us-east-1:123456789012:listener/app/my-load-balancer/' +
            '50dc6c495c0c9188/f2f7dc8efc522ab2',
          Priority: 1,
        },
      })

      expect(resources.SecondAlbListenerRule2).toEqual({
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
      })

      expect(resources.ThirdAlbListenerRule3).toEqual({
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
      })
    })
  })

  describe('#compileTargetGroups()', () => {
    it('should create ELB target group resources', () => {
      awsCompileAlbEvents.validated = {
        events: [
          {
            functionName: 'first',
            albId: '50dc6c495c0c9188',
            multiValueHeaders: true,
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
          {
            functionName: 'second',
            albId: '50dc6c495c0c9188',
            listenerArn:
              'arn:aws:elasticloadbalancing:' +
              'us-east-1:123456789012:listener/app/my-load-balancer/' +
              '50dc6c495c0c9188/f2f7dc8efc522ab2',
            priority: 2,
            conditions: {
              path: '/world',
            },
          },
          {
            // Same function, same alb, different listener/priority
            functionName: 'second',
            albId: '50dc6c495c0c9188',
            listenerArn:
              'arn:aws:elasticloadbalancing:' +
              'us-east-1:123456789012:listener/app/my-load-balancer/' +
              '50dc6c495c0c9188/4e83ccee674eb02d',
            priority: 3,
            conditions: {
              path: '/world',
            },
          },
        ],
      }

      awsCompileAlbEvents.compileTargetGroups()

      const resources =
        awsCompileAlbEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstAlbMultiValueTargetGroup50dc6c495c0c9188).toEqual({
        Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        Properties: {
          Name: 'cee340765bf4be569254b8969c1d07a0',
          TargetType: 'lambda',
          Targets: [
            {
              Id: {
                'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
              },
            },
          ],
          TargetGroupAttributes: [
            {
              Key: 'lambda.multi_value_headers.enabled',
              Value: true,
            },
          ],
          Tags: [
            {
              Key: 'Name',
              Value: 'some-service-first-50dc6c495c0c9188-dev',
            },
          ],
          HealthCheckEnabled: false,
        },
        DependsOn: ['FirstLambdaPermissionRegisterTarget'],
      })

      expect(resources.SecondAlbTargetGroup50dc6c495c0c9188).toEqual({
        Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        Properties: {
          Name: '2107a18b6db85bd904d38cb2bdf5af5c',
          TargetType: 'lambda',
          Targets: [
            {
              Id: {
                'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
              },
            },
          ],
          TargetGroupAttributes: [
            {
              Key: 'lambda.multi_value_headers.enabled',
              Value: false,
            },
          ],
          Tags: [
            {
              Key: 'Name',
              Value: 'some-service-second-50dc6c495c0c9188-dev',
            },
          ],
          HealthCheckEnabled: false,
        },
        DependsOn: ['SecondLambdaPermissionRegisterTarget'],
      })

      // Target groups are unique to functions/albs, so there should only be 2 target groups
      expect(Object.keys(resources).length).toBe(2)
    })

    describe('health checks', () => {
      const healthCheckDefaults = {
        HealthCheckEnabled: false,
        HealthCheckPath: '/',
        HealthCheckIntervalSeconds: 35,
        HealthCheckTimeoutSeconds: 30,
        HealthyThresholdCount: 5,
        UnhealthyThresholdCount: 5,
        Matcher: { HttpCode: '200' },
      }

      it('should have health check disabled by default', () => {
        awsCompileAlbEvents.validated = {
          events: [
            {
              functionName: 'first',
              albId: '50dc6c495c0c9188',
              priority: 1,
              conditions: { path: '/' },
            },
          ],
        }

        awsCompileAlbEvents.compileTargetGroups()

        const resources =
          awsCompileAlbEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources
        const targetGroup = resources.FirstAlbTargetGroup50dc6c495c0c9188

        expect(targetGroup.Properties.HealthCheckEnabled).toBe(
          healthCheckDefaults.HealthCheckEnabled,
        )
        expect(targetGroup.Properties.HealthCheckPath).toBeUndefined()
        expect(
          targetGroup.Properties.HealthCheckIntervalSeconds,
        ).toBeUndefined()
        expect(targetGroup.Properties.HealthCheckTimeoutSeconds).toBeUndefined()
        expect(targetGroup.Properties.HealthyThresholdCount).toBeUndefined()
        expect(targetGroup.Properties.UnhealthyThresholdCount).toBeUndefined()
        expect(targetGroup.Properties.Matcher).toBeUndefined()
      })

      it('should enable health check with defaults when healthCheck is truthy', () => {
        awsCompileAlbEvents.validated = {
          events: [
            {
              functionName: 'first',
              albId: '50dc6c495c0c9188',
              priority: 1,
              conditions: { path: '/' },
              healthCheck: { enabled: true },
            },
          ],
        }

        awsCompileAlbEvents.compileTargetGroups()

        const resources =
          awsCompileAlbEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources
        const targetGroup = resources.FirstAlbTargetGroup50dc6c495c0c9188

        expect(targetGroup.Properties.HealthCheckEnabled).toBe(true)
        expect(targetGroup.Properties.HealthCheckPath).toBe(
          healthCheckDefaults.HealthCheckPath,
        )
        expect(targetGroup.Properties.HealthCheckIntervalSeconds).toBe(
          healthCheckDefaults.HealthCheckIntervalSeconds,
        )
        expect(targetGroup.Properties.HealthCheckTimeoutSeconds).toBe(
          healthCheckDefaults.HealthCheckTimeoutSeconds,
        )
        expect(targetGroup.Properties.HealthyThresholdCount).toBe(
          healthCheckDefaults.HealthyThresholdCount,
        )
        expect(targetGroup.Properties.UnhealthyThresholdCount).toBe(
          healthCheckDefaults.UnhealthyThresholdCount,
        )
        expect(targetGroup.Properties.Matcher).toEqual(
          healthCheckDefaults.Matcher,
        )
      })

      it('should enable health check with custom settings when healthCheck is an object', () => {
        awsCompileAlbEvents.validated = {
          events: [
            {
              functionName: 'first',
              albId: '50dc6c495c0c9188',
              priority: 1,
              conditions: { path: '/' },
              healthCheck: {
                enabled: true,
                path: '/health',
                intervalSeconds: 70,
                timeoutSeconds: 50,
                healthyThresholdCount: 7,
                unhealthyThresholdCount: 7,
                matcher: { httpCode: '200-299' },
              },
            },
          ],
        }

        awsCompileAlbEvents.compileTargetGroups()

        const resources =
          awsCompileAlbEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources
        const targetGroup = resources.FirstAlbTargetGroup50dc6c495c0c9188

        expect(targetGroup.Properties.HealthCheckEnabled).toBe(true)
        expect(targetGroup.Properties.HealthCheckPath).toBe('/health')
        expect(targetGroup.Properties.HealthCheckIntervalSeconds).toBe(70)
        expect(targetGroup.Properties.HealthCheckTimeoutSeconds).toBe(50)
        expect(targetGroup.Properties.HealthyThresholdCount).toBe(7)
        expect(targetGroup.Properties.UnhealthyThresholdCount).toBe(7)
        expect(targetGroup.Properties.Matcher).toEqual({ HttpCode: '200-299' })
      })

      it('should use defaults for any undefined advanced settings', () => {
        awsCompileAlbEvents.validated = {
          events: [
            {
              functionName: 'first',
              albId: '50dc6c495c0c9188',
              priority: 1,
              conditions: { path: '/' },
              healthCheck: {
                path: '/health',
                intervalSeconds: 70,
              },
            },
          ],
        }

        awsCompileAlbEvents.compileTargetGroups()

        const resources =
          awsCompileAlbEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources
        const targetGroup = resources.FirstAlbTargetGroup50dc6c495c0c9188

        expect(targetGroup.Properties.HealthCheckPath).toBe('/health')
        expect(targetGroup.Properties.HealthCheckIntervalSeconds).toBe(70)
        expect(targetGroup.Properties.HealthCheckTimeoutSeconds).toBe(
          healthCheckDefaults.HealthCheckTimeoutSeconds,
        )
        expect(targetGroup.Properties.HealthyThresholdCount).toBe(
          healthCheckDefaults.HealthyThresholdCount,
        )
        expect(targetGroup.Properties.UnhealthyThresholdCount).toBe(
          healthCheckDefaults.UnhealthyThresholdCount,
        )
        expect(targetGroup.Properties.Matcher).toEqual(
          healthCheckDefaults.Matcher,
        )
      })
    })
  })

  describe('#compilePermissions()', () => {
    it('should create Lambda permission resources', () => {
      awsCompileAlbEvents.validated = {
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
            albId: '50dc6c495c0c9188',
          },
          {
            functionName: 'second',
            listenerArn:
              'arn:aws:elasticloadbalancing:' +
              'us-east-1:123456789012:listener/app/my-load-balancer/' +
              '50dc6c495c0c9188/f2f7dc8efc522ab2',
            priority: 2,
            conditions: {
              path: '/world',
            },
            albId: '50dc6c495c0c9188',
          },
        ],
      }

      awsCompileAlbEvents.compilePermissions()

      const resources =
        awsCompileAlbEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLambdaPermissionAlb).toEqual({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          Action: 'lambda:InvokeFunction',
          FunctionName: {
            'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
          },
          Principal: 'elasticloadbalancing.amazonaws.com',
          SourceArn: {
            Ref: 'FirstAlbTargetGroup50dc6c495c0c9188',
          },
        },
      })

      expect(resources.FirstLambdaPermissionRegisterTarget).toEqual({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          Action: 'lambda:InvokeFunction',
          FunctionName: {
            'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
          },
          Principal: 'elasticloadbalancing.amazonaws.com',
        },
      })

      expect(resources.SecondLambdaPermissionAlb).toEqual({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          Action: 'lambda:InvokeFunction',
          FunctionName: {
            'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
          },
          Principal: 'elasticloadbalancing.amazonaws.com',
          SourceArn: {
            Ref: 'SecondAlbTargetGroup50dc6c495c0c9188',
          },
        },
      })

      expect(resources.SecondLambdaPermissionRegisterTarget).toEqual({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          Action: 'lambda:InvokeFunction',
          FunctionName: {
            'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
          },
          Principal: 'elasticloadbalancing.amazonaws.com',
        },
      })
    })
  })

  describe('no events', () => {
    it('should not create any resources when no alb events', () => {
      awsCompileAlbEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileAlbEvents.validated = awsCompileAlbEvents.validate()

      expect(awsCompileAlbEvents.validated.events).toHaveLength(0)
      expect(
        Object.keys(
          awsCompileAlbEvents.serverless.service.provider
            .compiledCloudFormationTemplate.Resources,
        ),
      ).toHaveLength(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileAlbEvents.serverless.service.functions = {
        first: {
          events: [{ http: { path: 'foo', method: 'get' } }],
        },
      }

      expect(() => awsCompileAlbEvents.validate()).not.toThrow()
    })
  })
})
