import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({
      debug: jest.fn(),
      warning: jest.fn(),
      notice: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    })),
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
  await import('../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
const { default: ServerlessApigatewayServiceProxy } =
  await import('../../../../../../lib/plugins/aws/api-gateway-service-proxy/index.js')

// The service-proxy plugin compiles CORS through the same shared module as
// the REST API plugin
// (lib/plugins/aws/package/compile/events/api-gateway/lib/cors.js), so
// gateway-generated error responses for service-proxy paths must carry the
// same CORS headers. See https://github.com/serverless/serverless/issues/3896
describe('#compileCors() via the API Gateway service-proxy plugin', () => {
  let serverless
  let serviceProxy
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
    serviceProxy = new ServerlessApigatewayServiceProxy(serverless, options)
    serviceProxy.apiGatewayMethodLogicalIds = []
    serviceProxy.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    serviceProxy.apiGatewayResources = {
      kinesis: {
        name: 'Kinesis',
        resourceLogicalId: 'ApiGatewayResourceKinesis',
      },
    }
    serviceProxy.validated = {}
  })

  it('should create GatewayResponse resources for service-proxy CORS', () => {
    serviceProxy.validated.corsPreflight = {
      kinesis: {
        origin: '*',
        origins: ['*'],
        headers: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ],
        methods: ['OPTIONS', 'POST'],
        allowCredentials: false,
      },
    }
    serviceProxy.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // The preflight method for the proxied path is still created
    expect(resources.ApiGatewayMethodKinesisOptions).toBeDefined()
    expect(resources.ApiGatewayMethodKinesisOptions.Type).toBe(
      'AWS::ApiGateway::Method',
    )

    // And gateway-generated errors for that path carry the CORS headers
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
      expect(
        resources[logicalId].Properties.ResponseParameters[
          'gatewayresponse.header.Access-Control-Allow-Origin'
        ],
      ).toBe("'*'")
    }
  })

  it('should build corsPreflight from a service-proxy definition and synthesize gateway responses', () => {
    serverless.service.custom = {
      apiGatewayServiceProxies: [
        {
          kinesis: {
            path: 'kinesis',
            method: 'post',
            streamName: 'my-stream',
            cors: true,
          },
        },
      ],
    }

    serviceProxy.validated = serviceProxy.validateServiceProxies()
    expect(serviceProxy.validated.corsPreflight.kinesis).toBeDefined()
    expect(serviceProxy.validated.corsPreflight.kinesis.origin).toBe('*')

    serviceProxy.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.ApiGatewayGatewayResponseDefault4XX).toBeDefined()
    expect(
      resources.ApiGatewayGatewayResponseDefault4XX.Properties
        .ResponseParameters,
    ).toEqual({
      'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
      'gatewayresponse.header.Access-Control-Allow-Headers':
        "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
      'gatewayresponse.header.Access-Control-Allow-Methods': "'OPTIONS,POST'",
    })
  })

  it('should not create GatewayResponse resources when no service proxy enables CORS', () => {
    serverless.service.custom = {
      apiGatewayServiceProxies: [
        {
          kinesis: {
            path: 'kinesis',
            method: 'post',
            streamName: 'my-stream',
          },
        },
      ],
    }

    serviceProxy.validated = serviceProxy.validateServiceProxies()
    expect(serviceProxy.validated.corsPreflight).toEqual({})

    serviceProxy.compileCors()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      Object.keys(resources).filter((key) =>
        key.startsWith('ApiGatewayGatewayResponse'),
      ),
    ).toHaveLength(0)
  })

  it('should add CORS headers to service-proxy method responses', () => {
    const methodResponses = serviceProxy.getMethodResponses({
      cors: { origin: 'http://example.com' },
    })

    // 200, 400 and 500 method responses all carry the CORS origin header
    expect(
      methodResponses.Properties.MethodResponses.map(
        (response) => response.StatusCode,
      ),
    ).toEqual([200, 400, 500])
    for (const response of methodResponses.Properties.MethodResponses) {
      expect(response.ResponseParameters).toEqual({
        'method.response.header.Access-Control-Allow-Origin':
          "'http://example.com'",
      })
    }

    const withoutCors = serviceProxy.getMethodResponses({})
    for (const response of withoutCors.Properties.MethodResponses) {
      expect(response.ResponseParameters).toEqual({})
    }
  })
})
