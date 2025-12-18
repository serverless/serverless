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

describe('#compilePermissions()', () => {
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
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    awsCompileApigEvents.validated = {}
  })

  it('should create limited permission resource scope to REST API', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'foo/bar',
          method: 'post',
        },
      },
    ]
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        resourceName: 'FooBar',
        event: {
          http: {
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'First',
        },
      },
    ]

    awsCompileApigEvents.compilePermissions()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.FirstLambdaPermissionApiGateway).toBeDefined()
    expect(
      resources.FirstLambdaPermissionApiGateway.Properties.FunctionName[
        'Fn::GetAtt'
      ][0],
    ).toBe('FirstLambdaFunction')
    expect(
      resources.FirstLambdaPermissionApiGateway.Properties.SourceArn[
        'Fn::Join'
      ],
    ).toBeDefined()
  })

  it('should create permission with restApiId provided', () => {
    serverless.service.provider.apiGateway = {
      restApiId: 'xxxxx',
    }
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'foo/bar',
          method: 'post',
        },
      },
    ]
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        resourceName: 'FooBar',
        event: {
          http: {
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'First',
        },
      },
    ]

    awsCompileApigEvents.compilePermissions()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.FirstLambdaPermissionApiGateway).toBeDefined()
    // Should use the custom restApiId
    const sourceArn =
      resources.FirstLambdaPermissionApiGateway.Properties.SourceArn
    expect(sourceArn['Fn::Join'][1]).toContain('xxxxx')
  })

  it('should setup permissions for an alias in case of provisioned function', () => {
    serverless.service.provider.apiGateway = {
      restApiId: 'xxxxx',
    }
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: {
          path: 'foo/bar',
          method: 'post',
        },
      },
    ]
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        lambdaAliasName: 'provisioned',
        resourceName: 'FooBar',
        event: {
          http: {
            path: 'foo/bar',
            method: 'post',
          },
          functionName: 'First',
        },
      },
    ]

    awsCompileApigEvents.compilePermissions()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.FirstLambdaPermissionApiGateway).toBeDefined()
    // Should reference the alias
    const functionName =
      resources.FirstLambdaPermissionApiGateway.Properties.FunctionName
    expect(functionName['Fn::Join']).toBeDefined()
  })

  it('should create multiple permissions for multiple functions', () => {
    awsCompileApigEvents.validated.events = [
      {
        functionName: 'First',
        http: { path: 'foo', method: 'get' },
      },
      {
        functionName: 'Second',
        http: { path: 'bar', method: 'post' },
      },
    ]
    awsCompileApigEvents.permissionMapping = [
      {
        lambdaLogicalId: 'FirstLambdaFunction',
        resourceName: 'Foo',
        event: {
          http: { path: 'foo', method: 'get' },
          functionName: 'First',
        },
      },
      {
        lambdaLogicalId: 'SecondLambdaFunction',
        resourceName: 'Bar',
        event: {
          http: { path: 'bar', method: 'post' },
          functionName: 'Second',
        },
      },
    ]

    awsCompileApigEvents.compilePermissions()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    expect(resources.FirstLambdaPermissionApiGateway).toBeDefined()
    expect(resources.SecondLambdaPermissionApiGateway).toBeDefined()
  })
})
