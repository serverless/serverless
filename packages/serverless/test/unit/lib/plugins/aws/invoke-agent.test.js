import { jest } from '@jest/globals'

const mockSend = jest.fn()
const BedrockAgentCoreClient = jest.fn(() => ({ send: mockSend }))
const InvokeAgentRuntimeCommand = jest.fn((params) => params)

jest.unstable_mockModule('@aws-sdk/client-bedrock-agentcore', () => ({
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
}))

const { default: AwsInvokeAgent } =
  await import('../../../../../lib/plugins/aws/invoke-agent.js')

const createStackOutput = (outputKey = 'MyAgentRuntimeArn') => ({
  Stacks: [
    {
      Outputs: [
        {
          OutputKey: outputKey,
          OutputValue:
            'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test',
        },
      ],
    },
  ],
})

const createProvider = (overrides = {}) => ({
  getRegion: jest.fn().mockReturnValue('us-east-1'),
  getCredentials: jest.fn().mockResolvedValue({
    credentials: {
      accessKeyId: 'AKIA',
      secretAccessKey: 'SECRET',
      sessionToken: 'TOKEN',
    },
  }),
  naming: {
    getStackName: jest.fn().mockReturnValue('test-stack'),
  },
  request: jest.fn().mockResolvedValue(createStackOutput()),
  ...overrides,
})

const createServerless = (aiConfig = {}, provider = createProvider()) => ({
  service: {
    service: 'test-service',
    ai: aiConfig,
  },
  getProvider: jest.fn().mockReturnValue(provider),
  classes: {
    Error: class ServerlessError extends Error {
      constructor(message) {
        super(message)
        this.name = 'ServerlessError'
      }
    },
  },
  serviceDir: '/path/to/service',
})

const createMockUtils = () => ({
  log: {
    notice: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    blankLine: jest.fn(),
    debug: jest.fn(),
  },
  progress: {
    notice: jest.fn(),
    remove: jest.fn(),
  },
})

const toAsyncIterable = (chunks) => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) {
      yield chunk
    }
  },
})

describe('AwsInvokeAgent', () => {
  let serverless
  let provider
  let options
  let pluginUtils
  let awsInvokeAgent
  let stdoutWriteSpy

  beforeEach(() => {
    mockSend.mockReset()
    BedrockAgentCoreClient.mockClear()
    InvokeAgentRuntimeCommand.mockClear()

    provider = createProvider()
    serverless = createServerless(
      {
        agents: {
          myAgent: {},
        },
      },
      provider,
    )

    options = {
      agent: 'myAgent',
      data: 'test message',
    }

    pluginUtils = createMockUtils()
    awsInvokeAgent = new AwsInvokeAgent(serverless, options, pluginUtils)

    stdoutWriteSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutWriteSpy.mockRestore()
  })

  describe('validateAgent', () => {
    test('accepts valid session ID (33+ characters)', async () => {
      options['session-id'] = 'user-session-001-demo-flow-test-12345'
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).resolves.not.toThrow()
    })

    test('accepts session ID with exactly 33 characters', async () => {
      options['session-id'] = '123456789012345678901234567890123'
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).resolves.not.toThrow()
    })

    test('rejects session ID shorter than 33 characters', async () => {
      options['session-id'] = 'short-session-id'
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).rejects.toThrow(
        "Session ID must be at least 33 characters long. Provided: 'short-session-id' (16 characters)",
      )
    })

    test('accepts when no session ID is provided', async () => {
      await expect(awsInvokeAgent.validateAgent()).resolves.not.toThrow()
    })

    test('throws error when agent not found', async () => {
      options.agent = 'nonExistentAgent'
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).rejects.toThrow(
        "Agent 'nonExistentAgent' not found in serverless.yml",
      )
    })
  })

  describe('invoke', () => {
    test('wraps plain string --data in { prompt } payload', async () => {
      options.data = 'Hello world'
      awsInvokeAgent.options = options

      mockSend.mockResolvedValue({
        contentType: 'application/json',
        response: toAsyncIterable([Buffer.from('ok')]),
      })

      await awsInvokeAgent.invoke()

      const sentPayload = JSON.parse(
        Buffer.from(
          InvokeAgentRuntimeCommand.mock.calls[0][0].payload,
        ).toString(),
      )
      expect(sentPayload).toEqual({ prompt: 'Hello world' })
    })

    test('sends JSON object --data as-is without double-wrapping', async () => {
      options.data = { prompt: 'Hello' }
      awsInvokeAgent.options = options

      mockSend.mockResolvedValue({
        contentType: 'application/json',
        response: toAsyncIterable([Buffer.from('ok')]),
      })

      await awsInvokeAgent.invoke()

      const sentPayload = JSON.parse(
        Buffer.from(
          InvokeAgentRuntimeCommand.mock.calls[0][0].payload,
        ).toString(),
      )
      expect(sentPayload).toEqual({ prompt: 'Hello' })
    })

    test('sends arbitrary JSON object --data as-is', async () => {
      options.data = { prompt: 'Hello', sessionId: 'abc', extra: 'field' }
      awsInvokeAgent.options = options

      mockSend.mockResolvedValue({
        contentType: 'application/json',
        response: toAsyncIterable([Buffer.from('ok')]),
      })

      await awsInvokeAgent.invoke()

      const sentPayload = JSON.parse(
        Buffer.from(
          InvokeAgentRuntimeCommand.mock.calls[0][0].payload,
        ).toString(),
      )
      expect(sentPayload).toEqual({
        prompt: 'Hello',
        sessionId: 'abc',
        extra: 'field',
      })
    })

    test('sends invoke request with SSE-compatible accept header', async () => {
      mockSend.mockResolvedValue({
        contentType: 'application/json',
        response: toAsyncIterable([Buffer.from('ok')]),
      })

      await awsInvokeAgent.invoke()

      expect(InvokeAgentRuntimeCommand).toHaveBeenCalledTimes(1)
      expect(InvokeAgentRuntimeCommand.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          contentType: 'application/json',
          accept: 'text/event-stream, application/json',
        }),
      )
    })

    test('passes runtimeSessionId when session-id is provided', async () => {
      options['session-id'] = 'session-id-value-with-at-least-33-chars'
      awsInvokeAgent.options = options

      mockSend.mockResolvedValue({
        contentType: 'application/json',
        response: toAsyncIterable([Buffer.from('ok')]),
      })

      await awsInvokeAgent.invoke()

      expect(InvokeAgentRuntimeCommand.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          runtimeSessionId: 'session-id-value-with-at-least-33-chars',
        }),
      )
    })

    test('prints raw SSE event data and suppresses [DONE]', async () => {
      mockSend.mockResolvedValue({
        contentType: 'text/event-stream',
        response: toAsyncIterable([
          Buffer.from('data: hello\n\n'),
          Buffer.from('data: world\n\n'),
          Buffer.from('data: [DONE]\n\n'),
        ]),
      })

      await awsInvokeAgent.invoke()

      expect(stdoutWriteSpy).toHaveBeenCalledWith('hello')
      expect(stdoutWriteSpy).toHaveBeenCalledWith('world')
      expect(stdoutWriteSpy).not.toHaveBeenCalledWith('[DONE]')
    })

    test('writes non-SSE output as decoded text', async () => {
      mockSend.mockResolvedValue({
        contentType: 'application/json',
        response: toAsyncIterable([Buffer.from('plain response')]),
      })

      await awsInvokeAgent.invoke()

      expect(stdoutWriteSpy).toHaveBeenCalledWith('plain response')
    })

    test('renders structured non-SSE error payload', async () => {
      mockSend.mockResolvedValue({
        contentType: 'application/json',
        response: toAsyncIterable([
          Buffer.from(
            JSON.stringify({
              error_type: 'ValidationError',
              error: 'Invalid prompt',
              message: 'Invalid prompt details',
            }),
          ),
        ]),
      })

      await awsInvokeAgent.invoke()

      expect(pluginUtils.log.error).toHaveBeenCalledWith('Agent Error:')
      expect(pluginUtils.log.error).toHaveBeenCalledWith(
        '  Type: ValidationError',
      )
      expect(pluginUtils.log.error).toHaveBeenCalledWith(
        '  Error: Invalid prompt',
      )
      expect(stdoutWriteSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid prompt'),
      )
    })

    test('maps AccessDeniedException to invoke access denied error', async () => {
      mockSend.mockRejectedValue({
        name: 'AccessDeniedException',
        message: 'forbidden',
      })

      await expect(awsInvokeAgent.invoke()).rejects.toThrow(
        'Access denied when invoking agent. Check your IAM permissions for bedrock-agentcore:InvokeAgentRuntime.',
      )
    })

    test('wraps unknown runtime failures as AGENT_INVOKE_FAILED', async () => {
      mockSend.mockRejectedValue({
        name: 'UnknownError',
        message: 'runtime exploded',
      })

      await expect(awsInvokeAgent.invoke()).rejects.toThrow(
        'Failed to invoke agent: runtime exploded',
      )
    })
  })
})
