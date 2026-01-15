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

describe('#compileUsagePlan()', () => {
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
    awsCompileApigEvents.apiGatewayDeploymentLogicalId =
      'ApiGatewayDeploymentTest'
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
  })

  it('should compile default usage plan resource', () => {
    serverless.service.provider.apiGateway = { apiKeys: ['1234567890'] }
    awsCompileApigEvents.compileUsagePlan()

    const logicalId =
      awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources[logicalId].Type).toBe('AWS::ApiGateway::UsagePlan')
    expect(resources[logicalId].DependsOn).toBe('ApiGatewayDeploymentTest')
    expect(resources[logicalId].Properties.ApiStages[0].ApiId.Ref).toBe(
      'ApiGatewayRestApi',
    )
    expect(resources[logicalId].Properties.ApiStages[0].Stage).toBe('dev')
    expect(resources[logicalId].Properties.Description).toBe(
      'Usage plan for first-service dev stage',
    )
    expect(resources[logicalId].Properties.UsagePlanName).toBe(
      'first-service-dev',
    )
    expect(awsCompileApigEvents.apiGatewayUsagePlanNames).toEqual(['default'])
  })

  it('should support custom usage plan resource via single object notation', () => {
    serverless.service.provider.apiGateway = {
      usagePlan: {
        quota: {
          limit: 500,
          offset: 10,
          period: 'MONTH',
        },
        throttle: {
          burstLimit: 200,
          rateLimit: 100,
        },
      },
    }

    awsCompileApigEvents.compileUsagePlan()
    const logicalId =
      awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources[logicalId].Type).toBe('AWS::ApiGateway::UsagePlan')
    expect(resources[logicalId].Properties.Quota.Limit).toBe(500)
    expect(resources[logicalId].Properties.Quota.Offset).toBe(10)
    expect(resources[logicalId].Properties.Quota.Period).toBe('MONTH')
    expect(resources[logicalId].Properties.Throttle.BurstLimit).toBe(200)
    expect(resources[logicalId].Properties.Throttle.RateLimit).toBe(100)
  })

  it('should support custom usage plan resources via array notation', () => {
    serverless.service.provider.apiGateway = {
      usagePlan: [
        {
          free: {
            quota: {
              limit: 1000,
              period: 'MONTH',
            },
          },
        },
        {
          paid: {
            quota: {
              limit: 10000,
              period: 'MONTH',
            },
          },
        },
      ],
    }

    awsCompileApigEvents.compileUsagePlan()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const freeLogicalId =
      awsCompileApigEvents.provider.naming.getUsagePlanLogicalId('free')
    const paidLogicalId =
      awsCompileApigEvents.provider.naming.getUsagePlanLogicalId('paid')

    expect(resources[freeLogicalId].Type).toBe('AWS::ApiGateway::UsagePlan')
    expect(resources[freeLogicalId].Properties.Quota.Limit).toBe(1000)
    expect(resources[paidLogicalId].Type).toBe('AWS::ApiGateway::UsagePlan')
    expect(resources[paidLogicalId].Properties.Quota.Limit).toBe(10000)

    expect(awsCompileApigEvents.apiGatewayUsagePlanNames).toContain('free')
    expect(awsCompileApigEvents.apiGatewayUsagePlanNames).toContain('paid')
  })

  it('should compile custom usage plan resource with restApiId provided', () => {
    serverless.service.provider.apiGateway = {
      restApiId: 'xxxxx',
      apiKeys: ['1234567890'],
    }
    awsCompileApigEvents.compileUsagePlan()

    const logicalId =
      awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources[logicalId].Type).toBe('AWS::ApiGateway::UsagePlan')
    expect(resources[logicalId].Properties.ApiStages[0].ApiId).toBe('xxxxx')
  })
})
