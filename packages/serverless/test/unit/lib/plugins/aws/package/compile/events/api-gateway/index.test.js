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
const { default: AwsCompileApigEvents } = await import(
  '../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js'
)

describe('AwsCompileApigEvents', () => {
  let serverless
  let awsCompileApigEvents
  let options

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    options = { stage: 'dev', region: 'us-east-1' }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'first-service'
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    serverless.service.functions = {
      First: {},
      Second: {},
      Third: {},
    }

    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    awsCompileApigEvents.apiGatewayMethodLogicalIds = []
    awsCompileApigEvents.validated = {}
  })

  describe('#constructor()', () => {
    it('should have hooks', () => {
      expect(awsCompileApigEvents.hooks).toBeDefined()
    })

    it('should set the provider variable to be an instanceof AwsProvider', () => {
      expect(awsCompileApigEvents.provider).toBeInstanceOf(AwsProvider)
    })

    it('should setup an empty array to gather the method logical ids', () => {
      expect(awsCompileApigEvents.apiGatewayMethodLogicalIds).toEqual([])
    })
  })

  describe('#validate()', () => {
    it('should ignore non-http events', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [{ ignored: {} }],
        },
      }
      const validated = awsCompileApigEvents.validate()
      expect(validated.events).toHaveLength(0)
    })

    it('should reject an invalid http event', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [{ http: true }],
        },
      }
      expect(() => awsCompileApigEvents.validate()).toThrow()
    })

    it('should filter non-http events', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [{ http: { method: 'GET', path: 'foo/bar' } }, {}],
        },
        second: {
          events: [{ other: {} }],
        },
      }

      const validated = awsCompileApigEvents.validate()
      expect(validated.events).toHaveLength(1)
    })

    it('should discard a starting slash from paths', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            { http: { method: 'POST', path: '/foo/bar' } },
            { http: 'GET /foo/bar' },
          ],
        },
      }
      const validated = awsCompileApigEvents.validate()
      expect(validated.events).toHaveLength(2)
      expect(validated.events[0].http.path).toBe('foo/bar')
      expect(validated.events[1].http.path).toBe('foo/bar')
    })

    it('should accept the simplified string syntax', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [{ http: 'GET foo/bar' }],
        },
      }
      const validated = awsCompileApigEvents.validate()
      expect(validated.events).toHaveLength(1)
      expect(validated.events[0].http.method).toBe('get')
      expect(validated.events[0].http.path).toBe('foo/bar')
    })

    it('should process cors defaults', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'POST',
                path: 'foo/bar',
                cors: true,
              },
            },
          ],
        },
      }
      const validated = awsCompileApigEvents.validate()
      expect(validated.events[0].http.cors).toBeDefined()
      // CORS is set to true, and the corsPreflight is populated
      expect(validated.corsPreflight).toBeDefined()
    })

    it('should process cors configuration', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'POST',
                path: 'foo/bar',
                cors: {
                  origins: ['example.com'],
                  headers: ['X-Custom-Header'],
                },
              },
            },
          ],
        },
      }
      const validated = awsCompileApigEvents.validate()
      expect(validated.events[0].http.cors.origins).toEqual(['example.com'])
      expect(validated.events[0].http.cors.headers).toContain('X-Custom-Header')
    })
  })

  describe('#compileRestApi()', () => {
    beforeEach(() => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [{ http: { path: 'foo/bar', method: 'POST' } }],
        },
      }
    })

    it('should create a REST API resource', () => {
      awsCompileApigEvents.compileRestApi()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.ApiGatewayRestApi.Type).toBe('AWS::ApiGateway::RestApi')
      expect(resources.ApiGatewayRestApi.Properties.Name).toBe(
        'dev-first-service',
      )
    })

    it('should create a REST API resource with resource policy', () => {
      awsCompileApigEvents.serverless.service.provider.apiGateway = {
        resourcePolicy: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: 'execute-api:Invoke',
            Resource: ['execute-api:/*/*/*'],
          },
        ],
      }
      awsCompileApigEvents.compileRestApi()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.ApiGatewayRestApi.Properties.Policy).toBeDefined()
    })

    it('should not create a REST API resource when restApiId is provided', () => {
      awsCompileApigEvents.serverless.service.provider.apiGateway = {
        restApiId: 'xxx123',
      }
      awsCompileApigEvents.compileRestApi()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.ApiGatewayRestApi).toBeUndefined()
    })
  })

  describe('#compileResources()', () => {
    it('should construct the correct resourcePaths array', () => {
      awsCompileApigEvents.validated.events = [
        { http: { path: '', method: 'GET' } },
        { http: { path: 'foo/bar', method: 'POST' } },
        { http: { path: 'bar/foo', method: 'GET' } },
      ]
      const paths = awsCompileApigEvents.getResourcePaths()
      expect(Object.keys(paths)).toContain('foo')
      expect(Object.keys(paths)).toContain('foo/bar')
      expect(Object.keys(paths)).toContain('bar')
      expect(Object.keys(paths)).toContain('bar/foo')
    })

    it('should create resource resources for each path', () => {
      awsCompileApigEvents.validated.events = [
        { http: { path: 'foo/bar', method: 'GET' } },
      ]
      awsCompileApigEvents.compileResources()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.ApiGatewayResourceFoo).toBeDefined()
      expect(resources.ApiGatewayResourceFoo.Type).toBe(
        'AWS::ApiGateway::Resource',
      )
      expect(resources.ApiGatewayResourceFooBar).toBeDefined()
    })
  })

  describe('#compileMethods()', () => {
    beforeEach(() => {
      awsCompileApigEvents.apiGatewayResources = {
        'users/create': {
          name: 'UsersCreate',
          resourceLogicalId: 'ApiGatewayResourceUsersCreate',
        },
      }
    })

    it('should create method resources', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: {
            path: 'users/create',
            method: 'post',
          },
        },
      ]

      awsCompileApigEvents.compileMethods()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.ApiGatewayMethodUsersCreatePost).toBeDefined()
      expect(resources.ApiGatewayMethodUsersCreatePost.Type).toBe(
        'AWS::ApiGateway::Method',
      )
      expect(
        resources.ApiGatewayMethodUsersCreatePost.Properties.HttpMethod,
      ).toBe('POST')
    })

    it('should have request parameters when they are set', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: {
            path: 'users/create',
            method: 'post',
            integration: 'AWS',
            request: {
              parameters: {
                'method.request.querystring.foo': true,
                'method.request.header.bar': false,
              },
            },
            response: {
              statusCodes: { 200: { pattern: '' } },
            },
          },
        },
      ]
      awsCompileApigEvents.compileMethods()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.ApiGatewayMethodUsersCreatePost.Properties.RequestParameters[
          'method.request.querystring.foo'
        ],
      ).toBe(true)
      expect(
        resources.ApiGatewayMethodUsersCreatePost.Properties.RequestParameters[
          'method.request.header.bar'
        ],
      ).toBe(false)
    })
  })

  describe('#compileAuthorizers()', () => {
    it('should create an authorizer with minimal configuration', () => {
      awsCompileApigEvents.validated.events = [
        {
          http: {
            path: 'users/create',
            method: 'POST',
            authorizer: {
              name: 'authorizer',
              arn: { 'Fn::GetAtt': ['SomeLambdaFunction', 'Arn'] },
              resultTtlInSeconds: 300,
              identitySource: 'method.request.header.Authorization',
            },
          },
        },
      ]

      awsCompileApigEvents.compileAuthorizers()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.AuthorizerApiGatewayAuthorizer).toBeDefined()
      expect(resources.AuthorizerApiGatewayAuthorizer.Type).toBe(
        'AWS::ApiGateway::Authorizer',
      )
      expect(
        resources.AuthorizerApiGatewayAuthorizer.Properties
          .AuthorizerResultTtlInSeconds,
      ).toBe(300)
      expect(resources.AuthorizerApiGatewayAuthorizer.Properties.Name).toBe(
        'authorizer',
      )
      expect(resources.AuthorizerApiGatewayAuthorizer.Properties.Type).toBe(
        'TOKEN',
      )
    })

    it('should create a REQUEST authorizer when identitySource includes querystring', () => {
      awsCompileApigEvents.validated.events = [
        {
          http: {
            path: 'users/create',
            method: 'POST',
            authorizer: {
              name: 'authorizer',
              arn: 'arn:aws:lambda:us-east-1:12345:function:authorizer',
              resultTtlInSeconds: 0,
              identitySource: 'method.request.querystring.token',
              type: 'request',
            },
          },
        },
      ]

      awsCompileApigEvents.compileAuthorizers()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.AuthorizerApiGatewayAuthorizer.Properties.Type).toBe(
        'REQUEST',
      )
    })

    it('should not create an authorizer when none is specified', () => {
      awsCompileApigEvents.validated.events = [
        {
          http: {
            path: 'users/create',
            method: 'POST',
          },
        },
      ]

      awsCompileApigEvents.compileAuthorizers()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(Object.keys(resources)).toHaveLength(0)
    })
  })

  describe('#compilePermissions()', () => {
    it('should create limited permission resource scope to REST API', () => {
      awsCompileApigEvents.validated.events = [
        {
          functionName: 'First',
          http: { path: 'foo/bar', method: 'post' },
        },
      ]
      awsCompileApigEvents.permissionMapping = [
        {
          lambdaLogicalId: 'FirstLambdaFunction',
          resourceName: 'FooBar',
          event: {
            http: { path: 'foo/bar', method: 'post' },
            functionName: 'First',
          },
        },
      ]

      awsCompileApigEvents.compilePermissions()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLambdaPermissionApiGateway).toBeDefined()
      expect(resources.FirstLambdaPermissionApiGateway.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(
        resources.FirstLambdaPermissionApiGateway.Properties.FunctionName[
          'Fn::GetAtt'
        ][0],
      ).toBe('FirstLambdaFunction')
    })
  })

  describe('#compileDeployment()', () => {
    beforeEach(() => {
      awsCompileApigEvents.apiGatewayMethodLogicalIds = [
        'method-dependency1',
        'method-dependency2',
      ]
    })

    it('should create a deployment resource', () => {
      awsCompileApigEvents.compileDeployment()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const deploymentKey = Object.keys(resources)[0]
      expect(resources[deploymentKey].Type).toBe('AWS::ApiGateway::Deployment')
      expect(resources[deploymentKey].DependsOn).toEqual([
        'method-dependency1',
        'method-dependency2',
      ])
      expect(resources[deploymentKey].Properties.StageName).toBe('dev')
    })

    it('should create a deployment resource with description', () => {
      awsCompileApigEvents.serverless.service.provider.apiGateway = {
        description: 'Some Description',
      }
      awsCompileApigEvents.compileDeployment()
      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const deploymentKey = Object.keys(resources)[0]
      expect(resources[deploymentKey].Properties.Description).toBe(
        'Some Description',
      )
    })
  })

  describe('#compileUsagePlan()', () => {
    beforeEach(() => {
      awsCompileApigEvents.apiGatewayDeploymentLogicalId =
        'ApiGatewayDeploymentTest'
    })

    it('should compile default usage plan resource', () => {
      serverless.service.provider.apiGateway = { apiKeys: ['1234567890'] }
      awsCompileApigEvents.compileUsagePlan()

      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      const usagePlanKey =
        awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()

      expect(resources[usagePlanKey]).toBeDefined()
      expect(resources[usagePlanKey].Type).toBe('AWS::ApiGateway::UsagePlan')
      expect(resources[usagePlanKey].DependsOn).toBe('ApiGatewayDeploymentTest')
    })

    it('should support custom usage plan resource', () => {
      serverless.service.provider.apiGateway = {
        usagePlan: {
          quota: { limit: 500, offset: 10, period: 'MONTH' },
          throttle: { burstLimit: 200, rateLimit: 100 },
        },
      }
      awsCompileApigEvents.compileUsagePlan()

      const resources =
        awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      const usagePlanKey =
        awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()

      expect(resources[usagePlanKey].Properties.Quota.Limit).toBe(500)
      expect(resources[usagePlanKey].Properties.Throttle.BurstLimit).toBe(200)
    })
  })

  // Note: Request validator tests require method resources to be compiled first
  // (they expect httpApiResourceTemplate to exist). These require more complex setup
  // or integration testing.

  describe('no events', () => {
    it('should not create any resources when no http events', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: { events: [] },
      }

      const validated = awsCompileApigEvents.validate()
      expect(validated.events).toHaveLength(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileApigEvents.serverless.service.functions = {
        first: {
          events: [{ websocket: '$connect' }],
        },
      }

      expect(() => awsCompileApigEvents.validate()).not.toThrow()
    })
  })
})
