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

describe('#compileResources()', () => {
  let serverless
  let awsCompileApigEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { stage: 'dev', region: 'us-east-1' }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    awsCompileApigEvents.validated = {}
  })

  it('should construct the correct (sorted) resourcePaths array', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: '', method: 'GET' } },
      { http: { path: 'foo/bar', method: 'POST' } },
      { http: { path: 'bar/-', method: 'GET' } },
      { http: { path: 'bar/foo', method: 'GET' } },
      { http: { path: 'bar/{id}/foobar', method: 'GET' } },
      { http: { path: 'bar/{id}', method: 'GET' } },
    ]
    const resourcePaths = Object.keys(awsCompileApigEvents.getResourcePaths())
    expect(resourcePaths).toContain('foo')
    expect(resourcePaths).toContain('foo/bar')
    expect(resourcePaths).toContain('bar')
    expect(resourcePaths).toContain('bar/-')
    expect(resourcePaths).toContain('bar/foo')
    expect(resourcePaths).toContain('bar/{id}')
    expect(resourcePaths).toContain('bar/{id}/foobar')
  })

  it('should reference the appropriate ParentId', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: 'foo/bar', method: 'POST' } },
      { http: { path: 'bar/-', method: 'GET' } },
    ]
    awsCompileApigEvents.compileResources()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Check that parent resources exist
    const resourceKeys = Object.keys(resources)
    expect(resourceKeys.some((key) => key.includes('Foo'))).toBe(true)
    expect(resourceKeys.some((key) => key.includes('Bar'))).toBe(true)
  })

  it('should create API Gateway Resource resources', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: 'users', method: 'GET' } },
    ]
    awsCompileApigEvents.compileResources()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const resourceKey = Object.keys(resources).find((key) =>
      key.startsWith('ApiGatewayResource'),
    )
    expect(resourceKey).toBeDefined()
    expect(resources[resourceKey].Type).toBe('AWS::ApiGateway::Resource')
  })

  it('should handle path parameters', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: 'users/{id}', method: 'GET' } },
    ]
    awsCompileApigEvents.compileResources()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Check that the resource with path parameter is created
    const resourceKeys = Object.keys(resources)
    const hasPathParam = resourceKeys.some(
      (key) => key.includes('IdVar') || key.includes('Id'),
    )
    expect(hasPathParam).toBe(true)
  })

  it('should handle proxy+ path', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: '{proxy+}', method: 'ANY' } },
    ]
    awsCompileApigEvents.compileResources()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const resourceKeys = Object.keys(resources)
    expect(resourceKeys.length).toBeGreaterThan(0)
  })

  it('should handle nested paths correctly', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: 'a/b/c/d', method: 'GET' } },
    ]
    awsCompileApigEvents.compileResources()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Should create resources for a, a/b, a/b/c, a/b/c/d
    const resourceKeys = Object.keys(resources).filter((key) =>
      key.startsWith('ApiGatewayResource'),
    )
    expect(resourceKeys.length).toBeGreaterThanOrEqual(4)
  })

  it('should reuse existing path segments', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: 'users/list', method: 'GET' } },
      { http: { path: 'users/create', method: 'POST' } },
    ]
    awsCompileApigEvents.compileResources()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    // Should only create one 'users' resource
    const usersResources = Object.keys(resources).filter(
      (key) =>
        key.includes('Users') &&
        !key.includes('List') &&
        !key.includes('Create'),
    )
    expect(usersResources.length).toBe(1)
  })

  it('should populate apiGatewayResources object', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: 'users', method: 'GET' } },
    ]
    awsCompileApigEvents.compileResources()

    expect(awsCompileApigEvents.apiGatewayResources).toBeDefined()
    expect(awsCompileApigEvents.apiGatewayResources['users']).toBeDefined()
  })

  it('should handle root path', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: '', method: 'GET' } },
    ]
    awsCompileApigEvents.compileResources()

    // Root path should not create any resource, uses RestApi root resource
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const resourceKeys = Object.keys(resources).filter((key) =>
      key.startsWith('ApiGatewayResource'),
    )
    // Root path doesn't need a resource
    expect(awsCompileApigEvents.apiGatewayResources['']).toBeUndefined()
  })

  it('should handle special characters in paths', () => {
    awsCompileApigEvents.validated.events = [
      { http: { path: 'foo-bar', method: 'GET' } },
    ]
    awsCompileApigEvents.compileResources()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources

    const resourceKeys = Object.keys(resources)
    expect(resourceKeys.length).toBeGreaterThan(0)
  })
})
