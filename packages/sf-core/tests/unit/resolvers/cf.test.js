import { jest } from '@jest/globals'

// Mock the AWS SDK CloudFormation client
const mockSend = jest.fn()

jest.unstable_mockModule('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  DescribeStacksCommand: jest.fn().mockImplementation((params) => ({
    ...params,
    _type: 'DescribeStacksCommand',
  })),
}))

// Mock the proxy utility
jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((client) => client),
}))

// Import after mocking
const { resolveVariableFromCloudFormation } = await import(
  '../../../src/lib/resolvers/providers/aws/cf.js'
)

describe('CloudFormation Resolver', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    mockSend.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('resolveVariableFromCloudFormation', () => {
    describe('existing stack and output', () => {
      test('resolves existing stack output', async () => {
        mockSend.mockResolvedValue({
          Stacks: [
            {
              StackName: 'my-stack',
              Outputs: [
                {
                  OutputKey: 'ApiEndpoint',
                  OutputValue: 'https://api.example.com',
                },
                { OutputKey: 'BucketName', OutputValue: 'my-bucket' },
              ],
            },
          ],
        })

        const result = await resolveVariableFromCloudFormation(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          'my-stack.ApiEndpoint',
        )

        expect(result).toBe('https://api.example.com')
      })

      test('resolves second output from stack', async () => {
        mockSend.mockResolvedValue({
          Stacks: [
            {
              StackName: 'my-stack',
              Outputs: [
                {
                  OutputKey: 'ApiEndpoint',
                  OutputValue: 'https://api.example.com',
                },
                { OutputKey: 'BucketName', OutputValue: 'my-bucket' },
              ],
            },
          ],
        })

        const result = await resolveVariableFromCloudFormation(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          'my-stack.BucketName',
        )

        expect(result).toBe('my-bucket')
      })
    })

    describe('missing output handling', () => {
      test('returns null for non-existent output key', async () => {
        mockSend.mockResolvedValue({
          Stacks: [
            {
              StackName: 'my-stack',
              Outputs: [
                {
                  OutputKey: 'ApiEndpoint',
                  OutputValue: 'https://api.example.com',
                },
              ],
            },
          ],
        })

        const result = await resolveVariableFromCloudFormation(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          'my-stack.NonExistentOutput',
        )

        expect(result).toBeNull()
      })

      test('returns null for stack with no outputs', async () => {
        mockSend.mockResolvedValue({
          Stacks: [
            {
              StackName: 'my-stack',
              Outputs: [],
            },
          ],
        })

        const result = await resolveVariableFromCloudFormation(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          'my-stack.SomeOutput',
        )

        expect(result).toBeNull()
      })
    })

    describe('missing stack handling', () => {
      test('returns null for non-existent stack', async () => {
        const validationError = new Error(
          'Stack with id not-existing does not exist',
        )
        validationError.name = 'ValidationError'
        mockSend.mockRejectedValue(validationError)

        const result = await resolveVariableFromCloudFormation(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          'not-existing.SomeOutput',
        )

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Output SomeOutput not found in stack not-existing',
        )
      })
    })

    describe('error handling', () => {
      test('throws error for non-validation AWS errors', async () => {
        const awsError = new Error('Access Denied')
        awsError.name = 'AccessDeniedException'
        mockSend.mockRejectedValue(awsError)

        await expect(
          resolveVariableFromCloudFormation(
            mockLogger,
            { accessKeyId: 'test', secretAccessKey: 'test' },
            {},
            'us-east-1',
            'my-stack.SomeOutput',
          ),
        ).rejects.toThrow('Access Denied')
      })
    })

    describe('invalid address handling', () => {
      /**
       * Note: v3 validates addresses without '.' separator and returns VARIABLE_RESOLUTION_ERROR.
       * extension-runner passes 'invalid' as stackName with undefined outputKey.
       * This documents current behavior - consider adding validation.
       */
      test('treats address without dot as stack name only', async () => {
        mockSend.mockResolvedValue({
          Stacks: [
            {
              StackName: 'invalid',
              Outputs: [{ OutputKey: 'SomeOutput', OutputValue: 'value' }],
            },
          ],
        })

        const result = await resolveVariableFromCloudFormation(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          {},
          'us-east-1',
          'invalid',
        )

        // outputKey is undefined, so no output matches

        expect(result).toBeNull()
      })
    })
  })
})
