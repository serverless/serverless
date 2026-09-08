/**
 * Jest tests for Deployment History Tool
 *
 * This test file directly tests the getDeploymentHistory function, mocking the CloudFormation service
 * to avoid making actual AWS API calls during testing.
 */

import {
  jest,
  expect,
  describe,
  test,
  beforeEach,
  afterEach,
} from '@jest/globals'

// Create mock functions
const mockDescribeStackEvents = jest.fn()

// Mock the CloudFormation service
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudformation.js',
  () => {
    return {
      AwsCloudformationService: jest.fn(() => ({
        describeStackEvents: mockDescribeStackEvents,
      })),
    }
  },
)

// Import the function after mocking dependencies
const { getDeploymentHistory } =
  await import('../src/tools/deployment-history.js')
const { AwsCloudformationService } =
  await import('@serverless/engine/src/lib/aws/cloudformation.js')
const { formatDate } = await import('../src/utils/date-utils.js')

/**
 * The tool derives the window start from the end date with
 * `start.setDate(start.getDate() - 7)`; expectations are derived the same way
 * from the same input so the assertion holds in any local time zone.
 */
const sevenDaysBefore = (end) => {
  const start = new Date(end)
  start.setDate(start.getDate() - 7)
  return start
}

describe('Deployment History Tool', () => {
  let consoleErrorSpy

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
    // The error path logs through console.error; keep the suite output clean
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  test('should handle successful stack events retrieval', async () => {
    // Mock successful response
    const mockEvents = [
      {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/my-stack/abc123',
        Timestamp: new Date('2023-01-02T10:00:00Z'),
        LogicalResourceId: 'MyLambdaFunction',
        ResourceType: 'AWS::Lambda::Function',
        ResourceStatus: 'CREATE_COMPLETE',
        ResourceStatusReason: null,
        PhysicalResourceId: 'my-lambda-function',
      },
      {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/my-stack/abc123',
        Timestamp: new Date('2023-01-01T09:00:00Z'),
        LogicalResourceId: 'MyS3Bucket',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'UPDATE_COMPLETE',
        ResourceStatusReason: 'Resource update initiated',
        PhysicalResourceId: 'my-bucket',
      },
    ]

    // Set up the mock to return events
    mockDescribeStackEvents.mockResolvedValue({
      events: mockEvents,
      totalEvents: mockEvents.length,
    })

    const endDate = '2023-01-03T00:00:00Z'
    const result = await getDeploymentHistory({
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
      region: 'us-east-1',
      profile: 'default',
      endDate,
    })

    // Verify CloudFormation service was initialized with correct config
    expect(AwsCloudformationService).toHaveBeenCalledWith({
      region: 'us-east-1',
      profile: 'default',
    })

    // Verify result structure: a single text entry carrying the JSON payload
    expect(result).toHaveProperty('content')
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.isError).toBeUndefined()

    // Parse the JSON string to verify data
    const jsonData = JSON.parse(result.content[0].text)
    expect(jsonData.service).toBe('my-service-dev')
    expect(jsonData.serviceType).toBe('serverless-framework')
    expect(jsonData.region).toBe('us-east-1')
    expect(jsonData.timeRange).toEqual({
      start: formatDate(sevenDaysBefore(new Date(endDate))),
      end: formatDate(new Date(endDate)),
    })
    expect(jsonData.totalEvents).toBe(2)
    // Events are grouped by the UTC date part of the formatted timestamp
    expect(jsonData.eventsByDay).toEqual({
      '2023-01-02': [
        {
          timestamp: '2023-01-02 10:00:00',
          logicalId: 'MyLambdaFunction',
          resourceType: 'AWS::Lambda::Function',
          status: 'CREATE_COMPLETE',
          statusReason: null,
          physicalId: 'my-lambda-function',
        },
      ],
      '2023-01-01': [
        {
          timestamp: '2023-01-01 09:00:00',
          logicalId: 'MyS3Bucket',
          resourceType: 'AWS::S3::Bucket',
          status: 'UPDATE_COMPLETE',
          statusReason: 'Resource update initiated',
          physicalId: 'my-bucket',
        },
      ],
    })
  })

  test('should default region and omit AWS config when region and profile are not given', async () => {
    mockDescribeStackEvents.mockResolvedValue({ events: [] })

    const result = await getDeploymentHistory({
      serviceName: 'my-stack',
      serviceType: 'cloudformation',
    })

    expect(AwsCloudformationService).toHaveBeenCalledWith({})

    const jsonData = JSON.parse(result.content[0].text)
    expect(jsonData.region).toBe('default')
    expect(jsonData.eventsByDay).toEqual({})
    expect(jsonData.totalEvents).toBe(0)
  })

  test('should tolerate a response without an events array', async () => {
    mockDescribeStackEvents.mockResolvedValue(undefined)

    const result = await getDeploymentHistory({
      serviceName: 'my-stack',
      serviceType: 'cloudformation',
    })

    expect(result.isError).toBeUndefined()
    const jsonData = JSON.parse(result.content[0].text)
    expect(jsonData.totalEvents).toBe(0)
    expect(jsonData.eventsByDay).toEqual({})
  })

  test('should fall back to placeholders for incomplete events', async () => {
    mockDescribeStackEvents.mockResolvedValue({
      events: [{ Timestamp: new Date('2023-01-02T10:00:00Z') }],
    })

    const result = await getDeploymentHistory({
      serviceName: 'my-stack',
      serviceType: 'cloudformation',
    })

    const jsonData = JSON.parse(result.content[0].text)
    expect(jsonData.eventsByDay['2023-01-02']).toEqual([
      {
        timestamp: '2023-01-02 10:00:00',
        logicalId: 'Unknown',
        resourceType: 'Unknown',
        status: 'Unknown',
        statusReason: null,
        physicalId: null,
      },
    ])
  })

  test('should handle error during stack events retrieval', async () => {
    // Mock error response
    const mockError = new Error('Stack does not exist')
    mockDescribeStackEvents.mockRejectedValue(mockError)

    const result = await getDeploymentHistory({
      serviceName: 'non-existent-stack',
      serviceType: 'cloudformation',
      region: 'us-east-1',
      profile: 'default',
    })

    // Verify error handling: a single text entry plus the isError flag
    expect(result).toHaveProperty('content')
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(
      'Error retrieving deployment history: Stack does not exist',
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Deployment History Tool Error: Stack does not exist',
    )
  })

  test('should map AWS credential errors to the guidance message', async () => {
    mockDescribeStackEvents.mockRejectedValue(
      new Error('ExpiredToken: the security token has expired'),
    )

    const result = await getDeploymentHistory({
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
      profile: 'my-profile',
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      'This is an AWS credentials error.',
    )
    expect(result.content[0].text).toContain('Your credentials have expired.')
    expect(result.content[0].text).toContain("Profile used: 'my-profile'.")
  })

  test('should query the seven days preceding the requested end date', async () => {
    mockDescribeStackEvents.mockResolvedValue({ events: [] })

    const endDate = '2023-01-10T12:00:00Z'
    const result = await getDeploymentHistory({
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
      region: 'us-east-1',
      profile: 'default',
      endDate,
    })

    const expectedEnd = new Date(endDate)
    const expectedStart = sevenDaysBefore(expectedEnd)

    // Date filtering is delegated to the CloudFormation service, which is
    // asked only for completed deployments inside the derived window.
    expect(mockDescribeStackEvents).toHaveBeenCalledWith({
      stackName: 'my-service-dev',
      startDate: expectedStart,
      endDate: expectedEnd,
      onlyCompletedDeployments: true,
    })

    const jsonData = JSON.parse(result.content[0].text)
    expect(jsonData.timeRange).toEqual({
      start: formatDate(expectedStart),
      end: formatDate(expectedEnd),
    })
  })

  test('should report every event returned by the service', async () => {
    // The tool does not re-filter by date: whatever the CloudFormation
    // service returns for the window is formatted and counted.
    const timestamps = [
      new Date('2023-01-09T10:00:00Z'),
      new Date('2023-01-08T10:00:00Z'),
      new Date('2023-01-07T10:00:00Z'),
      new Date('2023-01-07T09:00:00Z'),
    ]
    mockDescribeStackEvents.mockResolvedValue({
      events: timestamps.map((Timestamp, index) => ({
        Timestamp,
        LogicalResourceId: `Resource${index + 1}`,
        ResourceType: 'AWS::Lambda::Function',
        ResourceStatus: 'UPDATE_COMPLETE',
        PhysicalResourceId: `resource-${index + 1}`,
      })),
    })

    const result = await getDeploymentHistory({
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
      region: 'us-east-1',
      profile: 'default',
      endDate: '2023-01-10T12:00:00Z',
    })

    const jsonData = JSON.parse(result.content[0].text)
    expect(jsonData.totalEvents).toBe(4)
    expect(Object.keys(jsonData.eventsByDay)).toEqual([
      '2023-01-09',
      '2023-01-08',
      '2023-01-07',
    ])
    expect(jsonData.eventsByDay['2023-01-07']).toHaveLength(2)
  })
})
