/**
 * Jest tests for AWS Logs Search Tool
 *
 * These tests exercise getLogsSearch directly. Every module that
 * src/tools/aws/aws-logs-search.js imports and that can reach AWS is mocked, so
 * no test in this file can perform a network call:
 *  - src/lib/aws/cloudwatch-logs-insights.js (executeCloudWatchLogsQuery builds
 *    an AwsCloudWatchClient)
 *  - src/lib/confirmation-handler.js (validateLogGroups calls
 *    cloudWatchClient.describeLogGroups)
 * src/lib/aws-credentials-error-handler.js is left unmocked on purpose: it is a
 * pure message formatter with no AWS access.
 */

import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Create mock functions
const mockExecuteCloudWatchLogsQuery = jest.fn()
const mockBuildLogsSearchQuery = jest.fn()

// Mirrors the real parseTimestamp contract in
// src/lib/aws/cloudwatch-logs-insights.js: numbers pass through, ISO strings and
// all-digit strings become epoch milliseconds, anything else throws.
const mockParseTimestamp = jest.fn((timestamp) => {
  if (typeof timestamp === 'number') {
    return timestamp
  }
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
    if (/^\d+$/.test(timestamp)) {
      return Number.parseInt(timestamp, 10)
    }
  }
  throw new Error(`Failed to parse timestamp: ${timestamp}`)
})

const mockHandleHistoricalConfirmation = jest.fn()
const mockHandleExtendedTimeframeConfirmation = jest.fn()
const mockValidateLogGroups = jest.fn()

// Mock the CloudWatch Logs Insights module
await jest.unstable_mockModule(
  '../../src/lib/aws/cloudwatch-logs-insights.js',
  () => {
    return {
      executeCloudWatchLogsQuery: mockExecuteCloudWatchLogsQuery,
      buildLogsSearchQuery: mockBuildLogsSearchQuery,
      parseTimestamp: mockParseTimestamp,
    }
  },
)

// Mock the confirmation handler module
await jest.unstable_mockModule('../../src/lib/confirmation-handler.js', () => {
  return {
    handleHistoricalConfirmation: mockHandleHistoricalConfirmation,
    handleExtendedTimeframeConfirmation:
      mockHandleExtendedTimeframeConfirmation,
    validateLogGroups: mockValidateLogGroups,
  }
})

// Import the function after mocking dependencies
const { getLogsSearch } = await import('../../src/tools/aws/aws-logs-search.js')

// The aws-logs-search tool schema always supplies startTime/endTime (they
// default to "3 hours ago"/"now" in src/tools-definition.js), so the tests pass
// them explicitly, exactly as the registered tool does.
const START_TIME = '2023-01-01T00:00:00.000Z'
const END_TIME = '2023-01-01T03:00:00.000Z'
const START_TIME_MS = Date.parse(START_TIME)
const END_TIME_MS = Date.parse(END_TIME)

const LOG_GROUPS_INFO = {
  logGroups: ['/aws/lambda/function1'],
  logGroupsWithSize: [{ name: '/aws/lambda/function1', storedBytes: 1024 }],
  totalSizeBytes: 1024,
  totalSizeGB: 1024 / 1024 ** 3,
}

describe('AWS Logs Search Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Default mock implementations: no confirmation required, log groups valid
    mockHandleHistoricalConfirmation.mockReturnValue(null)
    mockHandleExtendedTimeframeConfirmation.mockReturnValue(null)
    mockValidateLogGroups.mockResolvedValue(LOG_GROUPS_INFO)

    mockBuildLogsSearchQuery.mockImplementation(({ searchTerms, limit }) => {
      let query = 'fields @timestamp, @message | sort @timestamp asc'

      if (searchTerms) {
        query += ` | filter @message like "${searchTerms.join('|')}"`
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
      searchTerms: ['abc123'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(JSON.parse(result.content[0].text)).toHaveProperty('error')
    expect(JSON.parse(result.content[0].text).error).toContain(
      'Please provide at least one CloudWatch Log Group',
    )

    // Verify that neither log group validation nor the query were executed
    expect(mockValidateLogGroups).not.toHaveBeenCalled()
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
        start: START_TIME,
        end: END_TIME,
      },
    })

    const expectedQuery =
      'fields @timestamp, @message | sort @timestamp asc | filter @message like "abc123" | limit 50'
    mockBuildLogsSearchQuery.mockReturnValue(expectedQuery)

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      searchTerms: ['abc123'],
      startTime: START_TIME,
      endTime: END_TIME,
      limit: 50,
    })

    expect(result).toBeDefined()
    expect(result.isError).toBeFalsy()
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.content[0].type).toBe('text')

    // The first content block is the summary of the search
    const summary = JSON.parse(result.content[0].text)
    expect(summary.title).toBe('Log Search Results')
    expect(summary.logGroupsCount).toBe(1)
    expect(summary.totalEvents).toBe(2)
    expect(summary.errorsOnly).toBe('Showing all logs')
    expect(summary.timeRange).toEqual({ start: START_TIME, end: END_TIME })

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

    // The tool also returns the raw results alongside the content blocks
    expect(result.logGroups).toEqual(['/aws/lambda/function1'])
    expect(result.timeRange).toEqual({ start: START_TIME, end: END_TIME })
    expect(result.events).toHaveLength(2)
    expect(result.errors).toBeUndefined()

    // Log groups are validated (and sized) before the query runs
    expect(mockValidateLogGroups).toHaveBeenCalledWith(
      ['/aws/lambda/function1'],
      { region: undefined, profile: undefined },
    )

    // Verify that the query was built and executed with correct parameters
    expect(mockBuildLogsSearchQuery).toHaveBeenCalledWith({
      searchTerms: ['abc123'],
      limit: 50,
      errorsOnly: false,
    })

    expect(mockExecuteCloudWatchLogsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      queryString: expectedQuery,
      startTime: START_TIME_MS,
      endTime: END_TIME_MS,
      limit: 50,
      region: undefined,
      profile: undefined,
    })
  })

  test('should forward errorsOnly to the query builder', async () => {
    mockExecuteCloudWatchLogsQuery.mockResolvedValue({
      events: [],
      errors: [],
      timeRange: { start: START_TIME, end: END_TIME },
    })
    mockBuildLogsSearchQuery.mockReturnValue('errors-only query')

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      startTime: START_TIME,
      endTime: END_TIME,
      errorsOnly: true,
    })

    expect(mockBuildLogsSearchQuery).toHaveBeenCalledWith({
      searchTerms: undefined,
      limit: 100,
      errorsOnly: true,
    })
    expect(JSON.parse(result.content[0].text).errorsOnly).toBe(
      'Showing only error-related logs',
    )
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
      startTime: START_TIME,
      endTime: END_TIME,
      region: 'us-east-1',
      profile: 'default',
    })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const parsedContent = JSON.parse(result.content[0].text)
    expect(parsedContent).toHaveProperty('error')
    expect(parsedContent.error).toBe('Error searching logs: Access denied')

    // The failure response carries only the content blocks and the isError flag
    expect(Object.keys(result).sort()).toEqual(['content', 'isError'])

    // Verify that the query was built and executed with correct parameters
    expect(mockBuildLogsSearchQuery).toHaveBeenCalled()
    expect(mockExecuteCloudWatchLogsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      queryString: 'fields @timestamp, @message | sort @timestamp asc',
      startTime: START_TIME_MS,
      endTime: END_TIME_MS,
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
      searchTerms: ['abc123', 'error'],
      startTime,
      endTime,
    })

    expect(result).toBeDefined()
    expect(result.isError).toBeFalsy()
    expect(result.content.length).toBeGreaterThan(0)
    expect(JSON.parse(result.content[0].text).logGroupsCount).toBe(2)

    // Verify that the query was built and executed with correct parameters
    expect(mockBuildLogsSearchQuery).toHaveBeenCalledWith({
      searchTerms: ['abc123', 'error'],
      limit: 100,
      errorsOnly: false,
    })

    // The tool parses the ISO strings into epoch milliseconds before querying
    expect(mockExecuteCloudWatchLogsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/function1', '/aws/lambda/function2'],
      queryString: expectedQuery,
      startTime: Date.parse(startTime),
      endTime: Date.parse(endTime),
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
        start: START_TIME,
        end: END_TIME,
      },
    })

    mockBuildLogsSearchQuery.mockReturnValue(
      'fields @timestamp, @message | sort @timestamp asc | filter @message like "nonexistent"',
    )

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      searchTerms: ['nonexistent'],
      startTime: START_TIME,
      endTime: END_TIME,
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

  test('should surface query errors returned by the Insights query', async () => {
    mockExecuteCloudWatchLogsQuery.mockResolvedValue({
      events: [],
      errors: ['Log group /aws/lambda/function1 does not exist'],
      timeRange: { start: START_TIME, end: END_TIME },
    })
    mockBuildLogsSearchQuery.mockReturnValue('query')

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result.isError).toBeFalsy()
    expect(result.errors).toEqual([
      'Log group /aws/lambda/function1 does not exist',
    ])
    expect(JSON.parse(result.content[1].text)).toEqual({
      errors: ['Log group /aws/lambda/function1 does not exist'],
    })
  })

  test('should return the historical confirmation prompt without querying', async () => {
    const confirmationResponse = {
      content: [{ type: 'text', text: 'confirm historical query' }],
    }
    mockHandleHistoricalConfirmation.mockReturnValue(confirmationResponse)

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      startTime: START_TIME,
      endTime: END_TIME,
      confirmationToken: 'token-123',
    })

    expect(result).toBe(confirmationResponse)
    expect(mockHandleHistoricalConfirmation).toHaveBeenCalledWith(
      START_TIME_MS,
      END_TIME_MS,
      'token-123',
    )

    // Nothing is validated or queried until the confirmation is satisfied
    expect(mockValidateLogGroups).not.toHaveBeenCalled()
    expect(mockExecuteCloudWatchLogsQuery).not.toHaveBeenCalled()
  })

  test('should return the extended timeframe prompt with log group sizes', async () => {
    const confirmationResponse = {
      content: [{ type: 'text', text: 'confirm extended timeframe' }],
    }
    mockHandleExtendedTimeframeConfirmation.mockReturnValue(
      confirmationResponse,
    )

    const result = await getLogsSearch({
      logGroupIdentifiers: ['/aws/lambda/function1'],
      startTime: START_TIME,
      endTime: END_TIME,
      region: 'us-east-1',
      profile: 'dev',
    })

    expect(result).toBe(confirmationResponse)
    expect(mockValidateLogGroups).toHaveBeenCalledWith(
      ['/aws/lambda/function1'],
      { region: 'us-east-1', profile: 'dev' },
    )
    expect(mockHandleExtendedTimeframeConfirmation).toHaveBeenCalledWith(
      START_TIME_MS,
      END_TIME_MS,
      undefined,
      LOG_GROUPS_INFO,
    )
    expect(mockExecuteCloudWatchLogsQuery).not.toHaveBeenCalled()
  })
})
