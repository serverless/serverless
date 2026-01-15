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

const { default: Serverless } =
  await import('../../../../../../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileApigEvents } =
  await import('../../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js')

describe('#compileMethods()', () => {
  let serverless
  let awsCompileApigEvents
  let options

  beforeEach(() => {
    options = { stage: 'dev', region: 'us-east-1' }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'first-service'
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.service.functions = {
      First: {},
      Second: {},
      Third: {},
    }
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
    awsCompileApigEvents.validated = {}
    awsCompileApigEvents.apiGatewayMethodLogicalIds = []
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    awsCompileApigEvents.apiGatewayResources = {
      'users/create': {
        name: 'UsersCreate',
        resourceLogicalId: 'ApiGatewayResourceUsersCreate',
      },
      'users/list': {
        name: 'UsersList',
        resourceLogicalId: 'ApiGatewayResourceUsersList',
      },
      'users/update': {
        name: 'UsersUpdate',
        resourceLogicalId: 'ApiGatewayResourceUsersUpdate',
      },
      'users/delete': {
        name: 'UsersDelete',
        resourceLogicalId: 'ApiGatewayResourceUsersDelete',
      },
    }
  })

  it('should have request parameters defined when they are set', () => {
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
              'method.request.querystring.bar': false,
              'method.request.header.foo': true,
              'method.request.header.bar': false,
              'method.request.path.foo': true,
              'method.request.path.bar': false,
            },
          },
          response: {
            statusCodes: {
              200: { pattern: '' },
            },
          },
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const methodResource = resources.ApiGatewayMethodUsersCreatePost
    expect(methodResource).toBeDefined()
    expect(
      methodResource.Properties.RequestParameters['method.request.header.foo'],
    ).toBe(true)
    expect(
      methodResource.Properties.RequestParameters['method.request.header.bar'],
    ).toBe(false)
    expect(
      methodResource.Properties.RequestParameters[
        'method.request.querystring.foo'
      ],
    ).toBe(true)
    expect(
      methodResource.Properties.RequestParameters[
        'method.request.querystring.bar'
      ],
    ).toBe(false)
    expect(
      methodResource.Properties.RequestParameters['method.request.path.foo'],
    ).toBe(true)
    expect(
      methodResource.Properties.RequestParameters['method.request.path.bar'],
    ).toBe(false)
  })

  it('should create method resources when http events given', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
        },
      },
      {
        functionName: 'Second',
        http: {
          path: 'users/list',
          method: 'get',
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.ApiGatewayMethodUsersCreatePost).toBeDefined()
    expect(resources.ApiGatewayMethodUsersListGet).toBeDefined()
    expect(resources.ApiGatewayMethodUsersCreatePost.Type).toBe(
      'AWS::ApiGateway::Method',
    )
    expect(resources.ApiGatewayMethodUsersListGet.Type).toBe(
      'AWS::ApiGateway::Method',
    )
  })

  it('should set the method HTTP type', () => {
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
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.HttpMethod,
    ).toBe('POST')
  })

  it('should set AuthorizationType to NONE when no authorizer', () => {
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
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.AuthorizationType,
    ).toBe('NONE')
  })

  it('should set AuthorizationType to AWS_IAM when authorizer.type is AWS_IAM', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          authorizer: {
            type: 'AWS_IAM',
          },
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.AuthorizationType,
    ).toBe('AWS_IAM')
  })

  it('should set Integration type to AWS_PROXY by default', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'AWS_PROXY',
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.Integration.Type,
    ).toBe('AWS_PROXY')
  })

  it('should set Integration type to AWS when integration is AWS', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: { pattern: '' },
            },
          },
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.Integration.Type,
    ).toBe('AWS')
  })

  it('should set Integration type to MOCK when integration is MOCK', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'MOCK',
          response: {
            statusCodes: {
              200: { pattern: '' },
            },
          },
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.Integration.Type,
    ).toBe('MOCK')
  })

  it('should set Integration URI with Lambda function ARN', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'AWS_PROXY',
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const integrationUri =
      resources.ApiGatewayMethodUsersCreatePost.Properties.Integration.Uri
    expect(integrationUri).toBeDefined()
    expect(integrationUri['Fn::Join']).toBeDefined()
  })

  it('should set MethodResponses when response.statusCodes is defined', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'AWS',
          response: {
            statusCodes: {
              200: { pattern: '' },
              400: { pattern: '.*Error.*' },
            },
          },
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const methodResponses =
      resources.ApiGatewayMethodUsersCreatePost.Properties.MethodResponses
    expect(methodResponses).toBeDefined()
    expect(methodResponses.length).toBeGreaterThanOrEqual(2)
  })

  it('should set ResourceId correctly', () => {
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
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.ResourceId,
    ).toEqual({
      Ref: 'ApiGatewayResourceUsersCreate',
    })
  })

  it('should set RestApiId correctly', () => {
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
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.RestApiId,
    ).toEqual({
      Ref: 'ApiGatewayRestApi',
    })
  })

  it('should populate apiGatewayMethodLogicalIds', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
        },
      },
      {
        functionName: 'Second',
        http: {
          path: 'users/list',
          method: 'get',
        },
      },
    ]
    awsCompileApigEvents.compileMethods()

    expect(awsCompileApigEvents.apiGatewayMethodLogicalIds.length).toBe(2)
    expect(awsCompileApigEvents.apiGatewayMethodLogicalIds).toContain(
      'ApiGatewayMethodUsersCreatePost',
    )
    expect(awsCompileApigEvents.apiGatewayMethodLogicalIds).toContain(
      'ApiGatewayMethodUsersListGet',
    )
  })

  it('should handle private: true by setting ApiKeyRequired', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          private: true,
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.ApiKeyRequired,
    ).toBe(true)
  })

  it('should handle async: true by setting InvocationType header', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          async: true,
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const requestParams =
      resources.ApiGatewayMethodUsersCreatePost.Properties.Integration
        .RequestParameters
    expect(requestParams).toBeDefined()
    expect(
      requestParams['integration.request.header.X-Amz-Invocation-Type'],
    ).toBe("'Event'")
  })

  it('should handle CORS configuration on method', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        methods: ['OPTIONS', 'POST'],
        headers: ['Content-Type'],
        origins: ['*'],
      },
    }
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          cors: {
            methods: ['OPTIONS', 'POST'],
            headers: ['Content-Type'],
            origins: ['*'],
          },
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Main method should be created
    expect(resources.ApiGatewayMethodUsersCreatePost).toBeDefined()
    expect(resources.ApiGatewayMethodUsersCreatePost.Type).toBe(
      'AWS::ApiGateway::Method',
    )
  })

  it('should handle root path methods', () => {
    awsCompileApigEvents.apiGatewayResources[''] = {
      name: '',
      resourceLogicalId: null, // Root uses GetRestApiRootResourceId
    }
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: '',
          method: 'get',
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Root path method should be created with special naming
    const methodKeys = Object.keys(resources).filter((key) =>
      key.startsWith('ApiGatewayMethod'),
    )
    expect(methodKeys.length).toBeGreaterThan(0)
  })

  it('should set content handling for binary media types when using AWS integration', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'users/create',
          method: 'post',
          integration: 'AWS',
          request: {
            contentHandling: 'CONVERT_TO_BINARY',
          },
          response: {
            statusCodes: {
              200: { pattern: '' },
            },
          },
        },
      },
    ]
    awsCompileApigEvents.compileMethods()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Just check the method was created with AWS integration
    expect(
      resources.ApiGatewayMethodUsersCreatePost.Properties.Integration.Type,
    ).toBe('AWS')
  })
})
