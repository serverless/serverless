import { jest, describe, beforeEach, it, expect } from '@jest/globals'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

// Import after mocking
const { default: HttpApiEvents } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/http-api.js')
const { default: AwsProvider } =
  await import('../../../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../../../lib/serverless.js')

describe('HttpApiEvents', () => {
  let serverless
  let httpApiEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    serverless._logDeprecation = jest.fn()
    const options = { region: 'us-east-1', stage: 'dev' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    httpApiEvents = new HttpApiEvents(serverless)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(httpApiEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#resolveConfiguration()', () => {
    it('should resolve configuration for string event', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.routes.size).toBe(1)
    })

    it('should resolve configuration for object event', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: { method: 'POST', path: '/test' } }],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.routes.size).toBe(1)
    })

    it('should resolve configuration for catch-all route', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: '*' }],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.routes.size).toBe(1)
    })

    it('should not configure routes when no httpApi events', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.routes.size).toBe(0)
    })

    it('should support multiple routes for same function', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [
            { httpApi: 'GET /test1' },
            { httpApi: 'POST /test2' },
            { httpApi: 'PUT /test3' },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.routes.size).toBe(3)
    })

    it('should resolve CORS configuration', () => {
      serverless.service.provider.httpApi = {
        cors: true,
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.cors).toBeDefined()
    })

    it('should support authorizer configuration', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myAuthorizer: {
            type: 'jwt',
            identitySource: '$request.header.Authorization',
            issuerUrl: 'https://example.com/',
            audience: ['api'],
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/test',
                authorizer: { name: 'myAuthorizer' },
              },
            },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.routes.size).toBe(1)
    })
  })

  describe('#compileApi()', () => {
    it('should create API Gateway V2 API resource', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(1)
      const [, api] = apis[0]
      expect(api.Properties.ProtocolType).toBe('HTTP')
    })
  })

  describe('#compileStage()', () => {
    it('should create stage resource', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const stages = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Stage',
      )

      expect(stages.length).toBe(1)
      const [, stage] = stages[0]
      expect(stage.Properties.StageName).toBe('$default')
      expect(stage.Properties.AutoDeploy).toBe(true)
    })
  })

  describe('#compileEndpoints()', () => {
    it('should create route and integration resources', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )
      const integrations = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Integration',
      )
      const permissions = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::Permission',
      )

      expect(routes.length).toBe(1)
      expect(integrations.length).toBe(1)
      expect(permissions.length).toBe(1)
    })

    it('should set correct route key', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'POST /users' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )

      expect(routes.length).toBe(1)
      const [, route] = routes[0]
      expect(route.Properties.RouteKey).toBe('POST /users')
    })

    it('should create Lambda permission with correct principal', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const permissions = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::Permission',
      )

      expect(permissions.length).toBe(1)
      const [, permission] = permissions[0]
      expect(permission.Properties.Principal).toBe('apigateway.amazonaws.com')
    })
  })

  describe('when no httpApi events are defined', () => {
    it('should not create any API Gateway resources', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      httpApiEvents.resolveConfiguration()

      // No routes configured, so compileApi etc. won't be called
      expect(httpApiEvents.config.routes.size).toBe(0)
    })

    it('should not throw when other events are present', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ sns: 'myTopic' }],
        },
      }

      expect(() => httpApiEvents.resolveConfiguration()).not.toThrow()
    })
  })

  describe('#compileAuthorizers()', () => {
    it('should create JWT authorizer resource', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myJwtAuth: {
            type: 'jwt',
            identitySource: '$request.header.Authorization',
            issuerUrl:
              'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXX',
            audience: ['client-id-1', 'client-id-2'],
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/test',
                authorizer: { name: 'myJwtAuth' },
              },
            },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileAuthorizers()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const authorizers = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Authorizer',
      )

      expect(authorizers.length).toBe(1)
      const [, authorizer] = authorizers[0]
      expect(authorizer.Properties.AuthorizerType).toBe('JWT')
      expect(authorizer.Properties.JwtConfiguration).toBeDefined()
      expect(authorizer.Properties.JwtConfiguration.Issuer).toBe(
        'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXX',
      )
    })

    it('should create Lambda (request) authorizer resource', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myLambdaAuth: {
            type: 'request',
            functionArn:
              'arn:aws:lambda:us-east-1:123456789012:function:authFunction',
            identitySource: '$request.header.Authorization',
            payloadVersion: '2.0',
            enableSimpleResponses: true,
            resultTtlInSeconds: 300,
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/test',
                authorizer: { name: 'myLambdaAuth' },
              },
            },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileAuthorizers()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const authorizers = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Authorizer',
      )

      expect(authorizers.length).toBe(1)
      const [, authorizer] = authorizers[0]
      expect(authorizer.Properties.AuthorizerType).toBe('REQUEST')
      expect(authorizer.Properties.EnableSimpleResponses).toBe(true)
      expect(authorizer.Properties.AuthorizerResultTtlInSeconds).toBe(300)
      expect(authorizer.Properties.AuthorizerPayloadFormatVersion).toBe('2.0')
    })

    it('should create Lambda authorizer with functionName reference', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myLambdaAuth: {
            type: 'request',
            functionName: 'authFunc',
            identitySource: '$request.header.Authorization',
          },
        },
      }
      serverless.service.functions = {
        authFunc: {
          handler: 'auth.handler',
          events: [],
        },
        first: {
          handler: 'index.handler',
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/test',
                authorizer: { name: 'myLambdaAuth' },
              },
            },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileAuthorizers()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const authorizers = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Authorizer',
      )

      expect(authorizers.length).toBe(1)
      // Lambda permission should also be created
      const permissions = Object.entries(resources).filter(
        ([, r]) =>
          r.Type === 'AWS::Lambda::Permission' &&
          r.Properties.Principal === 'apigateway.amazonaws.com',
      )
      expect(permissions.length).toBe(1)
    })

    it('should support AWS_IAM authorization type', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/test',
                authorizer: { type: 'aws_iam' },
              },
            },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )

      expect(routes.length).toBe(1)
      const [, route] = routes[0]
      expect(route.Properties.AuthorizationType).toBe('AWS_IAM')
    })

    it('should support authorization scopes', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myJwtAuth: {
            type: 'jwt',
            identitySource: '$request.header.Authorization',
            issuerUrl: 'https://example.com/',
            audience: ['api'],
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/test',
                authorizer: {
                  name: 'myJwtAuth',
                  scopes: ['read:data', 'write:data'],
                },
              },
            },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileAuthorizers()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )

      expect(routes.length).toBe(1)
      const [, route] = routes[0]
      expect(route.Properties.AuthorizationScopes).toEqual([
        'read:data',
        'write:data',
      ])
    })

    it('should throw when authorizers configured for external API', () => {
      serverless.service.provider.httpApi = {
        id: 'existing-api-id',
        authorizers: {
          myAuth: {
            type: 'jwt',
            identitySource: '$request.header.Authorization',
            issuerUrl: 'https://example.com/',
            audience: ['api'],
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      expect(() => httpApiEvents.resolveConfiguration()).toThrow(
        /Cannot setup authorizers for externally configured HTTP API/,
      )
    })

    it('should throw when request authorizer has neither functionArn nor functionName', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myAuth: {
            type: 'request',
            identitySource: '$request.header.Authorization',
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      expect(() => httpApiEvents.resolveConfiguration()).toThrow(
        /Either "functionArn" or "functionName" property needs to be set/,
      )
    })

    it('should throw when request authorizer has both functionArn and functionName', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myAuth: {
            type: 'request',
            functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:auth',
            functionName: 'authFunc',
            identitySource: '$request.header.Authorization',
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      expect(() => httpApiEvents.resolveConfiguration()).toThrow(
        /Either "functionArn" or "functionName" \(not both\)/,
      )
    })

    it('should throw when resultTtlInSeconds set without identitySource', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myAuth: {
            type: 'request',
            functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:auth',
            resultTtlInSeconds: 300,
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      expect(() => httpApiEvents.resolveConfiguration()).toThrow(
        /identitySource.*has to be set.*when.*resultTtlInSeconds/,
      )
    })

    it('should throw when functionName does not exist in service', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myAuth: {
            type: 'request',
            functionName: 'nonExistent',
            identitySource: '$request.header.Authorization',
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      expect(() => httpApiEvents.resolveConfiguration()).toThrow(
        /Function "nonExistent" for HTTP API authorizer/,
      )
    })

    it('should support managedExternally for Lambda authorizer', () => {
      serverless.service.provider.httpApi = {
        authorizers: {
          myLambdaAuth: {
            type: 'request',
            functionArn:
              'arn:aws:lambda:us-east-1:123456789012:function:authFunction',
            identitySource: '$request.header.Authorization',
            managedExternally: true,
          },
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/test',
                authorizer: { name: 'myLambdaAuth' },
              },
            },
          ],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileAuthorizers()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      // When managedExternally is true, no Lambda permission should be created
      const permissions = Object.entries(resources).filter(([name]) =>
        name.includes('AuthorizerPermission'),
      )
      expect(permissions.length).toBe(0)
    })
  })

  describe('#compileLogGroup()', () => {
    it('should create log group for access logs', () => {
      serverless.service.provider.logs = {
        httpApi: true,
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileLogGroup()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const logGroups = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Logs::LogGroup',
      )

      expect(logGroups.length).toBe(1)
    })

    it('should not create log group when logs not configured', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileLogGroup()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const logGroups = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Logs::LogGroup',
      )

      expect(logGroups.length).toBe(0)
    })

    it('should configure access log settings in stage', () => {
      serverless.service.provider.logs = {
        httpApi: true,
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileLogGroup()
      httpApiEvents.compileStage()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const stages = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Stage',
      )

      expect(stages.length).toBe(1)
      const [, stage] = stages[0]
      expect(stage.Properties.AccessLogSettings).toBeDefined()
      expect(stage.Properties.AccessLogSettings.DestinationArn).toBeDefined()
    })

    it('should support custom log format', () => {
      const customFormat =
        '{"requestId":"$context.requestId","ip":"$context.identity.sourceIp"}'
      serverless.service.provider.logs = {
        httpApi: {
          format: customFormat,
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()

      expect(httpApiEvents.config.accessLogFormat).toBe(customFormat)
    })
  })

  describe('disableDefaultEndpoint', () => {
    it('should set DisableExecuteApiEndpoint when configured', () => {
      serverless.service.provider.httpApi = {
        disableDefaultEndpoint: true,
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(1)
      const [, api] = apis[0]
      expect(api.Properties.DisableExecuteApiEndpoint).toBe(true)
    })

    it('should not set DisableExecuteApiEndpoint when not configured', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(1)
      const [, api] = apis[0]
      expect(api.Properties.DisableExecuteApiEndpoint).toBeUndefined()
    })
  })

  describe('external API ID', () => {
    it('should not create API resource when external ID is used', () => {
      serverless.service.provider.httpApi = {
        id: 'existing-api-id',
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(0)
    })

    it('should not create Stage resource when external ID is used', () => {
      serverless.service.provider.httpApi = {
        id: 'existing-api-id',
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const stages = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Stage',
      )

      expect(stages.length).toBe(0)
    })

    it('should use external API ID in route/integration resources', () => {
      serverless.service.provider.httpApi = {
        id: 'existing-api-id',
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )

      expect(routes.length).toBe(1)
      const [, route] = routes[0]
      expect(route.Properties.ApiId).toBe('existing-api-id')
    })
  })

  describe('payload format version', () => {
    it('should default to payload format 2.0', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const integrations = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Integration',
      )

      expect(integrations.length).toBe(1)
      const [, integration] = integrations[0]
      expect(integration.Properties.PayloadFormatVersion).toBe('2.0')
    })
  })

  describe('CORS configuration', () => {
    it('should configure CORS with object settings', () => {
      serverless.service.provider.httpApi = {
        cors: {
          allowedOrigins: ['https://example.com'],
          allowedMethods: ['GET', 'POST'],
          allowedHeaders: ['Content-Type', 'Authorization'],
          allowCredentials: true,
          maxAge: 86400,
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(1)
      const [, api] = apis[0]
      expect(api.Properties.CorsConfiguration).toBeDefined()
      expect(api.Properties.CorsConfiguration.AllowOrigins).toContain(
        'https://example.com',
      )
      expect(api.Properties.CorsConfiguration.AllowCredentials).toBe(true)
      expect(api.Properties.CorsConfiguration.MaxAge).toBe(86400)
    })

    it('should configure default CORS when set to true', () => {
      serverless.service.provider.httpApi = {
        cors: true,
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(1)
      const [, api] = apis[0]
      expect(api.Properties.CorsConfiguration).toBeDefined()
    })

    it('should support exposedResponseHeaders', () => {
      serverless.service.provider.httpApi = {
        cors: {
          exposedResponseHeaders: ['X-Custom-Header', 'X-Request-Id'],
        },
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(1)
      const [, api] = apis[0]
      expect(api.Properties.CorsConfiguration.ExposeHeaders).toEqual([
        'X-Custom-Header',
        'X-Request-Id',
      ])
    })
  })

  describe('provider tags', () => {
    it('should apply provider tags to API', () => {
      serverless.service.provider.tags = {
        Environment: 'test',
        Project: 'demo',
      }
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /test' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const apis = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Api',
      )

      expect(apis.length).toBe(1)
      const [, api] = apis[0]
      expect(api.Properties.Tags).toBeDefined()
      expect(api.Properties.Tags.Environment).toBe('test')
      expect(api.Properties.Tags.Project).toBe('demo')
    })
  })

  describe('route configuration', () => {
    it('should support path parameters', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /users/{userId}' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )

      expect(routes.length).toBe(1)
      const [, route] = routes[0]
      expect(route.Properties.RouteKey).toBe('GET /users/{userId}')
    })

    it('should support greedy path parameters', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: 'GET /files/{proxy+}' }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )

      expect(routes.length).toBe(1)
      const [, route] = routes[0]
      expect(route.Properties.RouteKey).toBe('GET /files/{proxy+}')
    })

    it('should support ANY method', () => {
      serverless.service.functions = {
        first: {
          handler: 'index.handler',
          events: [{ httpApi: { method: 'ANY', path: '/api' } }],
        },
      }

      httpApiEvents.resolveConfiguration()
      httpApiEvents.cfTemplate =
        serverless.service.provider.compiledCloudFormationTemplate
      httpApiEvents.compileApi()
      httpApiEvents.compileStage()
      httpApiEvents.compileEndpoints()

      const resources =
        serverless.service.provider.compiledCloudFormationTemplate.Resources

      const routes = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::ApiGatewayV2::Route',
      )

      expect(routes.length).toBe(1)
      const [, route] = routes[0]
      expect(route.Properties.RouteKey).toBe('ANY /api')
    })
  })
})
