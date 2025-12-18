/**
 * E2E tests for the AWS Errors Info tool
 */
import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Create mock functions
const mockExecuteCloudWatchLogsQuery = jest.fn()
const mockGetResourcesForService = jest.fn()
const mockParseTimestamp = jest.fn((timestamp) => {
  if (typeof timestamp === 'number') {
    return timestamp
  }
  return new Date(timestamp).getTime()
})

// Mock AWS CloudWatch client
const mockExecutePatternAnalyticsQuery = jest.fn()
const mockAwsCloudWatchClient = {
  startQuery: jest.fn(),
  getQueryResults: jest.fn(),
  stopQuery: jest.fn(),
  executePatternAnalyticsQuery: mockExecutePatternAnalyticsQuery,
}

// Mock the CloudWatch Logs Insights module
await jest.unstable_mockModule(
  '../../src/lib/aws/cloudwatch-logs-insights.js',
  () => {
    return {
      executeCloudWatchLogsQuery: mockExecuteCloudWatchLogsQuery,
      parseTimestamp: mockParseTimestamp,
    }
  },
)

// Mock the AWS CloudWatch client module
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => mockAwsCloudWatchClient),
    }
  },
)

// Mock the list-resources module
await jest.unstable_mockModule('../../src/tools/list-resources.js', () => {
  return {
    getIacResources: mockGetResourcesForService,
  }
})

// Mock the CloudFormation module
await jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudformation.js',
  () => {
    return {
      AwsCloudformationService: class MockAwsCloudformationService {
        constructor() {}
        async describeStackResources() {
          return [
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
          ]
        }
      },
    }
  },
)

// Import the module under test after mocking dependencies
const { getErrorsInfoWithPatterns } = await import(
  '../../src/lib/aws/errors-info-patterns.js'
)

describe('AWS Errors Info with Pattern Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T01:00:00Z',
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

    // Verify that the patterns were correctly processed
    const connectionTimeoutGroup = result.errorGroups.find((group) =>
      group.pattern.includes('Connection timeout to database'),
    )
    expect(connectionTimeoutGroup).toBeDefined()
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

  test('should handle service-wide analysis', async () => {
    // Mock the list-resources response with CloudFormation resources format
    mockGetResourcesForService.mockResolvedValue([
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
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T01:00:00Z',
      serviceWideAnalysis: true,
      serviceName: 'my-service-dev',
      serviceType: 'serverless-framework',
    })

    // With our new implementation, we're using AwsCloudformationService directly for CloudFormation-based services
    // so getIacResources won't be called for serverless-framework type
    // If we were testing a non-CloudFormation service type, we would expect this call:
    // expect(mockGetResourcesForService).toHaveBeenCalledWith({
    //   serviceName: 'my-service-dev',
    //   serviceType: 'serverless-framework',
    //   region: undefined,
    //   profile: undefined,
    // })

    // Verify that executePatternAnalyticsQuery was called with the correct log groups
    expect(mockExecutePatternAnalyticsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        logGroupIdentifiers: [
          '/aws/lambda/my-service-dev-function1',
          '/aws/lambda/my-service-dev-function2',
          '/aws/apigateway/api1',
        ],
      }),
    )

    // Verify the results
    expect(result.summary.totalErrors).toBe(1)
    expect(result.errorGroups.length).toBe(1)
  })

  test('should handle errors gracefully', async () => {
    // Mock CloudWatch Logs Insights query to throw an error
    mockExecutePatternAnalyticsQuery.mockRejectedValue(
      new Error('API call failed'),
    )

    // Call the function
    const result = await getErrorsInfoWithPatterns({
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T01:00:00Z',
      logGroupIdentifiers: ['/aws/lambda/function1'],
    })

    // Verify that the function handled the error gracefully
    expect(result.error).toBe('API call failed')
    expect(result.errorGroups).toEqual([])
    expect(result.summary.totalErrors).toBe(0)
    expect(result.summary.uniqueErrorGroups).toBe(0)
  })
})
