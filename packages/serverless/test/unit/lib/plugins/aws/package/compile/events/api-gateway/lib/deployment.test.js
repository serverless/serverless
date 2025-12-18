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

describe('#compileDeployment()', () => {
  let serverless
  let provider
  let awsCompileApigEvents
  let options

  beforeEach(() => {
    options = { stage: 'dev', region: 'us-east-1' }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    provider = new AwsProvider(serverless, options)
    serverless.setProvider('aws', provider)
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    awsCompileApigEvents.apiGatewayMethodLogicalIds = [
      'method-dependency1',
      'method-dependency2',
    ]
    awsCompileApigEvents.provider = provider
  })

  it('should create a deployment resource', () => {
    awsCompileApigEvents.compileDeployment()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const apiGatewayDeploymentLogicalId = Object.keys(resources)[0]

    expect(resources[apiGatewayDeploymentLogicalId].Type).toBe(
      'AWS::ApiGateway::Deployment',
    )
    expect(resources[apiGatewayDeploymentLogicalId].DependsOn).toEqual([
      'method-dependency1',
      'method-dependency2',
    ])
    expect(
      resources[apiGatewayDeploymentLogicalId].Properties.RestApiId,
    ).toEqual({
      Ref: 'ApiGatewayRestApi',
    })
    expect(resources[apiGatewayDeploymentLogicalId].Properties.StageName).toBe(
      'dev',
    )
  })

  it('should create a deployment resource with description', () => {
    serverless.service.provider.apiGateway = {
      description: 'Some Description',
    }
    awsCompileApigEvents.compileDeployment()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const apiGatewayDeploymentLogicalId = Object.keys(resources)[0]

    expect(
      resources[apiGatewayDeploymentLogicalId].Properties.Description,
    ).toBe('Some Description')
  })

  it('should add service endpoint output', () => {
    awsCompileApigEvents.compileDeployment()
    const outputs =
      serverless.service.provider.compiledCloudFormationTemplate.Outputs

    expect(outputs.ServiceEndpoint).toBeDefined()
    expect(outputs.ServiceEndpoint.Description).toBe(
      'URL of the service endpoint',
    )
    expect(outputs.ServiceEndpoint.Value['Fn::Join']).toBeDefined()
  })
})
