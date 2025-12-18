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

describe('#compileUsagePlanKeys()', () => {
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
      Outputs: {},
    }
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    awsCompileApigEvents.apiGatewayDeploymentLogicalId =
      'ApiGatewayDeploymentTest'
  })

  it('should support api key notation', () => {
    awsCompileApigEvents.apiGatewayUsagePlanNames = ['default']
    serverless.service.provider.apiGateway = {
      apiKeys: ['1234567890', { name: 'abcdefghij', value: 'abcdefghijvalue' }],
    }

    awsCompileApigEvents.compileUsagePlanKeys()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Should create usage plan key resources
    const usagePlanKeyResources = Object.keys(resources).filter((key) =>
      key.includes('UsagePlanKey'),
    )
    expect(usagePlanKeyResources.length).toBe(2)

    // Check first key
    const firstKey = resources[usagePlanKeyResources[0]]
    expect(firstKey.Type).toBe('AWS::ApiGateway::UsagePlanKey')
    expect(firstKey.Properties.KeyType).toBe('API_KEY')
  })

  it('should support usage plan notation', () => {
    awsCompileApigEvents.apiGatewayUsagePlanNames = ['free', 'paid']
    serverless.service.provider.apiGateway = {
      apiKeys: [{ free: ['1234567890'] }, { paid: ['0987654321'] }],
    }

    awsCompileApigEvents.compileUsagePlanKeys()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const usagePlanKeyResources = Object.keys(resources).filter((key) =>
      key.includes('UsagePlanKey'),
    )
    expect(usagePlanKeyResources.length).toBe(2)
  })

  it('should throw if api key name does not match a usage plan', () => {
    awsCompileApigEvents.apiGatewayUsagePlanNames = ['default']
    serverless.service.provider.apiGateway = {
      apiKeys: [{ free: ['1234567890'] }],
    }

    expect(() => awsCompileApigEvents.compileUsagePlanKeys()).toThrow(
      /has no usage plan defined/,
    )
  })
})
