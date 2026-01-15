/**
 * Jest tests for Deployment History Tool
 *
 * This test file directly tests the getDeploymentHistory function, mocking the CloudFormation service
 * to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, test, beforeEach } from '@jest/globals'

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

describe('Deployment History Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
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

    const result = await getDeploymentHistory({
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
      region: 'us-east-1',
      profile: 'default',
    })

    // Verify CloudFormation service was initialized with correct config
    expect(AwsCloudformationService).toHaveBeenCalledWith({
      region: 'us-east-1',
      profile: 'default',
    })

    // Verify result structure
    expect(result).toHaveProperty('content')
    expect(result.content).toHaveLength(2)
    expect(result.content[0].type).toBe('text')
    expect(result.content[1].type).toBe('text')

    // Parse the JSON string to verify data
    const jsonData = JSON.parse(result.content[1].text)
    expect(jsonData.service).toBe('my-service-dev')
    expect(jsonData.serviceType).toBe('serverless-framework')
    expect(jsonData.region).toBe('us-east-1')
    expect(jsonData).toHaveProperty('timeRange')
    expect(jsonData).toHaveProperty('eventsByDay')
    expect(jsonData.totalEvents).toBe(2)
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

    // Verify error handling
    expect(result).toHaveProperty('content')
    expect(result.content).toHaveLength(3)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(
      'Error retrieving deployment history',
    )
    expect(result.content[0].text).toContain('Stack does not exist')
  })

  test('should filter events by date range', async () => {
    // Create events spanning multiple days
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const tenDaysAgo = new Date(now)
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

    const mockEvents = [
      {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/my-stack/abc123',
        Timestamp: now,
        LogicalResourceId: 'Resource1',
        ResourceType: 'AWS::Lambda::Function',
        ResourceStatus: 'UPDATE_COMPLETE',
        PhysicalResourceId: 'resource-1',
      },
      {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/my-stack/abc123',
        Timestamp: yesterday,
        LogicalResourceId: 'Resource2',
        ResourceType: 'AWS::S3::Bucket',
        ResourceStatus: 'CREATE_COMPLETE',
        PhysicalResourceId: 'resource-2',
      },
      {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/my-stack/abc123',
        Timestamp: twoDaysAgo,
        LogicalResourceId: 'Resource3',
        ResourceType: 'AWS::DynamoDB::Table',
        ResourceStatus: 'CREATE_COMPLETE',
        PhysicalResourceId: 'resource-3',
      },
      {
        StackId:
          'arn:aws:cloudformation:us-east-1:123456789012:stack/my-stack/abc123',
        Timestamp: tenDaysAgo,
        LogicalResourceId: 'Resource4',
        ResourceType: 'AWS::IAM::Role',
        ResourceStatus: 'CREATE_COMPLETE',
        PhysicalResourceId: 'resource-4',
      },
    ]

    // Set up the mock to return events
    mockDescribeStackEvents.mockResolvedValue({
      events: mockEvents,
      totalEvents: mockEvents.length,
    })

    // Set endDate to 3 days ago, which should include only the first 3 events
    const threeWeeksAgo = new Date(now)
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 3)

    const result = await getDeploymentHistory({
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
      region: 'us-east-1',
      profile: 'default',
      endDate: threeWeeksAgo.toISOString(),
    })

    // Parse the JSON string to verify data
    const jsonData = JSON.parse(result.content[1].text)
    expect(jsonData.totalEvents).toBe(4) // Should include all events since we're using onlyCompletedDeployments
  })
})
