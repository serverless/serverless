/**
 * Jest tests for AWS Lambda Info Tool
 *
 * These tests exercise getLambdaInfo directly. The only AWS clients reachable
 * from this code path are AwsLambdaClient (function details) and
 * AwsCloudWatchClient (metrics, log group validation and the Insights pattern
 * query used for the error-log summary); both engine modules are mocked with the
 * same specifiers the sources import, so no test in this file can perform a
 * network call. The other resource-info modules re-exported by
 * src/lib/aws/resource-info.js only construct their clients inside functions
 * that the Lambda tool never calls.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

// Create mock functions
const mockGetLambdaFunctionDetails = jest.fn()
const mockGetMetricData = jest.fn()
const mockDescribeLogGroups = jest.fn()
const mockExecutePatternAnalyticsQuery = jest.fn()

// Mock the AWS Lambda client
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/lambda.js',
  () => {
    return {
      AwsLambdaClient: jest.fn(() => ({
        getLambdaFunctionDetails: mockGetLambdaFunctionDetails,
      })),
    }
  },
)

// Mock the AWS CloudWatch client
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => ({
        getMetricData: mockGetMetricData,
        describeLogGroups: mockDescribeLogGroups,
        executePatternAnalyticsQuery: mockExecutePatternAnalyticsQuery,
      })),
    }
  },
)

// Import the function after mocking dependencies
const { getLambdaInfo } = await import('../../src/tools/aws/lambda-info.js')

const START_TIME = '2023-01-01T00:00:00Z'
const END_TIME = '2023-01-01T03:00:00Z'
const START_TIME_MS = Date.parse(START_TIME)
const END_TIME_MS = Date.parse(END_TIME)
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const successfulFunctionDetails = (functionName = 'my-function') => ({
  status: 'success',
  function: {
    Configuration: {
      FunctionName: functionName,
      Runtime: 'nodejs18.x',
    },
  },
})

describe('AWS Lambda Info Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Reset mock implementations
    mockGetMetricData.mockReset()
    mockDescribeLogGroups.mockReset()
    mockExecutePatternAnalyticsQuery.mockReset()

    // Every log group the tool derives exists and is small enough (1 KiB) that
    // the extended-timeframe cost confirmation is skipped.
    mockDescribeLogGroups.mockImplementation(
      async ({ logGroupNamePrefix }) => ({
        logGroups: [{ logGroupName: logGroupNamePrefix, storedBytes: 1024 }],
      }),
    )
    mockExecutePatternAnalyticsQuery.mockResolvedValue({ events: [] })
  })

  test('should validate input and return error for empty function names', async () => {
    const result = await getLambdaInfo({ functionNames: [] })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(
      'Please provide at least one Lambda function name',
    )
    expect(mockGetLambdaFunctionDetails).not.toHaveBeenCalled()
  })

  test('should validate input and return error for non-array function names', async () => {
    const result = await getLambdaInfo({ functionNames: 'my-function' })

    expect(result).toBeDefined()
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain(
      'Please provide at least one Lambda function name',
    )
    expect(mockGetLambdaFunctionDetails).not.toHaveBeenCalled()
  })

  test('should get Lambda function information successfully', async () => {
    const mockFunctionDetails = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
          Role: 'arn:aws:iam::123456789012:role/lambda-role',
          Handler: 'index.handler',
          CodeSize: 1024,
          Description: 'My test function',
          Timeout: 30,
          MemorySize: 128,
          LastModified: '2023-01-01T00:00:00.000+0000',
        },
        Code: {
          RepositoryType: 'S3',
        },
      },
      policy: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'apigateway.amazonaws.com',
            },
            Action: 'lambda:InvokeFunction',
            Resource:
              'arn:aws:lambda:us-east-1:123456789012:function:my-function',
          },
        ],
      },
      eventSourceMappings: [
        {
          UUID: '12345678-1234-1234-1234-123456789012',
          EventSourceArn: 'arn:aws:sqs:us-east-1:123456789012:my-queue',
          FunctionArn:
            'arn:aws:lambda:us-east-1:123456789012:function:my-function',
          State: 'Enabled',
          BatchSize: 10,
        },
      ],
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(mockFunctionDetails)

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].type).toBe('lambda')
    expect(parsedJson[0].status).toBe('success')
    expect(parsedJson[0].policy).toEqual(mockFunctionDetails.policy)
    expect(parsedJson[0].eventSourceMappings).toEqual(
      mockFunctionDetails.eventSourceMappings,
    )
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('my-function')
  })

  test('should handle multiple Lambda functions', async () => {
    const mockFunction1 = successfulFunctionDetails('function-1')
    const mockFunction2 = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'function-2',
          Runtime: 'python3.9',
        },
      },
    }

    mockGetLambdaFunctionDetails
      .mockResolvedValueOnce(mockFunction1)
      .mockResolvedValueOnce(mockFunction2)

    const result = await getLambdaInfo({
      functionNames: ['function-1', 'function-2'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(2)
    expect(parsedJson[0].functionName).toBe('function-1')
    expect(parsedJson[1].functionName).toBe('function-2')
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledTimes(2)
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('function-1')
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('function-2')
  })

  test('should handle errors for individual Lambda functions', async () => {
    mockGetLambdaFunctionDetails.mockRejectedValue(
      new Error('Function does not exist'),
    )

    const result = await getLambdaInfo({
      functionNames: ['non-existent-function'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].functionName).toBe('non-existent-function')
    expect(parsedJson[0].status).toBe('error')
    expect(parsedJson[0].error).toBe('Function does not exist')
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith(
      'non-existent-function',
    )
  })

  test('should fetch CloudWatch metrics when time range is provided', async () => {
    const mockMetrics = {
      'my-function': {
        Invocations: {
          values: [100, 200, 300],
          timestamps: [
            '2023-01-01T00:00:00Z',
            '2023-01-01T01:00:00Z',
            '2023-01-01T02:00:00Z',
          ],
        },
        Errors: {
          values: [1, 2, 3],
          timestamps: [
            '2023-01-01T00:00:00Z',
            '2023-01-01T01:00:00Z',
            '2023-01-01T02:00:00Z',
          ],
        },
        Duration: {
          Average: {
            values: [100, 110, 120],
            timestamps: [
              '2023-01-01T00:00:00Z',
              '2023-01-01T01:00:00Z',
              '2023-01-01T02:00:00Z',
            ],
          },
          Maximum: {
            values: [200, 220, 240],
            timestamps: [
              '2023-01-01T00:00:00Z',
              '2023-01-01T01:00:00Z',
              '2023-01-01T02:00:00Z',
            ],
          },
        },
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(successfulFunctionDetails())
    mockGetMetricData.mockResolvedValue(mockMetrics)

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: START_TIME,
      endTime: END_TIME,
      period: 3600,
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].metrics).toEqual(mockMetrics['my-function'])

    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('my-function')

    // The ISO strings are parsed to epoch milliseconds and the requested period
    // is passed through unchanged.
    expect(mockGetMetricData).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: START_TIME_MS,
      endTime: END_TIME_MS,
      period: 3600,
    })
  })

  test('should handle errors when fetching CloudWatch metrics', async () => {
    mockGetLambdaFunctionDetails.mockResolvedValue(successfulFunctionDetails())
    mockGetMetricData.mockRejectedValue(new Error('Metrics not available'))

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].metrics).toEqual({ error: 'Metrics not available' })

    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('my-function')
    expect(mockGetMetricData).toHaveBeenCalled()
  })

  test('should handle function names with aliases when fetching metrics', async () => {
    const mockMetrics = {
      'my-function': {
        Invocations: {
          values: [100],
          timestamps: ['2023-01-01T00:00:00Z'],
        },
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(
      successfulFunctionDetails('my-function:prod'),
    )
    mockGetMetricData.mockResolvedValue(mockMetrics)

    const result = await getLambdaInfo({
      functionNames: ['my-function:prod'],
      startTime: START_TIME,
      endTime: '2023-01-01T01:00:00Z',
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function:prod')
    expect(parsedJson[0].metrics).toEqual(mockMetrics['my-function'])

    // Verify that the function name was properly extracted for metrics
    expect(mockGetMetricData).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: START_TIME_MS,
      endTime: Date.parse('2023-01-01T01:00:00Z'),
      period: 3600,
    })

    // The alias is stripped for the log group name too
    expect(
      mockExecutePatternAnalyticsQuery.mock.calls[0][0].logGroupIdentifiers,
    ).toEqual(['/aws/lambda/my-function'])
  })

  test('should summarise error log patterns for the specified time range', async () => {
    mockGetLambdaFunctionDetails.mockResolvedValue(successfulFunctionDetails())
    mockGetMetricData.mockResolvedValue({})
    mockExecutePatternAnalyticsQuery.mockResolvedValue({
      events: [
        {
          pattern: 'Error: Connection timed out after <*>ms',
          count: 2,
          examples: ['Error: Connection timed out after 5000ms'],
          patternId: 'aa11bb22cc33dd44ee55ff6677889900',
          severityLabel: 'ERROR',
        },
        {
          pattern: "TypeError: Cannot read property 'id' of undefined",
          count: 1,
          examples: ["TypeError: Cannot read property 'id' of undefined"],
          patternId: '00998877665544ee33dd22cc11bbaa00',
          severityLabel: 'ERROR',
        },
      ],
    })

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function')

    // Error logs are produced by the CloudWatch Logs Insights pattern analysis
    // (src/lib/aws/errors-info-patterns.js), not by a per-function log fetch.
    const errorLogs = parsedJson[0].errorLogs
    expect(errorLogs.patterns).toHaveLength(2)
    expect(errorLogs.patterns[0].count).toBe(2)
    expect(errorLogs.patterns[0].pattern).toBe(
      'Error: Connection timed out after <*>ms',
    )
    expect(errorLogs.summary.totalErrors).toBe(3)
    expect(errorLogs.summary.uniqueErrorGroups).toBe(2)
    expect(errorLogs.summary.logGroups).toEqual(['/aws/lambda/my-function'])
    expect(errorLogs.timeframeLimited).toBe(false)
    expect(errorLogs.agentNote).toBeUndefined()

    // The default log group of the function is validated and then queried over
    // the requested window. maxResults (100) is over-fetched 3x for grouping.
    expect(mockDescribeLogGroups).toHaveBeenCalledWith({
      logGroupNamePrefix: '/aws/lambda/my-function',
      limit: 1,
    })
    expect(mockExecutePatternAnalyticsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/my-function'],
      startTime: new Date(START_TIME_MS),
      endTime: new Date(END_TIME_MS),
      limit: 300,
    })
  })

  test('should use the log group from the function LoggingConfig when configured', async () => {
    mockGetLambdaFunctionDetails.mockResolvedValue({
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
          LoggingConfig: {
            LogGroup: '/custom/log/group',
          },
        },
      },
    })
    mockGetMetricData.mockResolvedValue({})

    await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(mockDescribeLogGroups).toHaveBeenCalledWith({
      logGroupNamePrefix: '/custom/log/group',
      limit: 1,
    })
    expect(
      mockExecutePatternAnalyticsQuery.mock.calls[0][0].logGroupIdentifiers,
    ).toEqual(['/custom/log/group'])
  })

  test('should limit error log analysis to the last 7 days of a longer window', async () => {
    const longStartTime = '2023-01-01T00:00:00Z'
    const longEndTime = '2023-01-31T00:00:00Z'

    mockGetLambdaFunctionDetails.mockResolvedValue(successfulFunctionDetails())
    mockGetMetricData.mockResolvedValue({})

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: longStartTime,
      endTime: longEndTime,
    })

    const errorLogs = JSON.parse(result.content[0].text)[0].errorLogs
    expect(errorLogs.timeframeLimited).toBe(true)
    expect(errorLogs.agentNote).toContain(
      'limited to the last 7 days (ending at 2023-01-31T00:00:00.000Z)',
    )

    // Metrics still cover the full window, only the pattern query is shortened
    expect(mockGetMetricData.mock.calls[0][0].startTime).toBe(
      Date.parse(longStartTime),
    )
    expect(mockExecutePatternAnalyticsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/my-function'],
      startTime: new Date(Date.parse(longEndTime) - SEVEN_DAYS_MS),
      endTime: new Date(Date.parse(longEndTime)),
      limit: 300,
    })
  })

  test('should handle errors when fetching error logs', async () => {
    mockGetLambdaFunctionDetails.mockResolvedValue(successfulFunctionDetails())
    mockGetMetricData.mockResolvedValue({})
    mockExecutePatternAnalyticsQuery.mockRejectedValue(
      new Error('Log group not found'),
    )

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: START_TIME,
      endTime: END_TIME,
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function')

    // getErrorsInfoWithPatterns handles the failure itself and reports it in the
    // summary, so the Lambda tool returns an empty pattern list. The underlying
    // error message is not propagated to errorLogs.
    const errorLogs = parsedJson[0].errorLogs
    expect(errorLogs.patterns).toEqual([])
    expect(errorLogs.summary.totalErrors).toBe(0)
    expect(errorLogs.summary.nextSteps).toBe(
      'Error occurred. No pattern analysis available.',
    )
  })

  test('should use default time range when not specified', async () => {
    const mockMetrics = {
      'my-function': {
        Invocations: {
          values: [100],
          timestamps: ['2023-01-01T00:00:00Z'],
        },
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(successfulFunctionDetails())
    mockGetMetricData.mockResolvedValue(mockMetrics)

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].metrics).toEqual(mockMetrics['my-function'])
    expect(parsedJson[0].errorLogs).toBeDefined()

    // With no timestamps, getLambdaResourceInfo falls back to "the last 24
    // hours". The period is NOT the documented 3600 default: with both bounds
    // undefined, validateTimeParameters
    // (src/lib/parameter-validator.js:85-86) leaves them undefined and
    // calculateOptimalPeriod falls through to its widest bucket (1209600 = 2
    // weeks). Unreachable through the aws-lambda-info tool, whose schema always
    // supplies startTime, endTime and period.
    expect(mockGetMetricData).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: expect.any(Number),
      endTime: expect.any(Number),
      period: 1209600,
    })

    // Verify the time range is approximately 24 hours
    const startTime = mockGetMetricData.mock.calls[0][0].startTime
    const endTime = mockGetMetricData.mock.calls[0][0].endTime
    const timeDiff = endTime - startTime
    const oneDayInMs = 24 * 60 * 60 * 1000

    // Allow for a small margin of error in the test due to execution time
    expect(timeDiff).toBeGreaterThanOrEqual(oneDayInMs - 1000)
    expect(timeDiff).toBeLessThanOrEqual(oneDayInMs + 1000)

    // The error log analysis uses the same default window
    expect(mockExecutePatternAnalyticsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: ['/aws/lambda/my-function'],
      startTime: expect.any(Date),
      endTime: expect.any(Date),
      limit: 300,
    })
  })
})
