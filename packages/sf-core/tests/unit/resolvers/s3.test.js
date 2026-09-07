import { jest } from '@jest/globals'
import { NoSuchKey } from '@aws-sdk/client-s3'

// Mock the shared AWS request layer
const mockSendAwsRequest = jest.fn()

jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/clients.js',
  () => ({ sendAwsRequest: mockSendAwsRequest }),
)

// Import after mocking
const { resolveVariableFromS3, storeDataInS3 } =
  await import('../../../src/lib/resolvers/providers/aws/s3.js')

describe('S3 Resolver', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    mockSendAwsRequest.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('resolveVariableFromS3', () => {
    const createMockStream = (content) => {
      const events = {}
      return {
        on: (event, callback) => {
          events[event] = callback
          if (event === 'data') {
            setTimeout(() => callback(content), 0)
          }
          if (event === 'end') {
            setTimeout(() => callback(), 10)
          }
        },
      }
    }

    describe('simple bucket/key format', () => {
      test('resolves existing S3 object', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Body: createMockStream('file-content'),
        })

        const result = await resolveVariableFromS3(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          {},
          'my-bucket/path/to/file.txt',
        )

        expect(result).toBe('file-content')
        const request = mockSendAwsRequest.mock.calls[0][0]
        expect(request).toMatchObject({
          service: 's3',
          region: 'us-east-1',
          target: 'my-bucket/path/to/file.txt',
          logger: mockLogger,
        })
        expect(request.cache).toBeUndefined()
        expect(request.command.input).toEqual({
          Bucket: 'my-bucket',
          Key: 'path/to/file.txt',
        })
      })

      test('returns null for non-existent key (NoSuchKey)', async () => {
        mockSendAwsRequest.mockRejectedValue(
          new NoSuchKey({ message: 'no such key', $metadata: {} }),
        )

        const result = await resolveVariableFromS3(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          {},
          'my-bucket/non-existent-key',
        )

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          's3 key my-bucket/non-existent-key not found',
        )
      })

      test('throws error for non-existent bucket', async () => {
        const noSuchBucketError = new Error(
          'The specified bucket does not exist.',
        )
        noSuchBucketError.name = 'NoSuchBucket'
        mockSendAwsRequest.mockRejectedValue(noSuchBucketError)

        await expect(
          resolveVariableFromS3(
            mockLogger,
            { accessKeyId: 'test', secretAccessKey: 'test' },
            {},
            'us-east-1',
            {},
            'non-existent-bucket/key',
          ),
        ).rejects.toThrow('The specified bucket does not exist.')
      })
    })

    describe('S3 URL format (s3://)', () => {
      test('resolves S3 URL format', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Body: createMockStream('s3-url-content'),
        })

        const result = await resolveVariableFromS3(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          {},
          's3://my-bucket/path/to/file.txt',
        )

        expect(result).toBe('s3-url-content')
        expect(mockSendAwsRequest.mock.calls[0][0].command.input).toEqual({
          Bucket: 'my-bucket',
          Key: 'path/to/file.txt',
        })
      })
    })

    describe('ARN format', () => {
      test('resolves S3 ARN format', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Body: createMockStream('arn-content'),
        })

        const result = await resolveVariableFromS3(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          {},
          'arn:aws:s3:::my-bucket/path/to/file.txt',
        )

        expect(result).toBe('arn-content')
        expect(mockSendAwsRequest.mock.calls[0][0].command.input).toEqual({
          Bucket: 'my-bucket',
          Key: 'path/to/file.txt',
        })
      })
    })

    describe('pre-resolved details', () => {
      test('uses resolutionDetails when bucketName and objectKey provided', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Body: createMockStream('pre-resolved-content'),
        })

        const result = await resolveVariableFromS3(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          { bucketName: 'explicit-bucket', objectKey: 'explicit-key' },
          'ignored-key',
        )

        expect(result).toBe('pre-resolved-content')
        const request = mockSendAwsRequest.mock.calls[0][0]
        expect(request.target).toBe('explicit-bucket/explicit-key')
        expect(request.command.input).toEqual({
          Bucket: 'explicit-bucket',
          Key: 'explicit-key',
        })
      })
    })

    describe('invalid address handling', () => {
      /**
       * Note: v3 validates invalid addresses and returns VARIABLE_RESOLUTION_ERROR.
       * extension-runner passes these to S3 SDK which will fail.
       * This documents current behavior - consider adding validation.
       */
      test('sends request with empty key for address without separator', async () => {
        // Key 'invalid' has no '/' so objectKey becomes empty string
        mockSendAwsRequest.mockResolvedValue({
          Body: createMockStream('unexpected-content'),
        })

        await resolveVariableFromS3(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          {},
          'invalid',
        )

        // Documents that the SDK is called with empty Key

        expect(mockSendAwsRequest).toHaveBeenCalled()
      })
    })
  })

  describe('storeDataInS3', () => {
    test('writes the object through the shared request layer', async () => {
      mockSendAwsRequest.mockResolvedValue({})

      await storeDataInS3(
        mockLogger,
        { accessKeyId: 'test', secretAccessKey: 'test' },
        'us-east-1',
        { serverSideEncryption: 'AES256' },
        'my-bucket/path/to/file.txt',
        'file-content',
      )

      const request = mockSendAwsRequest.mock.calls[0][0]
      expect(request).toMatchObject({
        service: 's3',
        region: 'us-east-1',
        target: 'my-bucket/path/to/file.txt',
        logger: mockLogger,
      })
      expect(request.cache).toBeUndefined()
      expect(request.command.input).toEqual({
        Bucket: 'my-bucket',
        Key: 'path/to/file.txt',
        Body: 'file-content',
        ServerSideEncryption: 'AES256',
      })
    })

    test('throws for an invalid ServerSideEncryption value', async () => {
      await expect(
        storeDataInS3(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          { serverSideEncryption: 'not-a-cipher' },
          'my-bucket/path/to/file.txt',
          'file-content',
        ),
      ).rejects.toThrow(
        'Invalid ServerSideEncryption value of s3 resolver: not-a-cipher',
      )
      expect(mockSendAwsRequest).not.toHaveBeenCalled()
    })
  })
})
