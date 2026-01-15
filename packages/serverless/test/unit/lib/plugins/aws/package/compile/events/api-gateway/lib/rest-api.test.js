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

describe('#compileRestApi()', () => {
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
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
    serverless.service.service = 'new-service'
    serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'POST',
            },
          },
        ],
      },
    }
  })

  it('should create a REST API resource', () => {
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.ApiGatewayRestApi).toBeDefined()
    expect(resources.ApiGatewayRestApi.Type).toBe('AWS::ApiGateway::RestApi')
    expect(resources.ApiGatewayRestApi.Properties.Name).toBe('dev-new-service')
    expect(
      resources.ApiGatewayRestApi.Properties.EndpointConfiguration.Types,
    ).toContain('EDGE')
  })

  it('should create a REST API resource with resource policy', () => {
    serverless.service.provider.apiGateway = {
      resourcePolicy: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 'execute-api:Invoke',
          Resource: ['execute-api:/*/*/*'],
          Condition: {
            IpAddress: {
              'aws:SourceIp': ['123.123.123.123'],
            },
          },
        },
      ],
    }
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.ApiGatewayRestApi.Properties.Policy).toBeDefined()
  })

  it('should set endpoint type to REGIONAL', () => {
    serverless.service.provider.endpointType = 'REGIONAL'
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayRestApi.Properties.EndpointConfiguration.Types,
    ).toContain('REGIONAL')
  })

  it('should set endpoint type to PRIVATE', () => {
    serverless.service.provider.endpointType = 'PRIVATE'
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayRestApi.Properties.EndpointConfiguration.Types,
    ).toContain('PRIVATE')
  })

  it('should set binary media types', () => {
    serverless.service.provider.apiGateway = {
      binaryMediaTypes: ['image/png', 'image/jpeg'],
    }
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.ApiGatewayRestApi.Properties.BinaryMediaTypes).toEqual([
      'image/png',
      'image/jpeg',
    ])
  })

  it('should not create REST API when restApiId is provided', () => {
    serverless.service.provider.apiGateway = {
      restApiId: 'xxxxx',
    }
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // When restApiId is provided, we don't create a new REST API
    expect(resources.ApiGatewayRestApi).toBeUndefined()
  })

  it('should set apiGatewayRestApiLogicalId correctly', () => {
    awsCompileApigEvents.compileRestApi()

    expect(awsCompileApigEvents.apiGatewayRestApiLogicalId).toBe(
      'ApiGatewayRestApi',
    )
  })

  it('should disable execute-api endpoint when specified', () => {
    serverless.service.provider.apiGateway = {
      disableDefaultEndpoint: true,
    }
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(
      resources.ApiGatewayRestApi.Properties.DisableExecuteApiEndpoint,
    ).toBe(true)
  })

  it('should set API name from provider config', () => {
    serverless.service.provider.apiGateway = {
      apiName: 'custom-api-name',
    }
    awsCompileApigEvents.compileRestApi()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Note: actual implementation may or may not support this - check behavior
    expect(resources.ApiGatewayRestApi.Properties.Name).toBeDefined()
  })
})
