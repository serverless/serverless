/**
 * Jest tests for AWS Logs Tail Tool
 *
 * This test file directly tests the getLogsTail function, mocking the CloudWatch Logs Filter
 * functionality to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, it, beforeEach } from '@jest/globals'

// Create mock function
const mockFilterLogEvents = jest.fn()

// Mock the CloudWatch Logs Filter module
await jest.unstable_mockModule(
  '../../src/lib/aws/cloudwatch-logs-filter.js',
  () => ({
    filterLogEvents: mockFilterLogEvents,
  }),
)

// Import the function to test (must be after the mock)
const { getLogsTail } = await import('../../src/tools/aws/aws-logs-tail.js')

describe('aws-logs-tail tool', () => {
  beforeEach(() => {
    mockFilterLogEvents.mockClear()
  })

  it('should return an error when no log group identifiers are provided', async () => {
    const result = await getLogsTail({
      logGroupIdentifiers: [],
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      'Please provide at least one CloudWatch Log Group name',
    )
    expect(mockFilterLogEvents).not.toHaveBeenCalled()
  })

  it('should return formatted logs when successful', async () => {
    // Mock successful response from filterLogEvents
    mockFilterLogEvents.mockResolvedValue({
      events: [
        {
          timestamp: 1617211200000, // 2021-04-01T00:00:00.000Z
          message: 'Test log message 1',
          logStreamName: 'stream1',
          logGroupName: '/aws/lambda/test-function',
          eventId: '12345',
        },
        {
          timestamp: 1617211260000, // 2021-04-01T00:01:00.000Z
          message: 'Test log message 2',
          logStreamName: 'stream1',
          logGroupName: '/aws/lambda/test-function',
          eventId: '12346',
        },
      ],
      errors: [],
      timeRange: {
        startTime: 1617210300000,
        endTime: 1617211200000,
      },
      metadata: {
        logGroupsProcessed: 1,
        logGroupsWithErrors: 0,
        totalEvents: 2,
      },
    })

    const result = await getLogsTail({
      logGroupIdentifiers: ['/aws/lambda/test-function'],
      limit: 100,
    })

    expect(result.isError).toBeUndefined()
    expect(mockFilterLogEvents).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/test-function'],
      limit: 100,
      filterPattern: undefined,
      startTime: undefined,
      endTime: undefined,
      region: undefined,
      profile: undefined,
    })

    // Check the content structure
    expect(result.content.length).toBe(1) // Single JSON response

    // Parse the JSON response
    const responseData = JSON.parse(result.content[0].text)

    // Check the response structure
    expect(responseData.title).toBe('Recent Logs (Tail)')
    expect(responseData.timeRange).toBeDefined()
    expect(responseData.metadata).toBeDefined()
    expect(responseData.logGroups).toBeDefined()

    // Check log group data
    expect(responseData.logGroups.length).toBe(1)
    expect(responseData.logGroups[0].name).toBe('/aws/lambda/test-function')

    // Check log stream data
    expect(responseData.logGroups[0].logStreams.length).toBeGreaterThan(0)

    // Check that events are formatted correctly
    const events = responseData.logGroups[0].logStreams[0].events
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].timestamp).toBeDefined()
    expect(events[0].message).toBeDefined()
    expect(events[0].message).toContain('Test log message')
  })

  it('should handle errors from the AWS SDK', async () => {
    // Mock error response
    const mockError = new Error('Access denied')
    mockFilterLogEvents.mockRejectedValue(mockError)

    const result = await getLogsTail({
      logGroupIdentifiers: ['/aws/lambda/test-function'],
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to retrieve logs')
    expect(result.content[0].text).toContain('Access denied')
  })

  it('should handle empty results', async () => {
    // Mock empty response
    mockFilterLogEvents.mockResolvedValue({
      events: [],
      errors: [],
      timeRange: {
        startTime: 1617210300000,
        endTime: 1617211200000,
      },
      metadata: {
        logGroupsProcessed: 1,
        logGroupsWithErrors: 0,
        totalEvents: 0,
      },
    })

    const result = await getLogsTail({
      logGroupIdentifiers: ['/aws/lambda/test-function'],
    })

    expect(result.isError).toBeUndefined()

    // Parse the JSON response
    const responseData = JSON.parse(result.content[0].text)

    // Check that we have the right structure with empty log groups
    expect(responseData.logGroups).toBeDefined()
    expect(responseData.logGroups.length).toBe(0)
    expect(responseData.metadata.totalEvents).toBe(0)
  })

  it('should handle partial errors', async () => {
    // Mock response with some errors
    mockFilterLogEvents.mockResolvedValue({
      events: [
        {
          timestamp: 1617211200000,
          message: 'Test log message',
          logStreamName: 'stream1',
          logGroupName: '/aws/lambda/working-function',
          eventId: '12345',
        },
      ],
      errors: [
        {
          logGroupName: '/aws/lambda/error-function',
          error: 'Resource not found',
        },
      ],
      timeRange: {
        startTime: 1617210300000,
        endTime: 1617211200000,
      },
      metadata: {
        logGroupsProcessed: 2,
        logGroupsWithErrors: 1,
        totalEvents: 1,
      },
    })

    const result = await getLogsTail({
      logGroupIdentifiers: [
        '/aws/lambda/working-function',
        '/aws/lambda/error-function',
      ],
    })

    expect(result.isError).toBeUndefined()

    // Parse the JSON response
    const responseData = JSON.parse(result.content[0].text)

    // Check that errors are included in the response
    expect(responseData.errors).toBeDefined()
    expect(responseData.errors.length).toBe(1)
    expect(responseData.errors[0].error).toBe('Resource not found')

    // Check that successful logs are still included
    expect(responseData.logGroups.length).toBe(1)
    expect(responseData.logGroups[0].name).toBe('/aws/lambda/working-function')
  })

  it('should pass filter pattern to the AWS SDK', async () => {
    // Mock successful response
    mockFilterLogEvents.mockResolvedValue({
      events: [],
      errors: [],
      timeRange: {
        startTime: 1617210300000,
        endTime: 1617211200000,
      },
      metadata: {
        logGroupsProcessed: 1,
        logGroupsWithErrors: 0,
        totalEvents: 0,
      },
    })

    await getLogsTail({
      logGroupIdentifiers: ['/aws/lambda/test-function'],
      filterPattern: 'ERROR',
    })

    expect(mockFilterLogEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        filterPattern: 'ERROR',
      }),
    )
  })
})
