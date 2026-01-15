/**
 * Jest tests for AWS S3 Info Tool
 *
 * This test file directly tests the getS3Info function, mocking the AwsS3Client
 * to avoid making actual AWS API calls during testing.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

// Create mock functions
const mockGetBucketDetails = jest.fn()
const mockCheckIfBucketExists = jest.fn()
const mockGetBucketLocation = jest.fn()
const mockGetBucketAcl = jest.fn()
const mockGetBucketPolicy = jest.fn()
const mockGetBucketVersioning = jest.fn()
const mockGetBucketEncryption = jest.fn()
const mockGetS3MetricData = jest.fn()

// Mock the AWS S3 client
await jest.unstable_mockModule('../../../engine/src/lib/aws/s3.js', () => {
  return {
    AwsS3Client: jest.fn(() => ({
      getBucketDetails: mockGetBucketDetails,
      checkIfBucketExists: mockCheckIfBucketExists,
      getBucketLocation: mockGetBucketLocation,
      getBucketAcl: mockGetBucketAcl,
      getBucketPolicy: mockGetBucketPolicy,
      getBucketVersioning: mockGetBucketVersioning,
      getBucketEncryption: mockGetBucketEncryption,
    })),
  }
})

// Mock the AWS CloudWatch client
await jest.unstable_mockModule(
  '../../../engine/src/lib/aws/cloudwatch.js',
  () => {
    return {
      AwsCloudWatchClient: jest.fn(() => ({
        getS3MetricData: mockGetS3MetricData,
      })),
    }
  },
)

// Import the function after mocking dependencies
const { getS3Info } = await import('../../src/tools/aws/s3-info.js')

describe('AWS S3 Info Tool', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Set up default mock responses
    mockGetBucketDetails.mockResolvedValue({
      bucketName: 'test-bucket',
      location: 'us-east-1',
      acl: { Owner: { ID: 'owner-id' }, Grants: [] },
      policy: { policy: null },
      versioning: { status: 'Disabled', mfaDelete: 'Disabled' },
      encryption: { enabled: false, rules: [] },
    })

    mockGetS3MetricData.mockResolvedValue({
      'test-bucket': {
        BucketSizeBytes: {
          Average: { values: [1024], timestamps: ['2023-01-01T00:00:00.000Z'] },
          Maximum: { values: [2048], timestamps: ['2023-01-01T00:00:00.000Z'] },
        },
        NumberOfObjects: {
          Average: { values: [10], timestamps: ['2023-01-01T00:00:00.000Z'] },
          Maximum: { values: [20], timestamps: ['2023-01-01T00:00:00.000Z'] },
        },
      },
    })
  })

  test('should return error if no bucket names are provided', async () => {
    const result = await getS3Info({ bucketNames: [] })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(
      'Error: Please provide at least one S3 bucket name',
    )
    expect(mockGetBucketDetails).not.toHaveBeenCalled()
  })

  test('should return bucket information for a single bucket', async () => {
    const result = await getS3Info({ bucketNames: ['test-bucket'] })

    expect(result.isError).toBeUndefined()

    // Parse the JSON response
    const bucketInfo = JSON.parse(result.content[0].text)
    expect(bucketInfo).toHaveLength(1)
    expect(bucketInfo[0].bucketName).toBe('test-bucket')
    expect(bucketInfo[0].type).toBe('s3')
    expect(bucketInfo[0].location).toBe('us-east-1')
    expect(bucketInfo[0].versioning.status).toBe('Disabled')
    expect(bucketInfo[0].encryption.enabled).toBe(false)

    // Verify the correct functions were called
    expect(mockGetBucketDetails).toHaveBeenCalledWith({
      bucketName: 'test-bucket',
    })
    expect(mockGetS3MetricData).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketNames: ['test-bucket'],
      }),
    )
  })

  test('should return bucket information for multiple buckets', async () => {
    // Set up mock responses for multiple buckets
    mockGetBucketDetails
      .mockResolvedValueOnce({
        bucketName: 'bucket-1',
        location: 'us-east-1',
        acl: { Owner: { ID: 'owner-id' }, Grants: [] },
        policy: { policy: null },
        versioning: { status: 'Disabled', mfaDelete: 'Disabled' },
        encryption: { enabled: false, rules: [] },
      })
      .mockResolvedValueOnce({
        bucketName: 'bucket-2',
        location: 'us-west-2',
        acl: { Owner: { ID: 'owner-id' }, Grants: [] },
        policy: { policy: { Statement: [{ Effect: 'Allow' }] } },
        versioning: { status: 'Enabled', mfaDelete: 'Disabled' },
        encryption: {
          enabled: true,
          rules: [
            { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
      })

    mockGetS3MetricData.mockResolvedValue({
      'bucket-1': {
        BucketSizeBytes: {
          Average: { values: [1024], timestamps: ['2023-01-01T00:00:00.000Z'] },
        },
      },
      'bucket-2': {
        BucketSizeBytes: {
          Average: { values: [2048], timestamps: ['2023-01-01T00:00:00.000Z'] },
        },
      },
    })

    const result = await getS3Info({ bucketNames: ['bucket-1', 'bucket-2'] })

    expect(result.isError).toBeUndefined()

    // Parse the JSON response
    const bucketInfo = JSON.parse(result.content[0].text)
    expect(bucketInfo).toHaveLength(2)
    expect(bucketInfo[0].bucketName).toBe('bucket-1')
    expect(bucketInfo[0].location).toBe('us-east-1')
    expect(bucketInfo[1].bucketName).toBe('bucket-2')
    expect(bucketInfo[1].location).toBe('us-west-2')
    expect(bucketInfo[1].versioning.status).toBe('Enabled')
    expect(bucketInfo[1].encryption.enabled).toBe(true)

    // Verify the correct functions were called
    expect(mockGetBucketDetails).toHaveBeenCalledTimes(2)
    expect(mockGetS3MetricData).toHaveBeenCalledTimes(2)
    expect(mockGetS3MetricData).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketNames: ['bucket-1'],
      }),
    )
    expect(mockGetS3MetricData).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketNames: ['bucket-2'],
      }),
    )
  })

  test('should handle errors when getting bucket details', async () => {
    // Mock an error for the bucket details
    mockGetBucketDetails.mockRejectedValue(new Error('Bucket not found'))

    const result = await getS3Info({ bucketNames: ['non-existent-bucket'] })

    expect(result.isError).toBeUndefined()

    // Parse the JSON response
    const bucketInfo = JSON.parse(result.content[0].text)
    expect(bucketInfo).toHaveLength(1)
    expect(bucketInfo[0].bucketName).toBe('non-existent-bucket')
    expect(bucketInfo[0].type).toBe('s3')
    expect(bucketInfo[0].status).toBe('error')
    expect(bucketInfo[0].error).toBe('Bucket not found')
  })

  test('should handle errors when getting metrics', async () => {
    // Mock successful bucket details but error for metrics
    mockGetS3MetricData.mockRejectedValue(new Error('Failed to get metrics'))

    const result = await getS3Info({ bucketNames: ['test-bucket'] })

    expect(result.isError).toBeUndefined()

    // Parse the JSON response
    const bucketInfo = JSON.parse(result.content[0].text)
    expect(bucketInfo).toHaveLength(1)
    expect(bucketInfo[0].bucketName).toBe('test-bucket')
    expect(bucketInfo[0].metrics.error).toBe('Failed to get metrics')
  })
})
