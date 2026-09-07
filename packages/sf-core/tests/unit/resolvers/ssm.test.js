import { jest } from '@jest/globals'
import { ParameterNotFound } from '@aws-sdk/client-ssm'

// Mock the shared AWS request layer
const mockSendAwsRequest = jest.fn()

jest.unstable_mockModule(
  '../../../src/lib/resolvers/providers/aws/clients.js',
  () => ({ sendAwsRequest: mockSendAwsRequest }),
)

// Import after mocking
const { resolveVariableFromSsm } =
  await import('../../../src/lib/resolvers/providers/aws/ssm.js')

describe('SSM Resolver', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    mockSendAwsRequest.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('sends every lookup uncached with the parameter name as target', async () => {
    mockSendAwsRequest.mockResolvedValue({
      Parameter: { Type: 'String', Value: 'v' },
    })
    await resolveVariableFromSsm(
      mockLogger,
      { accessKeyId: 'a', secretAccessKey: 'b' },
      'us-east-1',
      '/p',
      {},
    )
    const request = mockSendAwsRequest.mock.calls[0][0]
    expect(request).toMatchObject({
      service: 'ssm',
      region: 'us-east-1',
      target: '/p',
      logger: mockLogger,
    })
    expect(request.cache).toBeUndefined()
    expect(request.command.input).toEqual({ Name: '/p', WithDecryption: true })
  })

  describe('resolveVariableFromSsm', () => {
    describe('String parameter type', () => {
      test('resolves String parameter', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'String', Value: 'my-value' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/my/param',
          {},
        )

        expect(result).toBe('my-value')
      })
    })

    describe('StringList parameter type', () => {
      test('resolves StringList parameter as array', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'StringList', Value: 'one,two,three' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/my/list',
          {},
        )

        expect(result).toEqual(['one', 'two', 'three'])
      })

      test('resolves StringList parameter as raw string with raw option', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'StringList', Value: 'one,two,three' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/my/list',
          { rawOrDecrypt: 'raw' },
        )

        expect(result).toBe('one,two,three')
      })
    })

    describe('SecureString parameter type', () => {
      test('resolves SecureString JSON as parsed object', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'SecureString', Value: '{"key":"value"}' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/secret/param',
          {},
        )

        expect(result).toEqual({ key: 'value' })
      })

      test('resolves SecureString non-JSON as plain string', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'SecureString', Value: 'plain-secret-value' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/secret/param',
          {},
        )

        expect(result).toBe('plain-secret-value')
      })

      test('resolves SecureString as raw with raw option', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'SecureString', Value: '{"key":"value"}' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/secret/param',
          { rawOrDecrypt: 'raw' },
        )

        // With raw option, JSON is NOT parsed
        expect(result).toBe('{"key":"value"}')
      })

      test('resolves SecureString invalid JSON as plain string', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'SecureString', Value: '{invalid-json' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/secret/param',
          {},
        )

        // Invalid JSON returns as string
        expect(result).toBe('{invalid-json')
      })
    })

    describe('noDecrypt option', () => {
      test('passes WithDecryption: false when noDecrypt is set', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'SecureString', Value: 'ENCRYPTED' },
        })

        await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/secret/param',
          { rawOrDecrypt: 'noDecrypt' },
        )

        // Verify the command was built with WithDecryption: false
        const request = mockSendAwsRequest.mock.calls[0][0]
        expect(request).toMatchObject({
          service: 'ssm',
          region: 'us-east-1',
          target: '/secret/param',
        })
        expect(request.command.input).toEqual({
          Name: '/secret/param',
          WithDecryption: false,
        })
      })

      test('returns encrypted value with noDecrypt option', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'SecureString', Value: 'ENCRYPTED_VALUE' },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/secret/param',
          { rawOrDecrypt: 'noDecrypt' },
        )

        expect(result).toBe('ENCRYPTED_VALUE')
      })
    })

    describe('missing parameter handling', () => {
      test('returns null for non-existent parameter (ParameterNotFound)', async () => {
        mockSendAwsRequest.mockRejectedValue(
          new ParameterNotFound({ message: 'not found', $metadata: {} }),
        )

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/not/existing',
          {},
        )

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'SSM parameter /not/existing not found',
        )
      })
    })

    describe('error handling', () => {
      test('throws error for non-ParameterNotFound AWS errors', async () => {
        const awsError = new Error('Access Denied')
        awsError.name = 'AccessDeniedException'
        mockSendAwsRequest.mockRejectedValue(awsError)

        await expect(
          resolveVariableFromSsm(
            mockLogger,
            { accessKeyId: 'test', secretAccessKey: 'test' },
            'us-east-1',
            '/my/param',
            {},
          ),
        ).rejects.toThrow('Access Denied')
      })

      test('throws error for unexpected parameter type', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: { Type: 'UnknownType', Value: 'value' },
        })

        await expect(
          resolveVariableFromSsm(
            mockLogger,
            { accessKeyId: 'test', secretAccessKey: 'test' },
            'us-east-1',
            '/my/param',
            {},
          ),
        ).rejects.toThrow('Unexpected parameter type: "UnknownType"')
      })
    })

    describe('Secrets Manager reference', () => {
      test('resolves Secrets Manager reference path', async () => {
        mockSendAwsRequest.mockResolvedValue({
          Parameter: {
            Type: 'SecureString',
            Value: '{"username":"admin","password":"secret123"}',
          },
        })

        const result = await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/aws/reference/secretsmanager/my-secret',
          {},
        )

        expect(result).toEqual({ username: 'admin', password: 'secret123' })
      })
    })
  })
})
