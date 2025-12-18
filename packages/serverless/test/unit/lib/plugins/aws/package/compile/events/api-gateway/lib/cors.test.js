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

const { default: Serverless } = await import(
  '../../../../../../../../../../lib/serverless.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: AwsCompileApigEvents } = await import(
  '../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js'
)

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
})
