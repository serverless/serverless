import { jest } from '@jest/globals'

// Create mock functions first
const mockGetLambdaResourceInfo = jest.fn()
const mockGetIamResourceInfo = jest.fn()
const mockGetSqsResourceInfo = jest.fn()
const mockGetS3ResourceInfo = jest.fn()
const mockGetRestApiGatewayResourceInfo = jest.fn()
const mockGetDynamoDBResourceInfo = jest.fn()
const mockGetHttpApiGatewayResourceInfo = jest.fn()
const mockDescribeStackResources = jest.fn()

// Then mock the aws resource-info module
jest.unstable_mockModule('../src/lib/aws/resource-info.js', () => {
  return {
    getLambdaResourceInfo: mockGetLambdaResourceInfo,
    getIamResourceInfo: mockGetIamResourceInfo,
    getSqsResourceInfo: mockGetSqsResourceInfo,
    getS3ResourceInfo: mockGetS3ResourceInfo,
    getRestApiGatewayResourceInfo: mockGetRestApiGatewayResourceInfo,
    getDynamoDBResourceInfo: mockGetDynamoDBResourceInfo,
  }
})

jest.unstable_mockModule(
  '../src/lib/aws/http-api-gateway-resource-info.js',
  () => {
    return {
      getHttpApiGatewayResourceInfo: mockGetHttpApiGatewayResourceInfo,
    }
  },
)

jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudformation.js',
  () => {
    return {
      AwsCloudformationService: jest.fn(() => ({
        describeStackResources: mockDescribeStackResources,
      })),
    }
  },
)

// Import the module under test
const { getServiceSummary } = await import('../src/tools/service-summary.js')
const { AwsCloudformationService } =
  await import('@serverless/engine/src/lib/aws/cloudformation.js')

// Time bounds used by the tests. Expectations are derived from these same
// inputs via Date.parse, because getServiceSummary forwards the parsed
// millisecond values (validateAndAdjustParameters -> parseTimestamp) to the
// per-resource handlers.
const START_TIME = '2023-01-01T00:00:00Z'
const END_TIME = '2023-01-01T03:00:00Z'
const START_TIME_MS = Date.parse(START_TIME)
const END_TIME_MS = Date.parse(END_TIME)

describe('getServiceSummary', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  it('should validate input and return error for missing cloudProvider', async () => {
    const result = await getServiceSummary({
      resources: [{ id: 'test', type: 'lambda' }],
    })
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe(
      'Error: Please provide a cloud provider.',
    )
  })

  // The registered tool contract (src/tools-definition.js) declares
  // `serviceType` as the required provider enum and `cloudProvider` as
  // optional, while the implementation reads only `cloudProvider`. This test
  // pins what a schema-conformant call actually gets today; it is expected to
  // change when that divergence is resolved.
  it('should still require cloudProvider when only the registered serviceType is provided', async () => {
    const result = await getServiceSummary({
      serviceType: 'aws',
      resources: [{ id: 'test', type: 'lambda' }],
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: Please provide a cloud provider.',
    )
    expect(mockGetLambdaResourceInfo).not.toHaveBeenCalled()
  })

  it('should validate input and return error for empty resources array', async () => {
    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [],
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: Please provide at least one resource to get information about.',
    )
  })

  it('should validate input and return error for omitted resources', async () => {
    const result = await getServiceSummary({ cloudProvider: 'aws' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: Please provide at least one resource to get information about.',
    )
  })

  it('should validate input and return error for unsupported cloud provider', async () => {
    const result = await getServiceSummary({
      cloudProvider: 'unsupported',
      resources: [{ id: 'test', type: 'lambda' }],
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: Unsupported cloud provider: unsupported. Supported providers: aws, gcp, azure',
    )
    expect(mockGetLambdaResourceInfo).not.toHaveBeenCalled()
  })

  it('should require serviceName for serviceWideAnalysis', async () => {
    const result = await getServiceSummary({
      cloudProvider: 'aws',
      serviceWideAnalysis: true,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error: serviceName and cloudProvider are required for serviceWideAnalysis.',
    )
    expect(AwsCloudformationService).not.toHaveBeenCalled()
  })

  it('should process multiple resources of different types', async () => {
    mockGetLambdaResourceInfo.mockResolvedValue({
      resourceId: 'lambda1',
      type: 'lambda',
      status: 'active',
    })
    mockGetIamResourceInfo.mockResolvedValue({
      resourceId: 'role1',
      type: 'iam',
      status: 'valid',
    })
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: 'queue1',
      type: 'sqs',
      queueUrl: 'https://sqs.region.amazonaws.com/account/queue1',
    })

    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [
        { id: 'lambda1', type: 'lambda' },
        { id: 'role1', type: 'iam' },
        { id: 'queue1', type: 'sqs' },
      ],
      startTime: START_TIME,
      endTime: END_TIME,
      period: 3600,
      region: 'us-east-1',
      profile: 'default',
    })

    expect(result.isError).toBeUndefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    // Without serviceWideAnalysis the payload is the bare results array
    expect(JSON.parse(result.content[0].text)).toEqual([
      { resourceId: 'lambda1', type: 'lambda', status: 'active' },
      { resourceId: 'role1', type: 'iam', status: 'valid' },
      {
        resourceId: 'queue1',
        type: 'sqs',
        queueUrl: 'https://sqs.region.amazonaws.com/account/queue1',
      },
    ])

    const expectedHandlerArgs = {
      startTime: START_TIME_MS,
      endTime: END_TIME_MS,
      period: 3600,
      region: 'us-east-1',
      profile: 'default',
    }
    expect(mockGetLambdaResourceInfo).toHaveBeenCalledWith({
      resourceId: 'lambda1',
      ...expectedHandlerArgs,
    })
    expect(mockGetIamResourceInfo).toHaveBeenCalledWith({
      resourceId: 'role1',
      ...expectedHandlerArgs,
    })
    expect(mockGetSqsResourceInfo).toHaveBeenCalledWith({
      resourceId: 'queue1',
      ...expectedHandlerArgs,
    })
  })

  it('should forward undefined time bounds and the widest period when no timeframe is given', async () => {
    mockGetS3ResourceInfo.mockResolvedValue({
      resourceId: 'bucket1',
      type: 's3',
      bucketName: 'bucket1',
      location: 'us-east-1',
    })

    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [{ id: 'bucket1', type: 's3' }],
    })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)).toEqual([
      {
        resourceId: 'bucket1',
        type: 's3',
        bucketName: 'bucket1',
        location: 'us-east-1',
      },
    ])
    // With no startTime/endTime, parseTimestamp yields undefined bounds and
    // calculateOptimalPeriod falls through every bucket to its 2-week default.
    expect(mockGetS3ResourceInfo).toHaveBeenCalledWith({
      resourceId: 'bucket1',
      startTime: undefined,
      endTime: undefined,
      period: 1209600,
      region: undefined,
      profile: undefined,
    })
  })

  it('should handle resources with missing id or type', async () => {
    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [
        { id: 'lambda1' }, // Missing type
        { type: 'lambda' }, // Missing id
      ],
    })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)).toEqual([
      { error: 'Resource must have both id and type properties' },
      { error: 'Resource must have both id and type properties' },
    ])
    expect(mockGetLambdaResourceInfo).not.toHaveBeenCalled()
  })

  it('should handle DynamoDB resources', async () => {
    mockGetDynamoDBResourceInfo.mockResolvedValue({
      resourceId: 'users-table',
      type: 'dynamodb',
      tableName: 'users-table',
      tableDetails: {
        Table: {
          TableName: 'users-table',
          TableStatus: 'ACTIVE',
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
          KeySchema: [
            {
              AttributeName: 'id',
              KeyType: 'HASH',
            },
          ],
        },
      },
      metrics: {
        ConsumedReadCapacityUnits: {
          Sum: {
            values: [10, 20, 30],
            timestamps: [
              '2023-01-01T00:00:00Z',
              '2023-01-01T01:00:00Z',
              '2023-01-01T02:00:00Z',
            ],
          },
        },
      },
    })

    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [{ id: 'users-table', type: 'dynamodb' }],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].type).toBe('dynamodb')
    expect(resultData[0].tableName).toBe('users-table')
    expect(resultData[0].tableDetails).toBeDefined()
    expect(resultData[0].metrics).toBeDefined()

    // period is omitted by the caller, so calculateOptimalPeriod derives it
    // from the 3-hour window: max(3600, ceil(10800 / 300)) === 3600.
    expect(mockGetDynamoDBResourceInfo).toHaveBeenCalledWith({
      resourceId: 'users-table',
      startTime: START_TIME_MS,
      endTime: END_TIME_MS,
      period: 3600,
      region: undefined,
      profile: undefined,
    })
  })

  it('should handle REST API Gateway resources', async () => {
    mockGetRestApiGatewayResourceInfo.mockResolvedValue({
      resourceId: 'api1',
      type: 'restapigateway',
      id: 'api1',
      name: 'Test API',
      description: 'API for testing',
      stages: [{ name: 'dev', deploymentId: 'abc123' }],
      resources: [{ id: 'res1', path: '/test', resourceMethods: { GET: {} } }],
      metrics: { dev: { Count: { Sum: { values: [100, 200] } } } },
    })

    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [{ id: 'api1', type: 'restapigateway' }],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-02T00:00:00Z',
      period: 3600,
    })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)).toEqual([
      {
        resourceId: 'api1',
        type: 'restapigateway',
        id: 'api1',
        name: 'Test API',
        description: 'API for testing',
        stages: [{ name: 'dev', deploymentId: 'abc123' }],
        resources: [
          { id: 'res1', path: '/test', resourceMethods: { GET: {} } },
        ],
        metrics: { dev: { Count: { Sum: { values: [100, 200] } } } },
      },
    ])

    expect(mockGetRestApiGatewayResourceInfo).toHaveBeenCalledWith({
      resourceId: 'api1',
      startTime: Date.parse('2023-01-01T00:00:00Z'),
      endTime: Date.parse('2023-01-02T00:00:00Z'),
      period: 3600,
      region: undefined,
      profile: undefined,
    })
  })

  it('should handle unsupported resource types', async () => {
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: 'queue1',
      type: 'sqs',
      queueUrl: 'https://sqs.region.amazonaws.com/account/queue1',
    })

    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [
        { id: 'queue1', type: 'sqs' },
        { id: 'resource1', type: 'unsupported' },
      ],
    })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)[0]).toEqual({
      resourceId: 'queue1',
      type: 'sqs',
      queueUrl: 'https://sqs.region.amazonaws.com/account/queue1',
    })
    expect(JSON.parse(result.content[0].text)[1]).toEqual({
      id: 'resource1',
      type: 'unsupported',
      error: 'Unsupported resource type: unsupported for cloud provider: aws',
    })
  })

  it('should handle errors from resource info functions', async () => {
    mockGetLambdaResourceInfo.mockRejectedValue(new Error('Lambda error'))

    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [{ id: 'lambda1', type: 'lambda' }],
    })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)[0]).toEqual({
      id: 'lambda1',
      type: 'lambda',
      error: 'Lambda error',
    })
  })

  it('should report parameter validation failures as a tool error', async () => {
    const result = await getServiceSummary({
      cloudProvider: 'aws',
      resources: [{ id: 'lambda1', type: 'lambda' }],
      startTime: START_TIME,
      endTime: END_TIME,
      period: 90, // not a multiple of 60
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error retrieving service summary: Invalid period: 90. Period must be a multiple of 60 seconds.',
    )
    expect(mockGetLambdaResourceInfo).not.toHaveBeenCalled()
  })

  describe('serviceWideAnalysis', () => {
    it('should map supported stack resources and wrap results in metadata', async () => {
      mockDescribeStackResources.mockResolvedValue([
        {
          ResourceType: 'AWS::Lambda::Function',
          PhysicalResourceId: 'my-service-dev-hello',
        },
        {
          ResourceType: 'AWS::DynamoDB::Table',
          PhysicalResourceId: 'users-table',
        },
        // Unsupported CloudFormation type: filtered out before any handler runs
        {
          ResourceType: 'AWS::Logs::LogGroup',
          PhysicalResourceId: 'log-group-hello',
        },
      ])
      mockGetLambdaResourceInfo.mockResolvedValue({
        resourceId: 'my-service-dev-hello',
        type: 'lambda',
      })
      mockGetDynamoDBResourceInfo.mockResolvedValue({
        resourceId: 'users-table',
        type: 'dynamodb',
      })

      const result = await getServiceSummary({
        cloudProvider: 'aws',
        serviceWideAnalysis: true,
        serviceName: 'my-service-dev',
        region: 'us-east-1',
        profile: 'default',
        startTime: START_TIME,
        endTime: END_TIME,
        period: 3600,
      })

      expect(AwsCloudformationService).toHaveBeenCalledWith({
        region: 'us-east-1',
        profile: 'default',
      })
      expect(mockDescribeStackResources).toHaveBeenCalledWith('my-service-dev')

      expect(result.isError).toBeUndefined()
      expect(JSON.parse(result.content[0].text)).toEqual({
        metadata: {
          serviceWideAnalysis: true,
          serviceName: 'my-service-dev',
          cloudProvider: 'aws',
          resourceCount: 2,
          resourceTypes: 'lambda, dynamodb',
          message:
            'Retrieved information for 2 resources of types: lambda, dynamodb',
        },
        resources: [
          { resourceId: 'my-service-dev-hello', type: 'lambda' },
          { resourceId: 'users-table', type: 'dynamodb' },
        ],
      })
    })

    it('should return the agent hint when the stack does not exist', async () => {
      mockDescribeStackResources.mockResolvedValue({
        error: 'Stack with id my-service-dev does not exist',
      })

      const result = await getServiceSummary({
        cloudProvider: 'aws',
        serviceWideAnalysis: true,
        serviceName: 'my-service-dev',
        profile: 'my-profile',
      })

      expect(result.isError).toBe(true)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].text).toContain(
        "This is a 'Stack does not exist' error.",
      )
      expect(result.content[0].text).toContain(
        "Stack 'my-service-dev' was not found. Original error: Stack with id my-service-dev does not exist",
      )
      expect(result.content[0].text).toContain(
        "(Current profile: 'my-profile')",
      )
      expect(mockGetLambdaResourceInfo).not.toHaveBeenCalled()
    })

    it('should report no supported resources when the stack has none', async () => {
      mockDescribeStackResources.mockResolvedValue([
        {
          ResourceType: 'AWS::Logs::LogGroup',
          PhysicalResourceId: 'log-group-hello',
        },
      ])

      const result = await getServiceSummary({
        cloudProvider: 'aws',
        serviceWideAnalysis: true,
        serviceName: 'my-service-dev',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe(
        "No supported resources found for service 'my-service-dev'. Supported resource types: lambda, iam, sqs, s3, restapigateway, httpapigateway, dynamodb.",
      )
    })

    it('should surface errors thrown while describing the stack', async () => {
      mockDescribeStackResources.mockRejectedValue(
        new Error('network unreachable'),
      )

      const result = await getServiceSummary({
        cloudProvider: 'aws',
        serviceWideAnalysis: true,
        serviceName: 'my-service-dev',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe(
        "Error retrieving resources for service 'my-service-dev': network unreachable",
      )
    })
  })
})
