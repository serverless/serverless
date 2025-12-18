/**
 * Jest tests for AWS Lambda Info Tool
 *
 * This test file directly tests the getLambdaInfo function, mocking the AwsLambdaClient
 * to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Create mock functions
const mockGetLambdaFunctionDetails = jest.fn()
const mockGetMetricData = jest.fn()
const mockGetErrorLogs = jest.fn()

// Mock the AWS Lambda client
await jest.unstable_mockModule('../../../engine/src/lib/aws/lambda.js', () => {
  return {
    AwsLambdaClient: jest.fn(() => ({
      getLambdaFunctionDetails: mockGetLambdaFunctionDetails,
    })),
  }
})

// Mock the AWS CloudWatch client
await jest.unstable_mockModule(
  '../../../engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => ({
        getMetricData: mockGetMetricData,
        getErrorLogs: mockGetErrorLogs,
      })),
    }
  },
)

// Import the function after mocking dependencies
const { getLambdaInfo } = await import('../../src/tools/aws/lambda-info.js')
const { AwsLambdaClient } = await import(
  '../../../engine/src/lib/aws/lambda.js'
)
const { AwsCloudWatchClient } = await import(
  '../../../engine/src/lib/aws/cloudwatch.js'
)

describe('AWS Lambda Info Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Reset mock implementations
    mockGetMetricData.mockReset()
    mockGetErrorLogs.mockReset()
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
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].status).toBe('success')
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('my-function')
  })

  test('should handle multiple Lambda functions', async () => {
    const mockFunction1 = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'function-1',
          Runtime: 'nodejs18.x',
        },
      },
    }

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
    const mockFunctionDetails = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
        },
      },
    }

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

    mockGetLambdaFunctionDetails.mockResolvedValue(mockFunctionDetails)
    mockGetMetricData.mockResolvedValue(mockMetrics)

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
      period: 3600,
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].metrics).toBeDefined()
    expect(parsedJson[0].metrics.Invocations).toBeDefined()
    expect(parsedJson[0].metrics.Errors).toBeDefined()
    expect(parsedJson[0].metrics.Duration).toBeDefined()
    expect(parsedJson[0].metrics.Duration.Average).toBeDefined()
    expect(parsedJson[0].metrics.Duration.Maximum).toBeDefined()

    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('my-function')
    expect(mockGetMetricData).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: expect.any(Number),
      endTime: expect.any(Number),
      period: 3600,
    })
  })

  test('should handle errors when fetching CloudWatch metrics', async () => {
    const mockFunctionDetails = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
        },
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(mockFunctionDetails)
    mockGetMetricData.mockRejectedValue(new Error('Metrics not available'))

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    expect(result).toBeDefined()
    expect(result.content).toHaveLength(1)

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].metrics).toBeDefined()
    expect(parsedJson[0].metrics.error).toBe('Metrics not available')

    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith('my-function')
    expect(mockGetMetricData).toHaveBeenCalled()
  })

  test('should handle function names with aliases when fetching metrics', async () => {
    const mockFunctionDetails = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function:prod',
          Runtime: 'nodejs18.x',
        },
      },
    }

    const mockMetrics = {
      'my-function': {
        Invocations: {
          values: [100],
          timestamps: ['2023-01-01T00:00:00Z'],
        },
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(mockFunctionDetails)
    mockGetMetricData.mockResolvedValue(mockMetrics)

    const result = await getLambdaInfo({
      functionNames: ['my-function:prod'],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T01:00:00Z',
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function:prod')
    expect(parsedJson[0].metrics).toBeDefined()

    // Verify that the function name was properly extracted for metrics
    expect(mockGetMetricData).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: expect.any(Number),
      endTime: expect.any(Number),
      period: 3600,
    })
  })

  test('should fetch error logs with specified time range', async () => {
    const mockFunctionDetails = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
        },
      },
    }

    const mockErrorLogs = {
      'my-function': {
        totalErrors: 3,
        errorGroups: [
          {
            pattern: 'Error: Connection timed out',
            count: 2,
            sample: 'Error: Connection timed out after 5000ms',
            timestamps: ['2023-01-01T02:00:00Z', '2023-01-01T01:30:00Z'],
          },
          {
            pattern: 'TypeError: Cannot read property of undefined',
            count: 1,
            sample: "TypeError: Cannot read property 'id' of undefined",
            timestamps: ['2023-01-01T01:00:00Z'],
          },
        ],
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(mockFunctionDetails)
    mockGetErrorLogs.mockResolvedValue(mockErrorLogs)

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].errorLogs).toBeDefined()
    expect(parsedJson[0].errorLogs.totalErrors).toBe(3)
    expect(parsedJson[0].errorLogs.errorGroups).toHaveLength(2)
    expect(parsedJson[0].errorLogs.errorGroups[0].count).toBe(2)

    // Verify that the error logs were fetched with the correct parameters
    expect(mockGetErrorLogs).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: expect.any(Number),
      endTime: expect.any(Number),
      limit: 100,
    })
  })

  test('should handle errors when fetching error logs', async () => {
    const mockFunctionDetails = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
        },
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(mockFunctionDetails)
    mockGetErrorLogs.mockRejectedValue(new Error('Log group not found'))

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].errorLogs).toBeDefined()
    expect(parsedJson[0].errorLogs.error).toBe('Log group not found')

    expect(mockGetErrorLogs).toHaveBeenCalled()
  })

  test('should use default time range when not specified', async () => {
    const mockFunctionDetails = {
      status: 'success',
      function: {
        Configuration: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
        },
      },
    }

    const mockMetrics = {
      'my-function': {
        Invocations: {
          values: [100],
          timestamps: ['2023-01-01T00:00:00Z'],
        },
      },
    }

    const mockErrorLogs = {
      'my-function': {
        totalErrors: 1,
        errorGroups: [
          {
            pattern: 'Error: Connection timed out',
            count: 1,
            sample: 'Error: Connection timed out after 5000ms',
            timestamps: ['2023-01-01T00:00:00Z'],
          },
        ],
      },
    }

    mockGetLambdaFunctionDetails.mockResolvedValue(mockFunctionDetails)
    mockGetMetricData.mockResolvedValue(mockMetrics)
    mockGetErrorLogs.mockResolvedValue(mockErrorLogs)

    const result = await getLambdaInfo({
      functionNames: ['my-function'],
    })

    expect(result).toBeDefined()

    const parsedJson = JSON.parse(result.content[0].text)
    expect(parsedJson[0].functionName).toBe('my-function')
    expect(parsedJson[0].metrics).toBeDefined()
    expect(parsedJson[0].errorLogs).toBeDefined()

    // Verify that the default time range was used (24 hours)
    expect(mockGetMetricData).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: expect.any(Number),
      endTime: expect.any(Number),
      period: 3600,
    })

    expect(mockGetErrorLogs).toHaveBeenCalledWith({
      functionNames: ['my-function'],
      startTime: expect.any(Number),
      endTime: expect.any(Number),
      limit: 100,
    })

    // Verify the time range is approximately 24 hours
    const startTime = mockGetMetricData.mock.calls[0][0].startTime
    const endTime = mockGetMetricData.mock.calls[0][0].endTime
    const timeDiff = endTime - startTime
    const oneDayInMs = 24 * 60 * 60 * 1000

    // Allow for a small margin of error in the test due to execution time
    expect(timeDiff).toBeGreaterThanOrEqual(oneDayInMs - 1000)
    expect(timeDiff).toBeLessThanOrEqual(oneDayInMs + 1000)
  })
})
