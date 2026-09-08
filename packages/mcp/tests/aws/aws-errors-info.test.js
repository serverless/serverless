/**
 * Unit tests for the AWS Errors Info pattern-analytics library
 * (src/lib/aws/errors-info-patterns.js).
 *
 * Every engine AWS client the module (or the confirmation handler it uses) can
 * construct is mocked, so no test in this file can reach AWS:
 *  - cloudwatch.js     -> describeLogGroups (log group validation) and
 *                         executePatternAnalyticsQuery (the Insights query)
 *  - cloudformation.js -> describeStackResources (service-wide analysis)
 *  - lambda.js         -> getLambdaFunctionDetails (log group discovery)
 *  - restApiGateway.js / httpApiGateway.js -> getStages (log group discovery)
 */
import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Mock AWS CloudWatch client
const mockExecutePatternAnalyticsQuery = jest.fn()
const mockDescribeLogGroups = jest.fn()

// Mock AWS clients used while discovering log groups of a service
const mockDescribeStackResources = jest.fn()
const mockGetLambdaFunctionDetails = jest.fn()
const mockGetRestApiStages = jest.fn()
const mockGetHttpApiStages = jest.fn()

// Mock the AWS CloudWatch client module
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => ({
        describeLogGroups: mockDescribeLogGroups,
        executePatternAnalyticsQuery: mockExecutePatternAnalyticsQuery,
      })),
    }
  },
)

// Mock the CloudFormation module
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudformation.js',
  () => {
    return {
      AwsCloudformationService: jest.fn(() => ({
        describeStackResources: mockDescribeStackResources,
      })),
    }
  },
)

// Mock the Lambda client module
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

// Mock the API Gateway client modules (restApiGateway.js is a default export)
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/restApiGateway.js',
  () => {
    const AwsRestApiGatewayClient = jest.fn(() => ({
      getStages: mockGetRestApiStages,
    }))
    return { AwsRestApiGatewayClient, default: AwsRestApiGatewayClient }
  },
)

await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/httpApiGateway.js',
  () => {
    return {
      AwsHttpApiGatewayClient: jest.fn(() => ({
        getStages: mockGetHttpApiStages,
      })),
    }
  },
)

// Import the module under test after mocking dependencies
const { getErrorsInfoWithPatterns } =
  await import('../../src/lib/aws/errors-info-patterns.js')

const START_TIME = '2023-01-01T00:00:00Z'
const END_TIME = '2023-01-01T01:00:00Z'

describe('AWS Errors Info with Pattern Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Every requested log group exists and is small enough (1 KiB) that the
    // extended-timeframe cost confirmation is skipped.
    mockDescribeLogGroups.mockImplementation(
      async ({ logGroupNamePrefix }) => ({
        logGroups: [{ logGroupName: logGroupNamePrefix, storedBytes: 1024 }],
      }),
    )
    mockGetRestApiStages.mockResolvedValue([])
    mockGetHttpApiStages.mockResolvedValue([])
  })

  test('should group similar errors correctly', async () => {
    // Mock CloudWatch Logs Insights pattern analytics response
    mockExecutePatternAnalyticsQuery.mockResolvedValue({
      events: [
        {
          pattern: 'ERROR: Connection timeout to database at <*>',
          count: 2,
          examples: [
            'ERROR: Connection timeout to database at 10.0.0.1',
            'ERROR: Connection timeout to database at 10.0.0.2',
          ],
          patternId: '7ecb9e1506938875f66688ee60c510db',
          regexString: '\\QERROR: Connection timeout to database at \\E.*',
          ratio: 0.4,
          relatedPatterns: [
            '4c6b457ceacc6940ed3e5d34e69e74ca',
            '829d82345808dd14853884091c780f92',
          ],
          severityLabel: 'ERROR',
          raw: {
            '@pattern': 'ERROR: Connection timeout to database at <*>',
            '@severityLabel': 'ERROR',
          },
        },
        {
          pattern: 'ERROR: Invalid input parameter: <*>',
          count: 2,
          examples: [
            'ERROR: Invalid input parameter: user-id-123',
            'ERROR: Invalid input parameter: user-id-456',
          ],
          patternId: '4c6b457ceacc6940ed3e5d34e69e74ca',
          regexString: '\\QERROR: Invalid input parameter: \\E.*',
          ratio: 0.4,
          relatedPatterns: [
            '7ecb9e1506938875f66688ee60c510db',
            '829d82345808dd14853884091c780f92',
          ],
          severityLabel: 'ERROR',
          raw: {
            '@pattern': 'ERROR: Invalid input parameter: <*>',
            '@severityLabel': 'ERROR',
          },
        },
        {
          pattern: "TypeError: Cannot read property 'id' of undefined",
          count: 1,
          examples: ["TypeError: Cannot read property 'id' of undefined"],
          patternId: '829d82345808dd14853884091c780f92',
          regexString:
            "\\QTypeError: Cannot read property 'id' of undefined\\E",
          ratio: 0.2,
          relatedPatterns: [
            '7ecb9e1506938875f66688ee60c510db',
            '4c6b457ceacc6940ed3e5d34e69e74ca',
          ],
          severityLabel: 'NONE',
          raw: {
            '@pattern': "TypeError: Cannot read property 'id' of undefined",
            '@severityLabel': 'NONE',
          },
        },
      ],
    })

    // Call the function
    const result = await getErrorsInfoWithPatterns({
      startTime: START_TIME,
      endTime: END_TIME,
      logGroupIdentifiers: [
        '/aws/lambda/function1',
        '/aws/lambda/function2',
        '/aws/lambda/function3',
      ],
      maxResults: 10,
    })

    // Verify the results
    expect(result.summary.totalErrors).toBe(5)
    expect(result.summary.uniqueErrorGroups).toBe(3)
    expect(result.summary.timeRange).toEqual({
      start: new Date(Date.parse(START_TIME)).toISOString(),
      end: new Date(Date.parse(END_TIME)).toISOString(),
    })

    // Only the log groups that exist are queried, and the query window is the
    // requested one. maxResults is over-fetched by 3x to allow for grouping.
    expect(mockExecutePatternAnalyticsQuery).toHaveBeenCalledWith({
      logGroupIdentifiers: [
        '/aws/lambda/function1',
        '/aws/lambda/function2',
        '/aws/lambda/function3',
      ],
      startTime: new Date(Date.parse(START_TIME)),
      endTime: new Date(Date.parse(END_TIME)),
      limit: 30,
    })

    // Verify that the patterns were correctly processed
    const connectionTimeoutGroup = result.errorGroups.find((group) =>
      group.pattern.includes('Connection timeout to database'),
    )
    expect(connectionTimeoutGroup).toBeDefined()
    expect(connectionTimeoutGroup.id).toBe(
      'pattern-7ecb9e1506938875f66688ee60c510db',
    )
    expect(connectionTimeoutGroup.count).toBe(2)
    expect(connectionTimeoutGroup.patternId).toBe(
      '7ecb9e1506938875f66688ee60c510db',
    )
    expect(connectionTimeoutGroup.regexString).toBeDefined()
    expect(connectionTimeoutGroup.ratio).toBe(0.4)
    expect(connectionTimeoutGroup.severityLabel).toBe('ERROR')

    const invalidInputGroup = result.errorGroups.find((group) =>
      group.pattern.includes('Invalid input parameter'),
    )
    expect(invalidInputGroup).toBeDefined()
    expect(invalidInputGroup.count).toBe(2)
    expect(invalidInputGroup.patternId).toBe('4c6b457ceacc6940ed3e5d34e69e74ca')

    const typeErrorGroup = result.errorGroups.find((group) =>
      group.pattern.includes('TypeError'),
    )
    expect(typeErrorGroup).toBeDefined()
    expect(typeErrorGroup.count).toBe(1)
    expect(typeErrorGroup.patternId).toBe('829d82345808dd14853884091c780f92')
  })

  test('should require log groups when serviceWideAnalysis is false', async () => {
    const result = await getErrorsInfoWithPatterns({
      startTime: START_TIME,
      endTime: END_TIME,
      logGroupIdentifiers: [],
    })

    expect(result.error).toBe(
      'logGroupIdentifiers is required when serviceWideAnalysis is false',
    )
    expect(result.errorGroups).toEqual([])
    expect(mockExecutePatternAnalyticsQuery).not.toHaveBeenCalled()
  })

  test('should handle service-wide analysis', async () => {
    // CloudFormation stack resources of the analysed service
    mockDescribeStackResources.mockResolvedValue([
      {
        ResourceType: 'AWS::Lambda::Function',
        PhysicalResourceId: 'my-service-dev-function1',
      },
      {
        ResourceType: 'AWS::Lambda::Function',
        PhysicalResourceId: 'my-service-dev-function2',
      },
      {
        ResourceType: 'AWS::ApiGateway::RestApi',
        PhysicalResourceId: 'api1',
      },
    ])

    // Shape returned by AwsLambdaClient.getLambdaFunctionDetails
    // (packages/engine/src/lib/aws/lambda.js): { status, function, ... } where
    // `function` is the GetFunction response.
    mockGetLambdaFunctionDetails.mockImplementation(async (functionName) => ({
      status: 'success',
      function: {
        Configuration: {
          FunctionName: functionName,
        },
      },
    }))

    // The REST API writes access logs to an explicit log group
    mockGetRestApiStages.mockResolvedValue([
      {
        stageName: 'dev',
        accessLogSettings: {
          destinationArn:
            'arn:aws:logs:us-east-1:123456789012:log-group:/aws/apigateway/api1-access-logs:*',
        },
      },
    ])

    // Mock CloudWatch Logs Insights pattern analytics response
    mockExecutePatternAnalyticsQuery.mockResolvedValue({
      events: [
        {
          pattern: 'ERROR: Connection timeout to database at <*>',
          count: 1,
          examples: ['ERROR: Connection timeout to database at 10.0.0.1'],
          patternId: '7ecb9e1506938875f66688ee60c510db',
          regexString: '\\QERROR: Connection timeout to database at \\E.*',
          ratio: 1.0,
          severityLabel: 'ERROR',
          raw: {
            '@pattern': 'ERROR: Connection timeout to database at <*>',
            '@severityLabel': 'ERROR',
          },
        },
      ],
    })

    // Call the function with serviceWideAnalysis
    const result = await getErrorsInfoWithPatterns({
      startTime: START_TIME,
      endTime: END_TIME,
      serviceWideAnalysis: true,
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
    })

    // Log groups are discovered from the CloudFormation stack resources
    expect(mockDescribeStackResources).toHaveBeenCalledWith('my-service-dev')
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith(
      'my-service-dev-function1',
    )
    expect(mockGetLambdaFunctionDetails).toHaveBeenCalledWith(
      'my-service-dev-function2',
    )
    expect(mockGetRestApiStages).toHaveBeenCalledWith('api1')

    // Verify the results
    expect(result.summary.totalErrors).toBe(1)
    expect(result.errorGroups.length).toBe(1)

    // Verify that executePatternAnalyticsQuery was called with the log groups of
    // every logging resource in the stack: the default log group of each Lambda
    // function plus the REST API access log group.
    //
    // fetchLambdaLogGroups reads the configuration from the engine's
    // `{ function: { Configuration } }` response shape, the same way
    // lambda-resource-info.js does; with no LoggingConfig set it falls back to
    // the default /aws/lambda/<name> group for each function.
    expect(
      [
        ...mockExecutePatternAnalyticsQuery.mock.calls[0][0]
          .logGroupIdentifiers,
      ].sort(),
    ).toEqual([
      '/aws/apigateway/api1-access-logs',
      '/aws/lambda/my-service-dev-function1',
      '/aws/lambda/my-service-dev-function2',
    ])
  })

  test('should ask for confirmation before scanning large log groups over a long timeframe', async () => {
    // 3 GiB of stored logs, queried over 6 hours: both cost guards apply
    mockDescribeLogGroups.mockImplementation(
      async ({ logGroupNamePrefix }) => ({
        logGroups: [
          { logGroupName: logGroupNamePrefix, storedBytes: 3 * 1024 ** 3 },
        ],
      }),
    )

    const result = await getErrorsInfoWithPatterns({
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T06:00:00Z',
      logGroupIdentifiers: ['/aws/lambda/function1'],
    })

    expect(result.content[0].text).toContain(
      'CloudWatch Logs Insights queries incur costs',
    )
    expect(result.content[0].text).toContain('6.0 hours')
    expect(mockExecutePatternAnalyticsQuery).not.toHaveBeenCalled()
  })

  test('should handle errors gracefully', async () => {
    // Mock CloudWatch Logs Insights query to throw an error
    mockExecutePatternAnalyticsQuery.mockRejectedValue(
      new Error('API call failed'),
    )

    // Call the function
    const result = await getErrorsInfoWithPatterns({
      startTime: START_TIME,
      endTime: END_TIME,
      logGroupIdentifiers: ['/aws/lambda/function1'],
    })

    // Verify that the function handled the error gracefully
    expect(result.error).toBe('API call failed')
    expect(result.errorGroups).toEqual([])
    expect(result.summary.totalErrors).toBe(0)
    expect(result.summary.uniqueErrorGroups).toBe(0)
    expect(result.summary.nextSteps).toBe(
      'Error occurred. No pattern analysis available.',
    )
    expect(result.statistics).toBeNull()
  })

  test('should report log group validation failures', async () => {
    mockDescribeLogGroups.mockRejectedValue(new Error('Throttling'))

    const result = await getErrorsInfoWithPatterns({
      startTime: START_TIME,
      endTime: END_TIME,
      logGroupIdentifiers: ['/aws/lambda/function1'],
    })

    expect(result.message).toBe('Error validating log groups: Throttling')
    expect(result.errorGroups).toEqual([])
    expect(result.summary.totalErrors).toBe(0)
    expect(mockExecutePatternAnalyticsQuery).not.toHaveBeenCalled()
  })
})
