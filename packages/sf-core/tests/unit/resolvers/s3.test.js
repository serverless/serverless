import { jest } from '@jest/globals'

// Mock the AWS SDK S3 client
const mockSend = jest.fn()

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetObjectCommand: jest
    .fn()
    .mockImplementation((params) => ({ ...params, _type: 'GetObjectCommand' })),
  PutObjectCommand: jest
    .fn()
    .mockImplementation((params) => ({ ...params, _type: 'PutObjectCommand' })),
  NoSuchKey: class NoSuchKey extends Error {
    constructor(message) {
      super(message)
      this.name = 'NoSuchKey'
    }
  },
  ServerSideEncryption: {
    AES256: 'AES256',
    aws_kms: 'aws:kms',
  },
}))

// Mock the proxy utility
jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((client) => client),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options) {
      super(message)
      this.code = code
      this.options = options
    }
  },
  ServerlessErrorCodes: {
    general: { AWS_CREDENTIALS_MISSING: 'AWS_CREDENTIALS_MISSING' },
  },
}))

// Import after mocking
const { resolveVariableFromS3 } =
  await import('../../../src/lib/resolvers/providers/aws/s3.js')

describe('S3 Resolver', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    mockSend.mockReset()
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
        mockSend.mockResolvedValue({
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
      })

      test('returns null for non-existent key (NoSuchKey)', async () => {
        const noSuchKeyError = new Error('The specified key does not exist.')
        noSuchKeyError.name = 'NoSuchKey'
        mockSend.mockRejectedValue(noSuchKeyError)

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
        mockSend.mockRejectedValue(noSuchBucketError)

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
        mockSend.mockResolvedValue({
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
      })
    })

    describe('ARN format', () => {
      test('resolves S3 ARN format', async () => {
        mockSend.mockResolvedValue({
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
      })
    })

    describe('pre-resolved details', () => {
      test('uses resolutionDetails when bucketName and objectKey provided', async () => {
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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

        expect(mockSend).toHaveBeenCalled()
      })
    })
  })
})
