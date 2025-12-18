import { jest } from '@jest/globals'

// Create mock functions first
const mockGetLambdaResourceInfo = jest.fn()
const mockGetIamResourceInfo = jest.fn()
const mockGetSqsResourceInfo = jest.fn()
const mockGetS3ResourceInfo = jest.fn()
const mockGetRestApiGatewayResourceInfo = jest.fn()
const mockGetDynamoDBResourceInfo = jest.fn()

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

// Import the module under test
const { getServiceSummary } = await import('../src/tools/service-summary.js')

describe('getServiceSummary', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  it('should validate input and return error for missing service type', async () => {
    const result = await getServiceSummary({
      resources: [{ id: 'test', type: 'lambda' }],
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Please provide a service type')
  })

  it('should validate input and return error for empty resources array', async () => {
    const result = await getServiceSummary({
      serviceType: 'aws',
      resources: [],
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      'Please provide at least one resource',
    )
  })

  it('should validate input and return error for unsupported service type', async () => {
    const result = await getServiceSummary({
      serviceType: 'unsupported',
      resources: [{ id: 'test', type: 'lambda' }],
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Unsupported service type')
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
    mockGetS3ResourceInfo.mockResolvedValue({
      resourceId: 'bucket1',
      type: 's3',
      bucketName: 'bucket1',
      location: 'us-east-1',
    })
    mockGetRestApiGatewayResourceInfo.mockResolvedValue({
      resourceId: 'api1',
      type: 'restapigateway',
      id: 'api1',
      name: 'Test API',
      stages: [{ name: 'dev' }],
    })

    const result = await getServiceSummary({
      serviceType: 'aws',
      resources: [
        { id: 'lambda1', type: 'lambda' },
        { id: 'role1', type: 'iam' },
        { id: 'queue1', type: 'sqs' },
      ],
    })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)).toEqual([
      { resourceId: 'lambda1', type: 'lambda', status: 'active' },
      { resourceId: 'role1', type: 'iam', status: 'valid' },
      {
        resourceId: 'queue1',
        type: 'sqs',
        queueUrl: 'https://sqs.region.amazonaws.com/account/queue1',
      },
    ])
    expect(mockGetLambdaResourceInfo).toHaveBeenCalledWith({
      resourceId: 'lambda1',
      startTime: undefined,
      endTime: undefined,
      period: undefined,
    })
    expect(mockGetIamResourceInfo).toHaveBeenCalledWith({
      resourceId: 'role1',
      startTime: undefined,
      endTime: undefined,
      period: undefined,
    })
    expect(mockGetSqsResourceInfo).toHaveBeenCalledWith({
      resourceId: 'queue1',
      startTime: undefined,
      endTime: undefined,
      period: undefined,
    })
  })

  it('should handle resources with missing id or type', async () => {
    const result = await getServiceSummary({
      serviceType: 'aws',
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
      serviceType: 'aws',
      resources: [{ id: 'users-table', type: 'dynamodb' }],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].type).toBe('dynamodb')
    expect(resultData[0].tableName).toBe('users-table')
    expect(resultData[0].tableDetails).toBeDefined()
    expect(resultData[0].metrics).toBeDefined()

    expect(mockGetDynamoDBResourceInfo).toHaveBeenCalledWith({
      resourceId: 'users-table',
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
      period: undefined,
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
      serviceType: 'aws',
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
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-02T00:00:00Z',
      period: 3600,
    })
  })

  it('should handle unsupported resource types', async () => {
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: 'queue1',
      type: 'sqs',
      queueUrl: 'https://sqs.region.amazonaws.com/account/queue1',
    })

    const result = await getServiceSummary({
      serviceType: 'aws',
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
      error: 'Unsupported resource type: unsupported for service: aws',
    })
  })

  it('should handle errors from resource info functions', async () => {
    mockGetLambdaResourceInfo.mockRejectedValue(new Error('Lambda error'))

    const result = await getServiceSummary({
      serviceType: 'aws',
      resources: [{ id: 'lambda1', type: 'lambda' }],
    })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)[0]).toEqual({
      id: 'lambda1',
      type: 'lambda',
      error: 'Lambda error',
    })
  })
})
