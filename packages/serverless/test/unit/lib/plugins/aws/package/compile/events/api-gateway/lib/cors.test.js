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
  await import('../../../../../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileApigEvents } =
  await import('../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js')

describe('#compileCors()', () => {
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
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
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
    }
    awsCompileApigEvents.validated = {}
  })

  it('should create preflight method for CORS enabled resource', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/update': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'PUT'],
        allowCredentials: false,
        maxAge: 86400,
        cacheControl: 'max-age=600, s-maxage=600',
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Should create OPTIONS method
    expect(resources.ApiGatewayMethodUsersUpdateOptions).toBeDefined()
    expect(resources.ApiGatewayMethodUsersUpdateOptions.Type).toBe(
      'AWS::ApiGateway::Method',
    )
    expect(
      resources.ApiGatewayMethodUsersUpdateOptions.Properties.HttpMethod,
    ).toBe('OPTIONS')
  })

  it('should set CORS headers correctly', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origins: ['http://localhost:3000', 'https://example.com'],
        headers: ['Content-Type', 'Authorization'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: true,
        maxAge: 86400,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.ApiGatewayMethodUsersCreateOptions).toBeDefined()
    const integrationResponses =
      resources.ApiGatewayMethodUsersCreateOptions.Properties.Integration
        .IntegrationResponses
    expect(integrationResponses).toBeDefined()
    expect(integrationResponses.length).toBeGreaterThan(0)
  })

  it('should create GatewayResponse resources with CORS headers when CORS is enabled', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['Content-Type', 'Authorization'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
        maxAge: 86400,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Catch-all gateway responses for every gateway-generated 4xx/5xx
    for (const [logicalId, responseType] of [
      ['ApiGatewayGatewayResponseDefault4XX', 'DEFAULT_4XX'],
      ['ApiGatewayGatewayResponseDefault5XX', 'DEFAULT_5XX'],
      ['ApiGatewayGatewayResponseUnauthorized', 'UNAUTHORIZED'],
      ['ApiGatewayGatewayResponseAccessDenied', 'ACCESS_DENIED'],
      ['ApiGatewayGatewayResponseInvalidApiKey', 'INVALID_API_KEY'],
      [
        'ApiGatewayGatewayResponseMissingAuthenticationToken',
        'MISSING_AUTHENTICATION_TOKEN',
      ],
      ['ApiGatewayGatewayResponseResourceNotFound', 'RESOURCE_NOT_FOUND'],
      ['ApiGatewayGatewayResponseExpiredToken', 'EXPIRED_TOKEN'],
      ['ApiGatewayGatewayResponseThrottled', 'THROTTLED'],
      ['ApiGatewayGatewayResponseQuotaExceeded', 'QUOTA_EXCEEDED'],
      ['ApiGatewayGatewayResponseAuthorizerFailure', 'AUTHORIZER_FAILURE'],
      ['ApiGatewayGatewayResponseIntegrationFailure', 'INTEGRATION_FAILURE'],
    ]) {
      expect(resources[logicalId]).toBeDefined()
      expect(resources[logicalId].Type).toBe('AWS::ApiGateway::GatewayResponse')
      expect(resources[logicalId].Properties.ResponseType).toBe(responseType)
      expect(resources[logicalId].Properties.RestApiId).toEqual({
        Ref: 'ApiGatewayRestApi',
      })
      expect(resources[logicalId].Properties.ResponseParameters).toEqual({
        'gatewayresponse.header.Access-Control-Allow-Origin':
          "'http://example.com'",
        'gatewayresponse.header.Access-Control-Allow-Headers':
          "'Content-Type,Authorization'",
        'gatewayresponse.header.Access-Control-Allow-Methods': "'OPTIONS,POST'",
        'gatewayresponse.header.Access-Control-Max-Age': "'86400'",
      })
    }
  })

  it('should include credentials and cache headers in gateway responses when configured', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: true,
        maxAge: 86400,
        cacheControl: 'max-age=600, s-maxage=600',
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters,
    ).toEqual({
      'gatewayresponse.header.Access-Control-Allow-Origin':
        "'http://example.com'",
      'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
      'gatewayresponse.header.Access-Control-Allow-Methods': "'OPTIONS,POST'",
      'gatewayresponse.header.Access-Control-Allow-Credentials': "'true'",
      'gatewayresponse.header.Access-Control-Max-Age': "'86400'",
      'gatewayresponse.header.Cache-Control': "'max-age=600, s-maxage=600'",
    })
  })

  it('should use the first origin when multiple origins are configured', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origins: ['http://localhost:3000', 'https://example.com'],
        headers: ['Content-Type'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters[
        'gatewayresponse.header.Access-Control-Allow-Origin'
      ],
    ).toBe("'http://localhost:3000'")
  })

  it('should merge CORS configs across paths into a single set of gateway responses', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['Content-Type'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
      'users/list': {
        origin: 'http://example.com',
        origins: [],
        headers: ['Authorization'],
        methods: ['OPTIONS', 'GET'],
        allowCredentials: true,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const gatewayResponseLogicalIds = Object.keys(resources).filter((key) =>
      key.startsWith('ApiGatewayGatewayResponse'),
    )
    // One resource per response type, not one per path
    expect(gatewayResponseLogicalIds).toHaveLength(12)
    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters,
    ).toEqual({
      'gatewayresponse.header.Access-Control-Allow-Origin':
        "'http://example.com'",
      'gatewayresponse.header.Access-Control-Allow-Headers':
        "'Content-Type,Authorization'",
      'gatewayresponse.header.Access-Control-Allow-Methods':
        "'OPTIONS,POST,GET'",
      'gatewayresponse.header.Access-Control-Allow-Credentials': "'true'",
    })
  })

  it('should not create GatewayResponse resources when CORS is not enabled', () => {
    awsCompileApigEvents.validated.corsPreflight = {}
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      Object.keys(resources).filter((key) =>
        key.startsWith('ApiGatewayGatewayResponse'),
      ),
    ).toHaveLength(0)
  })

  it('should skip gateway response types already defined by the user', () => {
    serverless.service.resources = {
      Resources: {
        GatewayResponseDefault4XX: {
          Type: 'AWS::ApiGateway::GatewayResponse',
          Properties: {
            ResponseParameters: {
              'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
            },
            ResponseType: 'DEFAULT_4XX',
            RestApiId: { Ref: 'ApiGatewayRestApi' },
          },
        },
      },
    }
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // User-defined type is left alone
    expect(resources.ApiGatewayGatewayResponseDefault4XX).toBeUndefined()
    // Other types are still synthesized
    expect(resources.ApiGatewayGatewayResponseDefault5XX).toBeDefined()
    expect(resources.ApiGatewayGatewayResponseUnauthorized).toBeDefined()
  })

  it('should not create GatewayResponse resources when corsPreflight is not defined', () => {
    // No http event enables CORS, so validated has no corsPreflight at all
    awsCompileApigEvents.validated = {}
    expect(() => awsCompileApigEvents.compileCors()).not.toThrow()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      Object.keys(resources).filter((key) =>
        key.startsWith('ApiGatewayGatewayResponse'),
      ),
    ).toHaveLength(0)
  })

  it('should use the default CORS configuration when cors is true', () => {
    // Shape produced by getCors() for `cors: true`
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: '*',
        headers: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
          'X-Amzn-Trace-Id',
        ],
        methods: ['OPTIONS', 'GET'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // The preflight method is still created alongside the gateway responses
    expect(resources.ApiGatewayMethodUsersCreateOptions).toBeDefined()
    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters,
    ).toEqual({
      'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
      'gatewayresponse.header.Access-Control-Allow-Headers':
        "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent,X-Amzn-Trace-Id'",
      'gatewayresponse.header.Access-Control-Allow-Methods': "'OPTIONS,GET'",
    })
    expect(
      resources.ApiGatewayGatewayResponseDefault5XX.Properties
        .ResponseParameters[
        'gatewayresponse.header.Access-Control-Allow-Origin'
      ],
    ).toBe("'*'")
  })

  it('should expand ANY method in gateway responses', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'ANY'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters[
        'gatewayresponse.header.Access-Control-Allow-Methods'
      ],
    ).toBe("'OPTIONS,DELETE,GET,HEAD,PATCH,POST,PUT'")
  })

  it('should use the first origin from a comma-separated origin string', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://a.example.com, http://b.example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters[
        'gatewayresponse.header.Access-Control-Allow-Origin'
      ],
    ).toBe("'http://a.example.com'")
  })

  it('should use the first wildcard origin when credentials are allowed', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origins: ['https://*.example.com', 'https://example.com'],
        headers: ['Content-Type'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: true,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters,
    ).toEqual({
      'gatewayresponse.header.Access-Control-Allow-Origin':
        "'https://*.example.com'",
      'gatewayresponse.header.Access-Control-Allow-Headers': "'Content-Type'",
      'gatewayresponse.header.Access-Control-Allow-Methods': "'OPTIONS,POST'",
      'gatewayresponse.header.Access-Control-Allow-Credentials': "'true'",
    })
  })

  it('should use the configured external RestApiId for gateway responses', () => {
    serverless.service.provider.apiGateway = { restApiId: 'abc123' }
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties.RestApiId,
    ).toBe('abc123')
    expect(
      resources.ApiGatewayGatewayResponseDefault5XX.Properties.RestApiId,
    ).toBe('abc123')
  })

  it('should skip user-defined types for an external RestApi', () => {
    serverless.service.provider.apiGateway = { restApiId: 'abc123' }
    serverless.service.resources = {
      Resources: {
        GatewayResponseDefault4XX: {
          Type: 'AWS::ApiGateway::GatewayResponse',
          Properties: {
            ResponseParameters: {
              'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
            },
            ResponseType: 'DEFAULT_4XX',
            RestApiId: 'abc123',
          },
        },
      },
    }
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.ApiGatewayGatewayResponseDefault4XX).toBeUndefined()
    expect(
      resources.ApiGatewayGatewayResponseDefault5XX.Properties.RestApiId,
    ).toBe('abc123')
  })

  it('should still synthesize a type defined for a different RestApi', () => {
    serverless.service.resources = {
      Resources: {
        GatewayResponseDefault4XX: {
          Type: 'AWS::ApiGateway::GatewayResponse',
          Properties: {
            ResponseParameters: {
              'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
            },
            ResponseType: 'DEFAULT_4XX',
            RestApiId: { Ref: 'SomeOtherApi' },
          },
        },
      },
    }
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // The user's resource targets another API, so ours is still needed
    expect(resources.ApiGatewayGatewayResponseDefault4XX).toBeDefined()
    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties.RestApiId,
    ).toEqual({ Ref: 'ApiGatewayRestApi' })
  })

  it('should still synthesize when a user-defined gateway response has no RestApiId', () => {
    serverless.service.resources = {
      Resources: {
        GatewayResponseDefault4XX: {
          Type: 'AWS::ApiGateway::GatewayResponse',
          Properties: {
            ResponseParameters: {
              'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
            },
            ResponseType: 'DEFAULT_4XX',
          },
        },
      },
    }
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Without a RestApiId we cannot tell it targets this API
    expect(resources.ApiGatewayGatewayResponseDefault4XX).toBeDefined()
  })

  it('should let the last maxAge and cacheControl win across paths', () => {
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
        maxAge: 100,
        cacheControl: 'max-age=100',
      },
      'users/list': {
        origin: 'http://example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'GET'],
        allowCredentials: false,
        maxAge: 200,
      },
    }
    awsCompileApigEvents.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters['gatewayresponse.header.Access-Control-Max-Age'],
    ).toBe("'200'")
    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters['gatewayresponse.header.Cache-Control'],
    ).toBe("'max-age=100'")
  })

  it('should not duplicate gateway responses when compileCors runs twice', () => {
    // Both the REST API plugin and the API Gateway service-proxy plugin
    // compile CORS from the same shared module, so compileCors() can run
    // twice for one REST API in a single packaging.
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://first.example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()

    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://second.example.com',
        origins: [],
        headers: ['*'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()

    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const gatewayResponseLogicalIds = Object.keys(resources).filter((key) =>
      key.startsWith('ApiGatewayGatewayResponse'),
    )
    expect(gatewayResponseLogicalIds).toHaveLength(12)
    // The second compile wins for the shared, per-API header values
    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters[
        'gatewayresponse.header.Access-Control-Allow-Origin'
      ],
    ).toBe("'http://second.example.com'")
    // The preflight method is not duplicated either
    expect(
      Object.keys(resources).filter(
        (key) => key === 'ApiGatewayMethodUsersCreateOptions',
      ),
    ).toHaveLength(1)
  })
})
