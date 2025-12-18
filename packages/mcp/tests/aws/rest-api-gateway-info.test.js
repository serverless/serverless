import { jest } from '@jest/globals'

// Mock the REST API Gateway client
const mockGetRestApis = jest.fn()
const mockGetStages = jest.fn()
const mockGetResources = jest.fn()
const mockGetDeployments = jest.fn()
const mockGetApiKeys = jest.fn()
const mockGetUsagePlans = jest.fn()
const mockGetVpcLinks = jest.fn()
const mockGetIntegration = jest.fn()
const mockGetApiGatewayMetricData = jest.fn()

// Mock the rest-api-gateway-resource-info module
const mockGetRestApiGatewayResourceInfo = jest.fn()

jest.unstable_mockModule(
  '../../src/lib/aws/rest-api-gateway-resource-info.js',
  () => ({
    getRestApiGatewayResourceInfo: mockGetRestApiGatewayResourceInfo,
  }),
)

jest.unstable_mockModule(
  '../../../../packages/engine/src/lib/aws/restApiGateway.js',
  () => {
    return {
      default: jest.fn().mockImplementation(() => ({
        init: jest.fn().mockResolvedValue({}),
        getRestApis: mockGetRestApis,
        getStages: mockGetStages,
        getResources: mockGetResources,
        getDeployments: mockGetDeployments,
        getApiKeys: mockGetApiKeys,
        getUsagePlans: mockGetUsagePlans,
        getVpcLinks: mockGetVpcLinks,
        getIntegration: mockGetIntegration,
        getRestApiGatewayMetricData: mockGetApiGatewayMetricData,
      })),
    }
  },
)

// Import the module under test (after mocking)
const { getRestApiGatewayInfo } = await import(
  '../../src/tools/aws/rest-api-gateway-info.js'
)

describe('REST API Gateway Info Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should return error when no API IDs are provided', async () => {
    const result = await getRestApiGatewayInfo({ apiIds: [] })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      'Error: Please provide at least one REST API Gateway API ID',
    )
  })

  test('should get API details for a single API ID', async () => {
    const apiId = 'abc123'

    // Mock the resource info function
    mockGetRestApiGatewayResourceInfo.mockResolvedValue({
      resourceId: apiId,
      type: 'restapigateway',
      id: apiId,
      name: 'Test API',
      description: 'API for testing',
      createdDate: '2023-01-01T00:00:00Z',
      version: '1.0',
      apiKeySource: 'HEADER',
      endpointConfiguration: {
        types: ['REGIONAL'],
      },
      stages: [
        {
          name: 'dev',
          deploymentId: 'dep123',
          description: 'Development stage',
          createdDate: '2023-01-01T00:00:00Z',
          lastUpdatedDate: '2023-01-02T00:00:00Z',
        },
      ],
      resources: [
        {
          id: 'res123',
          path: '/test',
          pathPart: 'test',
          parentId: 'root',
          resourceMethods: {
            GET: {
              integration: {
                type: 'AWS_PROXY',
                httpMethod: 'POST',
                uri: 'arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:test-function/invocations',
                timeoutInMillis: 29000,
              },
            },
          },
        },
      ],
      metrics: {
        dev: {
          Count: {
            Sum: {
              values: [100, 200, 300],
              timestamps: [
                '2023-01-01T00:00:00Z',
                '2023-01-01T01:00:00Z',
                '2023-01-01T02:00:00Z',
              ],
            },
          },
        },
      },
    })

    const result = await getRestApiGatewayInfo({
      apiIds: [apiId],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    expect(result.isError).toBeUndefined()
    expect(result.content.length).toBeGreaterThan(0)

    // Parse the JSON content and verify it contains the expected data
    const jsonContent = JSON.parse(result.content[0].text)
    // Verify the structure of the JSON content without comparing to mock results directly
    expect(jsonContent).toHaveLength(1)
    expect(jsonContent[0]).toHaveProperty('resourceId', apiId)
    expect(jsonContent[0]).toHaveProperty('type', 'restapigateway')

    // Verify the resource info function was called with the correct parameters
    expect(mockGetRestApiGatewayResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: apiId,
        startTime: '2023-01-01T00:00:00Z',
        endTime: '2023-01-01T03:00:00Z',
      }),
    )
  })

  test('should handle errors for individual APIs', async () => {
    const apiId = 'abc123'

    // Mock the resource info function to return an error
    mockGetRestApiGatewayResourceInfo.mockResolvedValue({
      resourceId: apiId,
      type: 'restapigateway',
      status: 'error',
      error: 'REST API Gateway with ID abc123 not found',
    })

    const result = await getRestApiGatewayInfo({
      apiIds: [apiId],
    })

    expect(result.isError).toBeUndefined()
    expect(result.content.length).toBeGreaterThan(0)

    // Check that the error information is included in the JSON data
    const jsonContent = JSON.parse(result.content[0].text)
    expect(jsonContent).toHaveLength(1)
    expect(jsonContent[0]).toHaveProperty('resourceId', apiId)
    expect(jsonContent[0]).toHaveProperty('status', 'error')
    expect(jsonContent[0]).toHaveProperty('error')
  })

  test('should use default time range and period when not specified', async () => {
    const apiId = 'abc123'

    // Mock the resource info function
    mockGetRestApiGatewayResourceInfo.mockResolvedValue({
      resourceId: apiId,
      type: 'restapigateway',
      id: apiId,
      name: 'Test API',
      description: 'API for testing',
      stages: [],
      resources: [],
    })

    await getRestApiGatewayInfo({
      apiIds: [apiId],
    })

    // Verify the resource info function was called with the API ID
    expect(mockGetRestApiGatewayResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: apiId,
      }),
    )
  })

  test('should handle multiple API IDs', async () => {
    const apiIds = ['abc123', 'def456']

    // Mock the resource info function for the first API
    mockGetRestApiGatewayResourceInfo.mockResolvedValueOnce({
      resourceId: apiIds[0],
      type: 'restapigateway',
      id: apiIds[0],
      name: 'Test API 1',
      description: 'First API for testing',
      stages: [],
      resources: [],
    })

    // Mock the resource info function for the second API
    mockGetRestApiGatewayResourceInfo.mockResolvedValueOnce({
      resourceId: apiIds[1],
      type: 'restapigateway',
      id: apiIds[1],
      name: 'Test API 2',
      description: 'Second API for testing',
      stages: [],
      resources: [],
    })

    const result = await getRestApiGatewayInfo({
      apiIds: apiIds,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content.length).toBeGreaterThan(0)

    // Parse the JSON content and verify it contains the expected data
    const jsonContent = JSON.parse(result.content[0].text)
    expect(jsonContent).toHaveLength(2)
    expect(jsonContent[0]).toHaveProperty('resourceId', apiIds[0])
    expect(jsonContent[1]).toHaveProperty('resourceId', apiIds[1])

    // Verify the resource info function was called for each API ID
    expect(mockGetRestApiGatewayResourceInfo).toHaveBeenCalledTimes(2)
    expect(mockGetRestApiGatewayResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: apiIds[0],
      }),
    )
    expect(mockGetRestApiGatewayResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: apiIds[1],
      }),
    )
  })
})
