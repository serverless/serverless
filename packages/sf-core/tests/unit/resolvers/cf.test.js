import { jest } from '@jest/globals'

const mockSendAwsRequest = jest.fn()

jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/clients.js',
  () => ({ sendAwsRequest: mockSendAwsRequest }),
)

jest.unstable_mockModule('@serverless/util', () => ({
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options = {}) {
      super(message)
      this.code = code
      this.originalMessage = options.originalMessage
      this.originalName = options.originalName
    }
  },
  ServerlessErrorCodes: {
    resolvers: { RESOLVER_INVALID_CF_ADDRESS: 'RESOLVER_INVALID_CF_ADDRESS' },
  },
}))

const { resolveVariableFromCloudFormation } =
  await import('../../../src/lib/resolvers/providers/aws/cf.js')

const credentials = { accessKeyId: 'test', secretAccessKey: 'test' }
const stackWith = (outputs) => ({
  Stacks: [{ StackName: 'my-stack', Outputs: outputs }],
})

describe('CloudFormation Resolver', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = { debug: jest.fn(), info: jest.fn() }
    mockSendAwsRequest.mockReset()
  })

  describe('existing stack and output', () => {
    test('resolves an output and requests the stack through the shared cache', async () => {
      mockSendAwsRequest.mockResolvedValue(
        stackWith([
          { OutputKey: 'ApiEndpoint', OutputValue: 'https://api.example.com' },
          { OutputKey: 'BucketName', OutputValue: 'my-bucket' },
        ]),
      )

      const result = await resolveVariableFromCloudFormation(
        mockLogger,
        credentials,
        {},
        'us-east-1',
        'my-stack.ApiEndpoint',
      )

      expect(result).toBe('https://api.example.com')
      expect(mockSendAwsRequest).toHaveBeenCalledTimes(1)
      const request = mockSendAwsRequest.mock.calls[0][0]
      expect(request).toMatchObject({
        service: 'cloudformation',
        credentials,
        region: 'us-east-1',
        logger: mockLogger,
        target: 'my-stack',
        cache: true,
      })
      expect(request.command.input).toEqual({ StackName: 'my-stack' })
    })

    test('resolves second output from stack', async () => {
      mockSendAwsRequest.mockResolvedValue(
        stackWith([
          { OutputKey: 'ApiEndpoint', OutputValue: 'https://api.example.com' },
          { OutputKey: 'BucketName', OutputValue: 'my-bucket' },
        ]),
      )

      const result = await resolveVariableFromCloudFormation(
        mockLogger,
        credentials,
        {},
        'us-east-1',
        'my-stack.BucketName',
      )

      expect(result).toBe('my-bucket')
    })
  })

  describe('missing output handling', () => {
    test('returns null and names the available outputs for a non-existent output key', async () => {
      mockSendAwsRequest.mockResolvedValue(
        stackWith([
          { OutputKey: 'ApiEndpoint', OutputValue: 'https://api.example.com' },
          { OutputKey: 'BucketName', OutputValue: 'my-bucket' },
        ]),
      )

      const result = await resolveVariableFromCloudFormation(
        mockLogger,
        credentials,
        {},
        'us-east-1',
        'my-stack.NonExistentOutput',
      )

      expect(result).toBeNull()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Output 'NonExistentOutput' not found in stack 'my-stack' (available: ApiEndpoint, BucketName)",
      )
    })

    test('returns null for stack with no outputs', async () => {
      mockSendAwsRequest.mockResolvedValue(stackWith([]))

      const result = await resolveVariableFromCloudFormation(
        mockLogger,
        credentials,
        {},
        'us-east-1',
        'my-stack.SomeOutput',
      )

      expect(result).toBeNull()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Output 'SomeOutput' not found in stack 'my-stack' (available: none)",
      )
    })

    test('returns null when the API omits the Outputs list entirely', async () => {
      mockSendAwsRequest.mockResolvedValue({
        Stacks: [{ StackName: 'my-stack' }],
      })

      const result = await resolveVariableFromCloudFormation(
        mockLogger,
        credentials,
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
      mockSendAwsRequest.mockRejectedValue(validationError)

      const result = await resolveVariableFromCloudFormation(
        mockLogger,
        credentials,
        {},
        'us-east-1',
        'not-existing.SomeOutput',
      )

      expect(result).toBeNull()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Stack 'not-existing' does not exist in us-east-1",
      )
    })
  })

  describe('error handling', () => {
    test('rethrows non-validation AWS errors unchanged', async () => {
      const awsError = new Error('Access Denied')
      awsError.name = 'AccessDeniedException'
      mockSendAwsRequest.mockRejectedValue(awsError)

      await expect(
        resolveVariableFromCloudFormation(
          mockLogger,
          credentials,
          {},
          'us-east-1',
          'my-stack.SomeOutput',
        ),
      ).rejects.toBe(awsError)
    })

    test('rethrows the rate-exceeded error from the request layer unchanged', async () => {
      const rateError = new Error(
        'AWS CloudFormation rejected DescribeStacks …',
      )
      rateError.code = 'RESOLVER_AWS_RATE_EXCEEDED'
      mockSendAwsRequest.mockRejectedValue(rateError)

      await expect(
        resolveVariableFromCloudFormation(
          mockLogger,
          credentials,
          {},
          'us-east-1',
          'my-stack.SomeOutput',
        ),
      ).rejects.toBe(rateError)
    })
  })

  describe('invalid address handling', () => {
    test.each([
      [
        'my-stack',
        "Invalid CloudFormation variable '${cf:my-stack}': expected '<stackName>.<outputKey>'.",
      ],
      [
        'my-stack.',
        "Invalid CloudFormation variable '${cf:my-stack.}': expected '<stackName>.<outputKey>'.",
      ],
      [
        '.Output',
        "Invalid CloudFormation variable '${cf:.Output}': expected '<stackName>.<outputKey>'.",
      ],
    ])('rejects %p before any API call', async (key, message) => {
      const error = await resolveVariableFromCloudFormation(
        mockLogger,
        credentials,
        {},
        'us-east-1',
        key,
      ).catch((e) => e)

      expect(error.code).toBe('RESOLVER_INVALID_CF_ADDRESS')
      expect(error.message).toBe(message)
      expect(mockSendAwsRequest).not.toHaveBeenCalled()
    })
  })
})
