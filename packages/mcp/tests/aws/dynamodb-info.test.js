/**
 * Jest tests for AWS DynamoDB Info Tool
 *
 * This test file directly tests the getDynamoDBInfo function, mocking the AwsDynamoDBClient
 * to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Create mock functions
const mockListTables = jest.fn()
const mockDescribeTable = jest.fn()
const mockGetDynamoDBMetricData = jest.fn()
const mockGetDynamoDBResourceInfo = jest.fn()

// Mock the AWS DynamoDB client
await jest.unstable_mockModule(
  '../../../engine/src/lib/aws/dynamodb.js',
  () => {
    return {
      AwsDynamoDBClient: jest.fn(() => ({
        listTables: mockListTables,
        describeTable: mockDescribeTable,
      })),
    }
  },
)

// Mock the AWS CloudWatch client
await jest.unstable_mockModule(
  '../../../engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => ({
        getDynamoDBMetricData: mockGetDynamoDBMetricData,
      })),
    }
  },
)

// Mock the resource-info module
await jest.unstable_mockModule('../../src/lib/aws/resource-info.js', () => {
  return {
    getDynamoDBResourceInfo: mockGetDynamoDBResourceInfo,
  }
})

// Import the function after mocking dependencies
const { getDynamoDBInfo } = await import('../../src/tools/aws/dynamodb-info.js')
const { AwsDynamoDBClient } = await import(
  '../../../engine/src/lib/aws/dynamodb.js'
)
const { AwsCloudWatchClient } = await import(
  '../../../engine/src/lib/aws/cloudwatch.js'
)

describe('AWS DynamoDB Info Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Reset mock implementations
    mockListTables.mockReset()
    mockDescribeTable.mockReset()
    mockGetDynamoDBMetricData.mockReset()
    mockGetDynamoDBResourceInfo.mockReset()
  })

  test('should return error if no table names are provided', async () => {
    const result = await getDynamoDBInfo({ tableNames: [] })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Error')
    expect(mockDescribeTable).not.toHaveBeenCalled()
  })

  test('should get table details for a single table name', async () => {
    const tableName = 'my-table'

    // Mock the resource info function
    mockGetDynamoDBResourceInfo.mockResolvedValue({
      resourceId: tableName,
      type: 'dynamodb',
      tableName,
      tableDetails: {
        Table: {
          TableName: tableName,
          TableStatus: 'ACTIVE',
          TableArn: `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`,
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
          KeySchema: [
            {
              AttributeName: 'id',
              KeyType: 'HASH',
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: 'id',
              AttributeType: 'S',
            },
          ],
          CreationDateTime: '2023-01-01T00:00:00Z',
        },
      },
      metrics: {
        ConsumedReadCapacityUnits: {
          Sum: {
            values: [10, 20, 30],
            timestamps: [
              '2023-01-01T00:00:00Z',
              '2023-01-01T01:00:00Z',
              '2023-01-01T02:00:00Z',
            ],
          },
        },
        ConsumedWriteCapacityUnits: {
          Sum: {
            values: [5, 10, 15],
            timestamps: [
              '2023-01-01T00:00:00Z',
              '2023-01-01T01:00:00Z',
              '2023-01-01T02:00:00Z',
            ],
          },
        },
      },
    })

    const result = await getDynamoDBInfo({
      tableNames: [tableName],
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].tableName).toBe(tableName)
    expect(resultData[0].tableDetails).toBeDefined()
    expect(resultData[0].metrics).toBeDefined()

    expect(mockGetDynamoDBResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: tableName,
        startTime: '2023-01-01T00:00:00Z',
        endTime: '2023-01-01T03:00:00Z',
      }),
    )
  })

  test('should get table details for multiple table names', async () => {
    const tableNames = ['table1', 'table2']

    // Mock the resource info function for multiple tables
    mockGetDynamoDBResourceInfo.mockImplementation((params) => {
      const tableName = params.resourceId
      return Promise.resolve({
        resourceId: tableName,
        type: 'dynamodb',
        tableName,
        tableDetails: {
          Table: {
            TableName: tableName,
            TableStatus: 'ACTIVE',
            TableArn: `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`,
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        },
        metrics: {
          ConsumedReadCapacityUnits: {
            Sum: {
              values: [10, 20, 30],
              timestamps: [
                '2023-01-01T00:00:00Z',
                '2023-01-01T01:00:00Z',
                '2023-01-01T02:00:00Z',
              ],
            },
          },
        },
      })
    })

    const result = await getDynamoDBInfo({
      tableNames: tableNames,
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(2)
    expect(resultData[0].tableName).toBe('table1')
    expect(resultData[1].tableName).toBe('table2')

    expect(mockGetDynamoDBResourceInfo).toHaveBeenCalledTimes(2)
  })

  test('should handle errors for individual tables', async () => {
    const tableName = 'non-existent-table'

    // Mock the resource info function to return an error
    mockGetDynamoDBResourceInfo.mockResolvedValue({
      resourceId: tableName,
      type: 'dynamodb',
      tableName,
      status: 'error',
      error: 'Table not found',
    })

    const result = await getDynamoDBInfo({
      tableNames: [tableName],
    })

    expect(result.isError).toBeUndefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].tableName).toBe(tableName)
    expect(resultData[0].status).toBe('error')
    expect(resultData[0].error).toBeDefined()
  })

  test('should handle general errors', async () => {
    // Mock the resource info function to throw an error
    mockGetDynamoDBResourceInfo.mockImplementation(() => {
      throw new Error('Network error')
    })

    const result = await getDynamoDBInfo({
      tableNames: ['my-table'],
    })

    // The implementation handles errors at the individual table level, not the general function level
    // Check that the result contains the table with error status
    expect(result).toBeDefined()
    expect(result.content).toBeDefined()
    const resultData = JSON.parse(result.content[0].text)
    expect(resultData).toHaveLength(1)
    expect(resultData[0].status).toBe('error')
    expect(resultData[0].error).toContain('Network error')
  })

  test('should pass region and profile parameters', async () => {
    const tableName = 'my-table'
    const region = 'us-east-1'
    const profile = 'test-profile'

    // Mock the resource info function
    mockGetDynamoDBResourceInfo.mockResolvedValue({
      resourceId: tableName,
      type: 'dynamodb',
      tableName,
      tableDetails: {
        Table: {
          TableName: tableName,
          TableStatus: 'ACTIVE',
        },
      },
      metrics: {},
    })

    await getDynamoDBInfo({
      tableNames: [tableName],
      region,
      profile,
    })

    expect(mockGetDynamoDBResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: tableName,
        region,
        profile,
      }),
    )
  })

  test('should pass period parameter to resource info', async () => {
    const tableName = 'my-table'
    const period = 300 // 5 minutes

    // Mock the resource info function
    mockGetDynamoDBResourceInfo.mockResolvedValue({
      resourceId: tableName,
      type: 'dynamodb',
      tableName,
      tableDetails: {
        Table: {
          TableName: tableName,
          TableStatus: 'ACTIVE',
        },
      },
      metrics: {},
    })

    await getDynamoDBInfo({
      tableNames: [tableName],
      period,
    })

    expect(mockGetDynamoDBResourceInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: tableName,
        period,
      }),
    )
  })
})
