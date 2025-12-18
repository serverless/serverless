import { jest } from '@jest/globals'

// Mock the AWS SDK SSM client
const mockSend = jest.fn()

jest.unstable_mockModule('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetParameterCommand: jest.fn().mockImplementation((params) => ({
    ...params,
    _type: 'GetParameterCommand',
  })),
  ParameterNotFound: class ParameterNotFound extends Error {
    constructor(message) {
      super(message)
      this.name = 'ParameterNotFound'
    }
  },
}))

// Mock the proxy utility
jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((client) => client),
}))

// Import after mocking
const { resolveVariableFromSsm } = await import(
  '../../../src/lib/resolvers/providers/aws/ssm.js'
)

describe('SSM Resolver', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    mockSend.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('resolveVariableFromSsm', () => {
    describe('String parameter type', () => {
      test('resolves String parameter', async () => {
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
          Parameter: { Type: 'SecureString', Value: 'ENCRYPTED' },
        })

        await resolveVariableFromSsm(
          mockLogger,
          { accessKeyId: 'test', secretAccessKey: 'test' },
          'us-east-1',
          '/secret/param',
          { rawOrDecrypt: 'noDecrypt' },
        )

        // Verify the command was called with WithDecryption: false
        const { GetParameterCommand } = await import('@aws-sdk/client-ssm')
        expect(GetParameterCommand).toHaveBeenCalledWith({
          Name: '/secret/param',
          WithDecryption: false,
        })
      })

      test('returns encrypted value with noDecrypt option', async () => {
        mockSend.mockResolvedValue({
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
        const notFoundError = new Error('Parameter not found')
        notFoundError.name = 'ParameterNotFound'
        mockSend.mockRejectedValue(notFoundError)

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
        mockSend.mockRejectedValue(awsError)

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
        mockSend.mockResolvedValue({
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
        mockSend.mockResolvedValue({
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
