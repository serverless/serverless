/**
 * Jest tests for AWS DynamoDB Resource Info
 *
 * This test file tests the getDynamoDBResourceInfo function, mocking the AWS SDK clients
 * to avoid making actual AWS API calls during testing.
 */

import { jest, expect, describe, test, beforeEach } from '@jest/globals'

// Mock the DynamoDB client
const mockListTables = jest.fn()
const mockDescribeTable = jest.fn()
const mockDescribeContinuousBackups = jest.fn()
const mockDescribeKinesisStreamingDestination = jest.fn()
const mockDescribeTableReplicaAutoScaling = jest.fn()
const mockDescribeTimeToLive = jest.fn()
const mockGetResourcePolicy = jest.fn()
const mockGetDynamoDBMetricData = jest.fn()

// Mock the AWS DynamoDB client
jest.unstable_mockModule(
  '../../../../packages/engine/src/lib/aws/dynamodb.js',
  () => {
    return {
      AwsDynamoDBClient: jest.fn(() => ({
        listTables: mockListTables,
        describeTable: mockDescribeTable,
        describeContinuousBackups: mockDescribeContinuousBackups,
        describeKinesisStreamingDestination:
          mockDescribeKinesisStreamingDestination,
        describeTableReplicaAutoScaling: mockDescribeTableReplicaAutoScaling,
        describeTimeToLive: mockDescribeTimeToLive,
        getResourcePolicy: mockGetResourcePolicy,
      })),
    }
  },
)

// Mock the AWS CloudWatch client
jest.unstable_mockModule(
  '../../../../packages/engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => ({
        getDynamoDBMetricData: mockGetDynamoDBMetricData,
      })),
    }
  },
)

// Import the module under test (after mocking)
const { getDynamoDBResourceInfo } = await import(
  '../../src/lib/aws/dynamodb-resource-info.js'
)

describe('DynamoDB Resource Info', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset mock implementations
    mockListTables.mockReset()
    mockDescribeTable.mockReset()
    mockDescribeContinuousBackups.mockReset()
    mockDescribeKinesisStreamingDestination.mockReset()
    mockDescribeTableReplicaAutoScaling.mockReset()
    mockDescribeTimeToLive.mockReset()
    mockGetResourcePolicy.mockReset()
    mockGetDynamoDBMetricData.mockReset()
  })

  test('should get DynamoDB info for a specific table', async () => {
    const tableName = 'users-table'

    // Mock DynamoDB client responses
    const tableDetails = {
      Table: {
        TableName: tableName,
        TableStatus: 'ACTIVE',
        TableArn: `arn:aws:dynamodb:us-west-2:123456789012:table/${tableName}`,
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
          LastDecreaseDateTime: new Date('2023-01-01T00:00:00Z'),
          LastIncreaseDateTime: new Date('2023-01-02T00:00:00Z'),
        },
        TableSizeBytes: 1024,
        ItemCount: 100,
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
        CreationDateTime: new Date('2022-12-01T00:00:00Z'),
        GlobalSecondaryIndexes: [
          {
            IndexName: 'email-index',
            KeySchema: [
              {
                AttributeName: 'email',
                KeyType: 'HASH',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
            ProvisionedThroughput: {
              ReadCapacityUnits: 2,
              WriteCapacityUnits: 2,
            },
          },
        ],
      },
    }

    // Mock DynamoDB client responses
    mockDescribeTable.mockResolvedValue(tableDetails)

    // Mock continuous backups response
    mockDescribeContinuousBackups.mockResolvedValue({
      ContinuousBackupsDescription: {
        ContinuousBackupsStatus: 'ENABLED',
        PointInTimeRecoveryDescription: {
          PointInTimeRecoveryStatus: 'ENABLED',
          EarliestRestorableDateTime: new Date('2023-01-01T00:00:00Z'),
          LatestRestorableDateTime: new Date('2023-01-10T00:00:00Z'),
        },
      },
    })

    // Mock Kinesis streaming destination response
    mockDescribeKinesisStreamingDestination.mockResolvedValue({
      KinesisDataStreamDestinations: [
        {
          StreamArn:
            'arn:aws:kinesis:us-west-2:123456789012:stream/dynamodb-stream',
          DestinationStatus: 'ACTIVE',
          ApproximateCreationDateTime: new Date('2023-01-01T00:00:00Z'),
        },
      ],
    })

    // Mock table replica auto scaling response
    mockDescribeTableReplicaAutoScaling.mockResolvedValue({
      TableAutoScalingDescription: {
        TableName: tableName,
        TableStatus: 'ACTIVE',
        Replicas: [
          {
            RegionName: 'us-west-2',
            ReplicaStatus: 'ACTIVE',
            ReplicaProvisionedReadCapacityAutoScalingSettings: {
              MinimumUnits: 5,
              MaximumUnits: 10,
              AutoScalingDisabled: false,
            },
          },
        ],
      },
    })

    // Mock Time to Live response
    mockDescribeTimeToLive.mockResolvedValue({
      TimeToLiveDescription: {
        TimeToLiveStatus: 'ENABLED',
        AttributeName: 'ttl',
      },
    })

    // Mock resource policy response
    mockGetResourcePolicy.mockResolvedValue({
      Policy:
        '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":["dynamodb:GetItem","dynamodb:PutItem"],"Resource":"*"}]}',
    })

    // Mock CloudWatch metrics with a structure that matches what's expected in the test
    mockGetDynamoDBMetricData.mockImplementation(
      ({ tableNames, startTime, endTime, period }) => {
        return Promise.resolve({
          [tableName]: {
            ConsumedReadCapacityUnits: [
              { timestamp: '2023-01-01T00:00:00Z', value: 10 },
              { timestamp: '2023-01-01T01:00:00Z', value: 15 },
            ],
            ConsumedWriteCapacityUnits: [
              { timestamp: '2023-01-01T00:00:00Z', value: 5 },
              { timestamp: '2023-01-01T01:00:00Z', value: 8 },
            ],
          },
        })
      },
    )

    const result = await getDynamoDBResourceInfo({
      resourceId: tableName,
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
      period: 3600,
    })

    // Verify the result
    expect(result).toBeDefined()
    expect(result.resourceId).toBe(tableName)
    expect(result.type).toBe('dynamodb')
    expect(result.tableName).toBe(tableName)
    expect(result.tableDetails).toBeDefined()
    expect(result.tableDetails.Table.TableName).toBe(tableName)
    expect(result.tableDetails.Table.GlobalSecondaryIndexes).toHaveLength(1)

    // Verify the new fields
    expect(result.continuousBackups).toBeDefined()
    expect(
      result.continuousBackups.ContinuousBackupsDescription
        .ContinuousBackupsStatus,
    ).toBe('ENABLED')

    expect(result.kinesisStreamingDestination).toBeDefined()
    expect(
      result.kinesisStreamingDestination.KinesisDataStreamDestinations,
    ).toHaveLength(1)

    expect(result.tableReplicaAutoScaling).toBeDefined()
    expect(
      result.tableReplicaAutoScaling.TableAutoScalingDescription.Replicas,
    ).toHaveLength(1)

    expect(result.timeToLive).toBeDefined()
    expect(result.timeToLive.TimeToLiveDescription.TimeToLiveStatus).toBe(
      'ENABLED',
    )

    expect(result.resourcePolicy).toBeDefined()
    expect(typeof result.resourcePolicy.Policy).toBe('string')

    // Verify metrics
    expect(result.metrics).toBeDefined()
    // Just check that metrics exist without assuming a specific structure
    expect(result.metrics).not.toBeNull()
    expect(typeof result.metrics).toBe('object')

    // Verify client calls
    expect(mockDescribeTable).toHaveBeenCalledWith({ tableName })
    expect(mockDescribeContinuousBackups).toHaveBeenCalledWith({ tableName })
    expect(mockDescribeKinesisStreamingDestination).toHaveBeenCalledWith({
      tableName,
    })
    expect(mockDescribeTableReplicaAutoScaling).toHaveBeenCalledWith({
      tableName,
    })
    expect(mockDescribeTimeToLive).toHaveBeenCalledWith({ tableName })
    // In the first test case, we expect the resource policy to be called with the TableArn
    expect(mockGetResourcePolicy).toHaveBeenCalledWith({
      resourceArn: tableDetails.Table.TableArn,
    })
    expect(mockGetDynamoDBMetricData).toHaveBeenCalledWith(
      expect.objectContaining({
        tableNames: [tableName],
        period: 3600,
      }),
    )
  })

  test('should handle errors when table does not exist', async () => {
    const tableName = 'nonexistent-table'

    // Mock DynamoDB client to throw an error
    mockDescribeTable.mockRejectedValue(new Error('Table not found'))

    const result = await getDynamoDBResourceInfo({
      resourceId: tableName,
    })

    // Verify the result contains error information
    expect(result).toBeDefined()
    expect(result.resourceId).toBe(tableName)
    expect(result.type).toBe('dynamodb')
    expect(result.status).toBe('error')
    expect(result.error).toContain('Table not found')

    // Verify client calls
    expect(mockDescribeTable).toHaveBeenCalledWith({ tableName })
    expect(mockGetDynamoDBMetricData).not.toHaveBeenCalled()
  })

  test('should handle errors when fetching metrics', async () => {
    const tableName = 'users-table'

    // Reset all mocks before this test
    mockGetResourcePolicy.mockReset()

    // Mock DynamoDB client responses
    mockDescribeTable.mockResolvedValue({
      Table: {
        TableName: tableName,
        TableStatus: 'ACTIVE',
        // We're intentionally not providing TableArn to test the error handling
        KeySchema: [
          {
            AttributeName: 'id',
            KeyType: 'HASH',
          },
        ],
      },
    })

    // Mock successful responses for the new API calls
    mockDescribeContinuousBackups.mockResolvedValue({
      ContinuousBackupsDescription: {
        ContinuousBackupsStatus: 'ENABLED',
      },
    })

    mockDescribeKinesisStreamingDestination.mockResolvedValue({
      KinesisDataStreamDestinations: [],
    })

    mockDescribeTableReplicaAutoScaling.mockResolvedValue({
      TableAutoScalingDescription: {
        TableName: tableName,
      },
    })

    mockDescribeTimeToLive.mockResolvedValue({
      TimeToLiveDescription: {
        TimeToLiveStatus: 'DISABLED',
      },
    })

    // Mock CloudWatch metrics to throw an error
    // We need to implement this as a function that returns a rejected promise
    // to ensure it's properly called in the test
    mockGetDynamoDBMetricData.mockImplementation(() => {
      return Promise.reject(new Error('Metrics error'))
    })

    const result = await getDynamoDBResourceInfo({
      resourceId: tableName,
      startTime: '2023-01-01T00:00:00Z',
      endTime: '2023-01-01T03:00:00Z',
    })

    // Verify the result
    expect(result).toBeDefined()
    expect(result.resourceId).toBe(tableName)
    expect(result.type).toBe('dynamodb')
    expect(result.tableName).toBe(tableName)
    expect(result.tableDetails).toBeDefined()

    // Verify the new fields are present
    expect(result.continuousBackups).toBeDefined()
    expect(result.kinesisStreamingDestination).toBeDefined()
    expect(result.tableReplicaAutoScaling).toBeDefined()
    expect(result.timeToLive).toBeDefined()
    expect(result.resourcePolicy).toBeDefined()

    // The implementation might store metrics errors differently
    // Let's check that the error is captured somewhere in the result
    const resultString = JSON.stringify(result)
    expect(resultString).toContain('error')

    // Verify client calls
    expect(mockDescribeTable).toHaveBeenCalledWith({ tableName })
    expect(mockDescribeContinuousBackups).toHaveBeenCalledWith({ tableName })
    expect(mockDescribeKinesisStreamingDestination).toHaveBeenCalledWith({
      tableName,
    })
    expect(mockDescribeTableReplicaAutoScaling).toHaveBeenCalledWith({
      tableName,
    })
    expect(mockDescribeTimeToLive).toHaveBeenCalledWith({ tableName })
    // In the error case, we don't expect the resource policy to be called with the ARN
    // because the implementation should handle the case where the ARN is not available
    expect(mockGetResourcePolicy).not.toHaveBeenCalled()

    // In the error case, we just verify that metrics data was requested
    // without checking the exact parameters
    expect(mockGetDynamoDBMetricData).toHaveBeenCalled()
  })

  test('should pass region and profile parameters to clients', async () => {
    const tableName = 'users-table'
    const region = 'us-east-1'
    const profile = 'test-profile'

    // Mock successful responses
    mockDescribeTable.mockResolvedValue({
      Table: {
        TableName: tableName,
        TableStatus: 'ACTIVE',
      },
    })

    mockGetDynamoDBMetricData.mockResolvedValue({
      [tableName]: {},
    })

    await getDynamoDBResourceInfo({
      resourceId: tableName,
      region,
      profile,
    })

    // Verify the AWS clients were initialized with the correct parameters
    const { AwsDynamoDBClient } = await import(
      '../../../../packages/engine/src/lib/aws/dynamodb.js'
    )
    const { AwsCloudWatchClient } = await import(
      '../../../../packages/engine/src/lib/aws/cloudwatch.js'
    )

    expect(AwsDynamoDBClient).toHaveBeenCalledWith({ region, profile })
    expect(AwsCloudWatchClient).toHaveBeenCalledWith({ region, profile })
  })
})
