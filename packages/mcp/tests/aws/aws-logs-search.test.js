/**
 * Jest tests for AWS Logs Search Tool
 *
 * This test file directly tests the getLogsSearch function, mocking the CloudWatch Logs Insights
 * functionality to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Create mock functions
const mockExecuteCloudWatchLogsQuery = jest.fn()
const mockBuildLogsSearchQuery = jest.fn()

// Mock the CloudWatch Logs Insights module
await jest.unstable_mockModule(
  '../../src/lib/aws/cloudwatch-logs-insights.js',
  () => {
    return {
      executeCloudWatchLogsQuery: mockExecuteCloudWatchLogsQuery,
      buildLogsSearchQuery: mockBuildLogsSearchQuery,
    }
  },
)

// Import the function after mocking dependencies
const { getLogsSearch } = await import('../../src/tools/aws/aws-logs-search.js')

describe('AWS Logs Search Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Default mock implementations
    mockBuildLogsSearchQuery.mockImplementation(({ searchTerms, limit }) => {
      let query = 'fields @timestamp, @message | sort @timestamp asc'

      if (searchTerms) {
        query += ` | filter @message like "${searchTerms}"`
      }

      if (limit) {
        query += ` | limit ${limit}`
      }

      return query
    })
  })

  test('should validate input and return error for missing log groups', async () => {
    const result = await getLogsSearch({
      logGroupIdentifiers: [],
      searchTerms: 'abc123',
    })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(JSON.parse(result.content[0].text)).toHaveProperty('error')
    expect(JSON.parse(result.content[0].text).error).toContain(
      'Please provide at least one CloudWatch Log Group',
    )

    // Verify that the CloudWatch Logs query was not executed
    expect(mockExecuteCloudWatchLogsQuery).not.toHaveBeenCalled()
  })

  test('should build query and execute it successfully', async () => {
    // Mock successful query execution
    mockExecuteCloudWatchLogsQuery.mockResolvedValue({
      events: [
        {
          timestamp: '2023-01-01T12:00:00.000Z',
          message: 'Request abc123 started processing',
          logStream: 'stream1',
          logGroupName: '/aws/lambda/function1',
        },
        {
          timestamp: '2023-01-01T12:00:01.000Z',
          message: 'Request abc123 completed successfully',
          logStream: 'stream1',
          logGroupName: '/aws/lambda/function1',
        },
      ],
      errors: [],
      timeRange: {
        start: '2023-01-01T11:00:00.000Z',
        end: '2023-01-01T13:00:00.000Z',
      },
    })

    const expectedQuery =
      'fields @timestamp, @message | sort @timestamp asc | filter @message like "abc123" | limit 50'
    mockBuildLogsSearchQuery.mockReturnValue(expectedQuery)

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      searchTerms: 'abc123',
      limit: 50,
    })

    expect(result).toBeDefined()
    expect(result.isError).toBeFalsy()
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.content[0].type).toBe('text')

    // Check that we have the timeline data
    const timelineContent = result.content.find((item) => {
      try {
        const parsed = JSON.parse(item.text)
        return parsed.timeline && parsed.timeline.events
      } catch (e) {
        return false
      }
    })

    expect(timelineContent).toBeDefined()
    const parsedTimeline = JSON.parse(timelineContent.text)
    expect(parsedTimeline.timeline.events).toHaveLength(2)

    // Verify that the query was built and executed with correct parameters
    expect(mockBuildLogsSearchQuery).toHaveBeenCalledWith({
      searchTerms: 'abc123',
      limit: 50,
    })

    expect(mockExecuteCloudWatchLogsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      queryString: expectedQuery,
      startTime: undefined,
      endTime: undefined,
      limit: 50,
      region: undefined,
      profile: undefined,
    })
  })

  test('should handle query execution errors', async () => {
    // Mock query execution error
    const errorMessage = 'Access denied'
    mockExecuteCloudWatchLogsQuery.mockRejectedValue(new Error(errorMessage))

    mockBuildLogsSearchQuery.mockReturnValue(
      'fields @timestamp, @message | sort @timestamp asc',
    )

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      region: 'us-east-1',
      profile: 'default',
    })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const parsedContent = JSON.parse(result.content[0].text)
    expect(parsedContent).toHaveProperty('error')
    expect(parsedContent.error).toContain('Access denied')

    // Check that error details are included
    expect(result).toHaveProperty('errorDetails')
    expect(result.errorDetails).toContain('Access denied')

    // Verify that the query was built and executed with correct parameters
    expect(mockBuildLogsSearchQuery).toHaveBeenCalled()
    expect(mockExecuteCloudWatchLogsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      queryString: 'fields @timestamp, @message | sort @timestamp asc',
      startTime: undefined,
      endTime: undefined,
      limit: 100,
      region: 'us-east-1',
      profile: 'default',
    })
  })

  test('should handle search terms and time range parameters', async () => {
    // Mock successful query execution
    mockExecuteCloudWatchLogsQuery.mockResolvedValue({
      events: [
        {
          timestamp: '2023-01-01T12:00:00.000Z',
          message: 'Request abc123 error occurred',
          logStream: 'stream1',
          logGroupName: '/aws/lambda/function1',
        },
      ],
      errors: [],
      timeRange: {
        start: '2023-01-01T00:00:00.000Z',
        end: '2023-01-02T00:00:00.000Z',
      },
    })

    const expectedQuery =
      'fields @timestamp, @message | sort @timestamp asc | filter @message like "abc123 error" | limit 100'
    mockBuildLogsSearchQuery.mockReturnValue(expectedQuery)

    const startTime = '2023-01-01T00:00:00Z'
    const endTime = '2023-01-02T00:00:00Z'

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1', '/aws/lambda/function2'],
      searchTerms: 'abc123 error',
      startTime,
      endTime,
    })

    expect(result).toBeDefined()
    expect(result.isError).toBeFalsy()
    expect(result.content.length).toBeGreaterThan(0)

    // Verify that the query was built and executed with correct parameters
    expect(mockBuildLogsSearchQuery).toHaveBeenCalledWith({
      searchTerms: 'abc123 error',
      limit: 100,
    })

    expect(mockExecuteCloudWatchLogsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/function1', '/aws/lambda/function2'],
      queryString: expectedQuery,
      startTime,
      endTime,
      limit: 100,
      region: undefined,
      profile: undefined,
    })
  })

  test('should handle empty query results', async () => {
    // Mock empty query results
    mockExecuteCloudWatchLogsQuery.mockResolvedValue({
      events: [],
      errors: [],
      timeRange: {
        start: '2023-01-01T00:00:00.000Z',
        end: '2023-01-02T00:00:00.000Z',
      },
    })

    mockBuildLogsSearchQuery.mockReturnValue(
      'fields @timestamp, @message | sort @timestamp asc | filter @message like "nonexistent"',
    )

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      searchTerms: 'nonexistent',
    })

    expect(result).toBeDefined()
    expect(result.isError).toBeFalsy()
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.content[0].type).toBe('text')

    // Find the message content
    const messageContent = result.content.find((item) => {
      try {
        const parsed = JSON.parse(item.text)
        return (
          parsed.message && parsed.message.includes('No matching log events')
        )
      } catch (e) {
        return false
      }
    })

    expect(messageContent).toBeDefined()
    const parsedMessage = JSON.parse(messageContent.text)
    expect(parsedMessage.message).toContain('No matching log events')

    // Verify that the query was built and executed
    expect(mockBuildLogsSearchQuery).toHaveBeenCalled()
    expect(mockExecuteCloudWatchLogsQuery).toHaveBeenCalled()
  })
})
