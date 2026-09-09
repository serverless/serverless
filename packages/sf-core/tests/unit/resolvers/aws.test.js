import { jest } from '@jest/globals'

// Mock sub-resolvers
const mockResolveVariableFromSsm = jest.fn()
const mockResolveVariableFromS3 = jest.fn()
const mockResolveVariableFromCloudFormation = jest.fn()
const mockGetAwsCredentials = jest.fn()
const mockSendAwsRequest = jest.fn()
const mockInvalidateAwsResponseCache = jest.fn()

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

jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/clients.js',
  () => ({
    sendAwsRequest: mockSendAwsRequest,
    invalidateAwsResponseCache: mockInvalidateAwsResponseCache,
  }),
)

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
    mockSendAwsRequest.mockReset()
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

  describe('error translation', () => {
    const makeResolver = () => {
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
      return resolver
    }

    test.each(['ExpiredToken', 'ExpiredTokenException'])(
      'translates %s from a resolver into the friendly credentials message',
      async (name) => {
        const expired = new Error(
          'The security token included in the request is expired',
        )
        expired.name = name
        mockResolveVariableFromSsm.mockRejectedValue(expired)

        const error = await makeResolver()
          .resolveVariable({
            resolverType: 'ssm',
            resolutionDetails: {},
            key: '/p',
          })
          .catch((e) => e)

        expect(error.code).toBe('AWS_CREDENTIALS_MISSING')
        expect(error.message).toBe(
          'AWS credentials appear to have expired. This is likely due to the use of temporary credentials (e.g. AWS SSO, AWS IAM STS). Original error from AWS: "The security token included in the request is expired"',
        )
        expect(error.providerError).toBe(expired)
      },
    )

    test('rethrows every other resolver error as the same object', async () => {
      const denied = new Error('Access Denied')
      denied.name = 'AccessDeniedException'
      mockResolveVariableFromCloudFormation.mockRejectedValue(denied)

      await expect(
        makeResolver().resolveVariable({
          resolverType: 'cf',
          resolutionDetails: {},
          key: 'stack.Out',
        }),
      ).rejects.toBe(denied)
    })

    test('returns resolved values unchanged', async () => {
      mockResolveVariableFromS3.mockResolvedValue('file content')

      await expect(
        makeResolver().resolveVariable({
          resolverType: 's3',
          resolutionDetails: {},
          key: 'bucket/key',
        }),
      ).resolves.toBe('file content')
    })

    test('translates ExpiredTokenException from STS when resolving accountId', async () => {
      const expired = new Error(
        'The security token included in the request is expired',
      )
      expired.name = 'ExpiredTokenException'
      mockSendAwsRequest.mockRejectedValue(expired)

      const error = await makeResolver()
        .resolveVariable({
          resolverType: 'ssm',
          resolutionDetails: {},
          key: 'accountId',
        })
        .catch((e) => e)

      expect(error.code).toBe('AWS_CREDENTIALS_EXPIRED')
      expect(error.message).toContain('AWS credentials appear to have expired.')
    })
  })

  describe('special keys', () => {
    test('resolves accountId', async () => {
      mockSendAwsRequest.mockResolvedValue({ Account: '123456789012' })

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
      const request = mockSendAwsRequest.mock.calls[0][0]
      expect(request).toMatchObject({
        service: 'sts',
        region: 'us-east-1',
        target: 'caller-identity',
        cache: true,
        logger: mockLogger,
      })
      expect(request.command.input).toEqual({})
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

    // Mapping table doubles as the safety net for our use of the AWS SDK's
    // `partition` helper. If an SDK upgrade changes the export shape or the
    // partition data, these fail loudly in CI instead of silently producing
    // wrong ARNs (e.g. for GovCloud users). The unknown-region case asserts the
    // fallback to `aws`, matching the CloudFormation `AWS::Partition`
    // pseudo-parameter.
    test.each([
      ['us-east-1', 'aws'],
      ['eu-west-1', 'aws'],
      ['ap-southeast-2', 'aws'],
      ['cn-north-1', 'aws-cn'],
      ['cn-northwest-1', 'aws-cn'],
      ['us-gov-east-1', 'aws-us-gov'],
      ['us-gov-west-1', 'aws-us-gov'],
      ['us-iso-east-1', 'aws-iso'],
      ['us-isob-east-1', 'aws-iso-b'],
      ['eu-isoe-west-1', 'aws-iso-e'],
      ['us-isof-south-1', 'aws-iso-f'],
      ['eusc-de-east-1', 'aws-eusc'],
      ['made-up-region-9', 'aws'],
    ])('resolves partition for region %s to %s', async (region, expected) => {
      const resolver = new Aws({
        logger: mockLogger,
        providerConfig: { region },
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
        key: 'partition',
      })

      expect(result).toBe(expected)
    })
  })

  describe('isDefaultConfig', () => {
    const build = (providerConfig) =>
      new Aws({
        logger: mockLogger,
        providerConfig,
        serviceConfigFile: {},
        configFileDirPath: '/tmp',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
      })

    test('is true when the config carries nothing but the type', () => {
      expect(build({ type: 'aws' }).isDefaultConfig).toBe(true)
    })

    test('is true for an empty config', () => {
      expect(build({}).isDefaultConfig).toBe(true)
    })

    test('is false when a profile is configured', () => {
      expect(build({ type: 'aws', profile: 'x' }).isDefaultConfig).toBe(false)
    })

    test('is false when any other option is configured', () => {
      expect(build({ type: 'aws', region: 'eu-west-1' }).isDefaultConfig).toBe(
        false,
      )
    })

    test('hands isDefaultConfig to getAwsCredentials', async () => {
      mockGetAwsCredentials.mockResolvedValue(() => ({}))
      await build({ type: 'aws' }).resolveCredentials()
      expect(mockGetAwsCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ isDefaultConfig: true }),
      )
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
