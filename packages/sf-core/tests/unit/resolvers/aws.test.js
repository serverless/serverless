import { jest } from '@jest/globals'

// Mock sub-resolvers
const mockResolveVariableFromSsm = jest.fn()
const mockResolveVariableFromS3 = jest.fn()
const mockResolveVariableFromCloudFormation = jest.fn()
const mockGetAwsCredentials = jest.fn()
const mockStsSend = jest.fn()

// Mock SSM module
jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/ssm.js',
  () => ({
    resolveVariableFromSsm: mockResolveVariableFromSsm,
  }),
)

// Mock S3 module
jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/s3.js',
  () => ({
    resolveVariableFromS3: mockResolveVariableFromS3,
    storeDataInS3: jest.fn(),
  }),
)

// Mock CF module
jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/cf.js',
  () => ({
    resolveVariableFromCloudFormation: mockResolveVariableFromCloudFormation,
  }),
)

// Mock credentials module
jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/credentials.js',
  () => ({
    getAwsCredentials: mockGetAwsCredentials,
  }),
)

// Mock STS
jest.unstable_mockModule('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    send: mockStsSend,
  })),
  GetCallerIdentityCommand: jest.fn(),
}))

// Mock utilities
jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((client) => client),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options) {
      super(message)
      this.code = code
      this.options = options
    }
  },
  ServerlessErrorCodes: {
    general: { AWS_CREDENTIALS_MISSING: 'AWS_CREDENTIALS_MISSING' },
  },
}))

// Import after mocking
const { Aws } = await import('../../../src/lib/resolvers/providers/aws/aws.js')

describe('Aws Resolver', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    mockResolveVariableFromSsm.mockReset()
    mockResolveVariableFromS3.mockReset()
    mockResolveVariableFromCloudFormation.mockReset()
    mockGetAwsCredentials.mockReset()
    mockStsSend.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('region resolution', () => {
    test('uses region from providerConfig', async () => {
      mockResolveVariableFromCloudFormation.mockResolvedValue('output-value')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: { region: 'eu-west-1' },
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      await resolver.resolveVariable({
        resolverType: 'cf',
        resolutionDetails: {},
        key: 'my-stack.MyOutput',
      })

      expect(mockResolveVariableFromCloudFormation).toHaveBeenCalledWith(
        mockLogger,
        resolver.credentials,
        { region: 'eu-west-1' },
        'eu-west-1',
        'my-stack.MyOutput',
      )
    })

    /**
     * Tests the ${cf(eu-west-1):stackName.output} syntax where region is specified
     * in the resolver syntax itself (resolutionDetails.region)
     */
    test('uses region override from resolutionDetails (cf(region) syntax)', async () => {
      mockResolveVariableFromCloudFormation.mockResolvedValue('output-value')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: { provider: { region: 'us-east-1' } }, // Default region
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      // This simulates ${cf(eu-west-1):my-stack.MyOutput}
      await resolver.resolveVariable({
        resolverType: 'cf',
        resolutionDetails: { region: 'eu-west-1' },
        key: 'my-stack.MyOutput',
      })

      // Should use eu-west-1 from resolutionDetails, not us-east-1 from serviceConfig
      expect(mockResolveVariableFromCloudFormation).toHaveBeenCalledWith(
        mockLogger,
        resolver.credentials,
        {},
        'eu-west-1',
        'my-stack.MyOutput',
      )
    })

    test('uses region from CLI options when config has none', async () => {
      mockResolveVariableFromCloudFormation.mockResolvedValue('output-value')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: { region: 'us-west-2' },
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      await resolver.resolveVariable({
        resolverType: 'cf',
        resolutionDetails: {},
        key: 'my-stack.MyOutput',
      })

      expect(mockResolveVariableFromCloudFormation).toHaveBeenCalledWith(
        mockLogger,
        resolver.credentials,
        {},
        'us-west-2',
        'my-stack.MyOutput',
      )
    })

    test('uses region from serviceConfigFile provider', async () => {
      mockResolveVariableFromCloudFormation.mockResolvedValue('output-value')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: { provider: { region: 'sa-east-1' } },
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      await resolver.resolveVariable({
        resolverType: 'cf',
        resolutionDetails: {},
        key: 'my-stack.MyOutput',
      })

      expect(mockResolveVariableFromCloudFormation).toHaveBeenCalledWith(
        mockLogger,
        resolver.credentials,
        {},
        'sa-east-1',
        'my-stack.MyOutput',
      )
    })

    test('defaults to us-east-1 when no region specified', async () => {
      mockResolveVariableFromCloudFormation.mockResolvedValue('output-value')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      await resolver.resolveVariable({
        resolverType: 'cf',
        resolutionDetails: {},
        key: 'my-stack.MyOutput',
      })

      expect(mockResolveVariableFromCloudFormation).toHaveBeenCalledWith(
        mockLogger,
        resolver.credentials,
        {},
        'us-east-1',
        'my-stack.MyOutput',
      )
    })
  })

  describe('resolver routing', () => {
    test('routes to SSM resolver', async () => {
      mockResolveVariableFromSsm.mockResolvedValue('ssm-value')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      const result = await resolver.resolveVariable({
        resolverType: 'ssm',
        resolutionDetails: {},
        key: '/my/param',
      })

      expect(result).toBe('ssm-value')
      expect(mockResolveVariableFromSsm).toHaveBeenCalled()
    })

    test('routes to S3 resolver', async () => {
      mockResolveVariableFromS3.mockResolvedValue('s3-content')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      const result = await resolver.resolveVariable({
        resolverType: 's3',
        resolutionDetails: {},
        key: 'my-bucket/my-key',
      })

      expect(result).toBe('s3-content')
      expect(mockResolveVariableFromS3).toHaveBeenCalled()
    })

    test('routes to CF resolver', async () => {
      mockResolveVariableFromCloudFormation.mockResolvedValue('cf-output')

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      const result = await resolver.resolveVariable({
        resolverType: 'cf',
        resolutionDetails: {},
        key: 'my-stack.MyOutput',
      })

      expect(result).toBe('cf-output')
      expect(mockResolveVariableFromCloudFormation).toHaveBeenCalled()
    })
  })

  describe('special keys', () => {
    test('resolves accountId', async () => {
      mockStsSend.mockResolvedValue({ Account: '123456789012' })

      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      const result = await resolver.resolveVariable({
        resolverType: 'ssm',
        resolutionDetails: {},
        key: 'accountId',
      })

      expect(result).toBe('123456789012')
    })

    test('resolves region', async () => {
      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: { region: 'eu-central-1' },
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })
      resolver.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }

      const result = await resolver.resolveVariable({
        resolverType: 'ssm',
        resolutionDetails: {},
        key: 'region',
      })

      expect(result).toBe('eu-central-1')
    })
  })

  describe('static properties', () => {
    test('has correct type', () => {
      expect(Aws.type).toBe('aws')
    })

    test('has correct resolvers', () => {
      expect(Aws.resolvers).toEqual(['ssm', 's3', 'cf'])
    })

    test('has correct default resolver', () => {
      expect(Aws.defaultResolver).toBe('ssm')
    })
  })
})
