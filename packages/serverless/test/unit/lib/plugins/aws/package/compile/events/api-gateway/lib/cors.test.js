import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    warning: jest.fn(),
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

  it('should include credentials and max-age in gateway responses when configured, but not cache headers', () => {
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
    })
    // `Cache-Control` stays on the preflight response, where it belongs: a
    // cache honoring it on a gateway error could keep serving that error
    // after the API recovers.
    expect(
      resources.ApiGatewayMethodUsersCreateOptions.Properties.Integration
        .IntegrationResponses[0].ResponseParameters[
        'method.response.header.Cache-Control'
      ],
    ).toBe("'max-age=600, s-maxage=600'")
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
    // ... except the specific 4xx types, which API Gateway already covers
    // with the user-defined DEFAULT_4XX fallback; synthesizing them would
    // bypass the user's custom response template
    expect(resources.ApiGatewayGatewayResponseUnauthorized).toBeUndefined()
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

  it('should not synthesize gateway responses for a wildcard origin pattern', () => {
    // A static gateway response cannot echo a request origin the way the
    // preflight template does, so `https://*.example.com` would be emitted
    // literally and browsers would reject it. Only a single exact origin
    // (or `*`) can be represented by a static header.
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
      Object.keys(resources).filter((key) =>
        key.startsWith('ApiGatewayGatewayResponse'),
      ),
    ).toHaveLength(0)
    // The preflight method is unaffected: it echoes the concrete origin.
    expect(resources.ApiGatewayMethodUsersCreateOptions).toBeDefined()
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

  it('should let the last maxAge win across paths and keep cacheControl off gateway responses', () => {
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
    ).toBeUndefined()
  })

  it('should not duplicate gateway responses when compileCors runs twice', () => {
    // Both the REST API plugin and the API Gateway service-proxy plugin
    // compile CORS from the same shared module, so compileCors() can run
    // twice for one REST API in a single packaging. The second call must
    // merge with the first, not replace it: the first origin wins and the
    // header and method sets are unioned.
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://first.example.com',
        origins: [],
        headers: ['Content-Type'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    awsCompileApigEvents.compileCors()

    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'http://second.example.com',
        origins: [],
        headers: ['Authorization'],
        methods: ['OPTIONS', 'GET'],
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
    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters,
    ).toEqual({
      'gatewayresponse.header.Access-Control-Allow-Origin':
        "'http://first.example.com'",
      'gatewayresponse.header.Access-Control-Allow-Headers':
        "'Content-Type,Authorization'",
      'gatewayresponse.header.Access-Control-Allow-Methods':
        "'OPTIONS,POST,GET'",
    })
    // The preflight method is not duplicated either
    expect(
      Object.keys(resources).filter(
        (key) => key === 'ApiGatewayMethodUsersCreateOptions',
      ),
    ).toHaveLength(1)
    // The deployment waits for the generated gateway responses, so the
    // stage is not deployed before they exist
    for (const logicalId of gatewayResponseLogicalIds) {
      expect(awsCompileApigEvents.apiGatewayMethodLogicalIds).toContain(
        logicalId,
      )
    }
  })

  it('should keep the first origin regardless of whether it uses origin or origins', () => {
    // Origin selection depends on path order, not on the syntax each path
    // uses: a later path's `origins` must not override an earlier path's
    // scalar `origin`.
    awsCompileApigEvents.validated.corsPreflight = {
      'users/create': {
        origin: 'https://a.example.com',
        origins: [],
        headers: ['Content-Type'],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
      'users/list': {
        origins: ['https://b.example.com'],
        headers: ['Content-Type'],
        methods: ['OPTIONS', 'GET'],
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
    ).toBe("'https://a.example.com'")
  })

  it('should not synthesize specific types when the user defined the DEFAULT fallback', () => {
    // API Gateway falls back to DEFAULT_4XX for a throttling response when
    // THROTTLED is not defined. Synthesizing THROTTLED without the user's
    // custom template would silently drop their error body.
    serverless.service.resources = {
      Resources: {
        GatewayResponseDefault4XX: {
          Type: 'AWS::ApiGateway::GatewayResponse',
          Properties: {
            ResponseTemplates: {
              'application/json': '{"message":"custom 4xx"}',
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

    expect(resources.ApiGatewayGatewayResponseDefault4XX).toBeUndefined()
    for (const logicalId of [
      'ApiGatewayGatewayResponseUnauthorized',
      'ApiGatewayGatewayResponseAccessDenied',
      'ApiGatewayGatewayResponseInvalidApiKey',
      'ApiGatewayGatewayResponseMissingAuthenticationToken',
      'ApiGatewayGatewayResponseResourceNotFound',
      'ApiGatewayGatewayResponseExpiredToken',
      'ApiGatewayGatewayResponseThrottled',
      'ApiGatewayGatewayResponseQuotaExceeded',
    ]) {
      expect(resources[logicalId]).toBeUndefined()
    }
    // The 5xx types are unaffected by a 4xx fallback
    expect(resources.ApiGatewayGatewayResponseDefault5XX).toBeDefined()
    expect(resources.ApiGatewayGatewayResponseAuthorizerFailure).toBeDefined()
    expect(resources.ApiGatewayGatewayResponseIntegrationFailure).toBeDefined()
  })

  it('should recognize Fn::Sub and Ref to the same REST API as the same API', () => {
    serverless.service.resources = {
      Resources: {
        GatewayResponseDefault4XX: {
          Type: 'AWS::ApiGateway::GatewayResponse',
          Properties: {
            ResponseParameters: {
              'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
            },
            ResponseType: 'DEFAULT_4XX',
            RestApiId: { 'Fn::Sub': '${ApiGatewayRestApi}' },
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

    // The user-defined response targets this API, so it is left alone
    expect(resources.ApiGatewayGatewayResponseDefault4XX).toBeUndefined()
    expect(resources.ApiGatewayGatewayResponseDefault5XX).toBeDefined()
  })

  it('should allocate a distinct logical ID when the preferred ID targets another API', () => {
    serverless.service.resources = {
      Resources: {
        ApiGatewayGatewayResponseDefault4XX: {
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

    // Reusing the ID would fold the generated response into the user's
    // resource for the other API when the custom resources are merged
    const generated = resources.ApiGatewayGatewayResponseDefault4XXCors1
    expect(generated).toBeDefined()
    expect(generated.Properties.ResponseType).toBe('DEFAULT_4XX')
    expect(generated.Properties.RestApiId).toEqual({
      Ref: 'ApiGatewayRestApi',
    })
    expect(generated.Properties.ResponseParameters).toEqual({
      'gatewayresponse.header.Access-Control-Allow-Origin':
        "'http://example.com'",
      'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
      'gatewayresponse.header.Access-Control-Allow-Methods': "'OPTIONS,POST'",
    })
  })

  it('should generate a fallback under the negated condition when the user override is conditional', () => {
    // A user-defined DEFAULT_4XX with `Condition: IsProd` does not exist in
    // dev, so the generated fallback must exist exactly where it does not.
    serverless.service.resources = {
      Resources: {
        GatewayResponseDefault4XX: {
          Type: 'AWS::ApiGateway::GatewayResponse',
          Condition: 'IsProd',
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
    const template = serverless.service.provider.compiledCloudFormationTemplate

    // The generated fallback gets its own logical ID (the user's ID is
    // taken) and the negated condition, so each environment gets one
    // response and never both
    const generated =
      template.Resources.ApiGatewayGatewayResponseDefault4XXCors1
    expect(generated).toBeDefined()
    expect(generated.Condition).toBe('NotIsProd')
    expect(template.Conditions.NotIsProd).toEqual({
      'Fn::Not': [{ Condition: 'IsProd' }],
    })
    expect(generated.Properties.ResponseType).toBe('DEFAULT_4XX')
  })
})
