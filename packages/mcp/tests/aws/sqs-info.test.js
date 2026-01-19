/**
 * Jest tests for AWS SQS Info Tool
 *
 * This test file directly tests the getSqsInfo function, mocking the AwsSqsClient
 * to avoid making actual AWS API calls during testing.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

// Create mock functions
const mockGetQueueDetails = jest.fn()
const mockGetQueueAttributes = jest.fn()
const mockListQueues = jest.fn()
const mockGetQueueNameFromUrl = jest.fn()
const mockGetSqsMetricData = jest.fn()
const mockGetSqsResourceInfo = jest.fn()

// Mock the AWS SQS client
await jest.unstable_mockModule('../../../engine/src/lib/aws/sqs.js', () => {
  return {
    AwsSqsClient: jest.fn(() => ({
      getQueueDetails: mockGetQueueDetails,
      getQueueAttributes: mockGetQueueAttributes,
      listQueues: mockListQueues,
      getQueueNameFromUrl: mockGetQueueNameFromUrl,
    })),
  }
})

// Mock the AWS CloudWatch client
await jest.unstable_mockModule(
  '../../../engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => ({
        getSqsMetricData: mockGetSqsMetricData,
      })),
    }
  },
)

// Mock the resource-info module
await jest.unstable_mockModule('../../src/lib/aws/resource-info.js', () => {
  return {
    getSqsResourceInfo: mockGetSqsResourceInfo,
  }
})

// Import the function after mocking dependencies
const { getSqsInfo } = await import('../../src/tools/aws/sqs-info.js')

describe('AWS SQS Info Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Reset mock implementations
    mockGetQueueDetails.mockReset()
    mockGetQueueAttributes.mockReset()
    mockListQueues.mockReset()
    mockGetQueueNameFromUrl.mockReset()
    mockGetSqsMetricData.mockReset()
  })

  test('should return error if no queue names are provided', async () => {
    const result = await getSqsInfo({ queueNames: [] })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Error')
    expect(mockGetQueueDetails).not.toHaveBeenCalled()
  })

  test('should get queue details for a queue URL', async () => {
    const queueUrl = 'https://sqs.us-west-2.amazonaws.com/123456789012/my-queue'
    const queueName = 'my-queue'

    // Mock the resource info function
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: queueUrl,
      type: 'sqs',
      queueUrl,
      queueName,
      attributes: {
        QueueArn: 'arn:aws:sqs:us-west-2:123456789012:my-queue',
        VisibilityTimeout: '30',
        MaximumMessageSize: '262144',
        MessageRetentionPeriod: '345600',
        DelaySeconds: '0',
      },
      metrics: {
        NumberOfMessagesSent: {
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
    })

    const result = await getSqsInfo({
      queueNames: [queueUrl],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].queueName).toBe(queueName)
    expect(resultData[0].queueUrl).toBe(queueUrl)
    expect(resultData[0].attributes).toBeDefined()
    expect(resultData[0].metrics).toBeDefined()

    expect(mockGetSqsResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: queueUrl,
        startTime: '2023-01-01T00:00:00Z',
        endTime: '2023-01-01T03:00:00Z',
      }),
    )
  })

  test('should get queue details for a queue name', async () => {
    const queueName = 'my-queue'
    const queueUrl = 'https://sqs.us-west-2.amazonaws.com/123456789012/my-queue'

    // Mock the resource info function
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: queueName,
      type: 'sqs',
      queueUrl,
      queueName,
      attributes: {
        QueueArn: 'arn:aws:sqs:us-west-2:123456789012:my-queue',
        VisibilityTimeout: '30',
        MaximumMessageSize: '262144',
        MessageRetentionPeriod: '345600',
        DelaySeconds: '0',
      },
      metrics: {
        NumberOfMessagesSent: {
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
    })

    const result = await getSqsInfo({
      queueNames: [queueName],
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].queueName).toBe(queueName)
    expect(resultData[0].queueUrl).toBe(queueUrl)

    expect(mockGetSqsResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: queueName,
      }),
    )
  })

  test('should handle errors for individual queues', async () => {
    const queueName = 'my-queue'

    // Mock the resource info function to return an error
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: queueName,
      type: 'sqs',
      queueName,
      status: 'error',
      error: 'Queue not found',
    })

    const result = await getSqsInfo({
      queueNames: [queueName],
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].queueName).toBe(queueName)
    expect(resultData[0].status).toBe('error')
    expect(resultData[0].error).toBeDefined()
  })

  test('should handle errors when fetching metrics', async () => {
    const queueUrl = 'https://sqs.us-west-2.amazonaws.com/123456789012/my-queue'
    const queueName = 'my-queue'

    mockGetQueueNameFromUrl.mockReturnValue(queueName)
    mockGetQueueDetails.mockResolvedValue({
      queueUrl,
      queueName,
      attributes: {
        QueueArn: 'arn:aws:sqs:us-west-2:123456789012:my-queue',
      },
    })

    mockGetSqsMetricData.mockRejectedValue(new Error('Failed to fetch metrics'))

    // Mock the resource info function to simulate metrics error
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: queueUrl,
      type: 'sqs',
      queueUrl,
      queueName,
      attributes: {
        QueueArn: 'arn:aws:sqs:us-west-2:123456789012:my-queue',
      },
      metrics: { error: 'Failed to fetch metrics' },
    })

    const result = await getSqsInfo({
      queueNames: [queueUrl],
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData[0].metrics).toEqual({ error: 'Failed to fetch metrics' })
  })

  test('should use default time range and period when not specified', async () => {
    const queueUrl = 'https://sqs.us-west-2.amazonaws.com/123456789012/my-queue'
    const queueName = 'my-queue'

    // Mock the resource info function with default time range
    mockGetSqsResourceInfo.mockResolvedValue({
      resourceId: queueUrl,
      type: 'sqs',
      queueUrl,
      queueName,
      attributes: {
        QueueArn: 'arn:aws:sqs:us-west-2:123456789012:my-queue',
      },
      metrics: {
        NumberOfMessagesSent: {
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
    })

    await getSqsInfo({
      queueNames: [queueUrl],
    })

    // Verify that the resource info function was called with the queue URL
    expect(mockGetSqsResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: queueUrl,
      }),
    )
  })
})
