import { jest } from '@jest/globals'

const { default: AwsLogsAgent } =
  await import('../../../../../lib/plugins/aws/logs-agent.js')

const createStackOutput = (
  outputKey = 'AssistantRuntimeId',
  outputValue = 'my_service_assistant_dev-AbCdEf1234',
) => ({
  Stacks: [
    {
      Outputs: [
        {
          OutputKey: outputKey,
          OutputValue: outputValue,
        },
      ],
    },
  ],
})

const createProvider = (overrides = {}) => ({
  getRegion: jest.fn().mockReturnValue('us-east-1'),
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
  serviceDir: '/path/to/service',
})

const createMockUtils = () => ({
  log: {
    notice: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    aside: jest.fn(),
    blankLine: jest.fn(),
    debug: jest.fn(),
  },
  progress: {
    notice: jest.fn(),
    remove: jest.fn(),
  },
})

describe('AwsLogsAgent', () => {
  let plugin
  let serverless
  let provider
  let mockUtils

  beforeEach(() => {
    provider = createProvider()
    serverless = createServerless(
      {
        agents: {
          assistant: {},
        },
      },
      provider,
    )
    mockUtils = createMockUtils()
  })

  describe('constructor', () => {
    it('should register logs:logs hook', () => {
      plugin = new AwsLogsAgent(serverless, {}, mockUtils)
      expect(plugin.hooks['logs:logs']).toBeDefined()
    })
  })

  describe('hook execution', () => {
    it('should skip if --agent is not provided', async () => {
      plugin = new AwsLogsAgent(serverless, {}, mockUtils)
      await plugin.hooks['logs:logs']()
      expect(provider.request).not.toHaveBeenCalled()
    })

    it('should throw if both --agent and --function are provided', async () => {
      plugin = new AwsLogsAgent(
        serverless,
        { agent: 'assistant', function: 'myFunc' },
        mockUtils,
      )

      await expect(plugin.hooks['logs:logs']()).rejects.toThrow(
        'Cannot specify both --function and --agent',
      )
    })
  })

  describe('validateAgent', () => {
    it('should throw if no agents defined', () => {
      serverless = createServerless({}, provider)
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      expect(() => plugin.validateAgent()).toThrow(
        'No agents defined in serverless.yml under ai.agents',
      )
    })

    it('should throw if agent not found', () => {
      plugin = new AwsLogsAgent(serverless, { agent: 'nonexistent' }, mockUtils)

      expect(() => plugin.validateAgent()).toThrow(
        "Agent 'nonexistent' not found in serverless.yml",
      )
    })

    it('should pass for valid agent', () => {
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      expect(() => plugin.validateAgent()).not.toThrow()
    })
  })

  describe('resolveLogGroupName', () => {
    it('should construct log group from RuntimeId stack output', async () => {
      provider.request.mockResolvedValue(createStackOutput())
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      const logGroupName = await plugin.resolveLogGroupName()

      expect(logGroupName).toBe(
        '/aws/bedrock-agentcore/runtimes/my_service_assistant_dev-AbCdEf1234-DEFAULT',
      )
      expect(provider.request).toHaveBeenCalledWith(
        'CloudFormation',
        'describeStacks',
        { StackName: 'test-stack' },
      )
    })

    it('should throw if stack not found', async () => {
      provider.request.mockResolvedValue({ Stacks: [] })
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      await expect(plugin.resolveLogGroupName()).rejects.toThrow(
        "Stack 'test-stack' not found",
      )
    })

    it('should throw if runtime ID output not found', async () => {
      provider.request.mockResolvedValue({
        Stacks: [{ Outputs: [] }],
      })
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      await expect(plugin.resolveLogGroupName()).rejects.toThrow(
        'runtime ID not found in stack outputs',
      )
    })
  })

  describe('getLogStreams', () => {
    it('should return log stream names', async () => {
      provider.request.mockResolvedValue({
        logStreams: [
          { logStreamName: 'stream-1' },
          { logStreamName: 'stream-2' },
        ],
      })
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)
      plugin.options.logGroupName =
        '/aws/bedrock-agentcore/runtimes/test-DEFAULT'

      const result = await plugin.getLogStreams()

      expect(result).toEqual(['stream-1', 'stream-2'])
      expect(provider.request).toHaveBeenCalledWith(
        'CloudWatchLogs',
        'describeLogStreams',
        expect.objectContaining({
          logGroupName: '/aws/bedrock-agentcore/runtimes/test-DEFAULT',
          descending: true,
          limit: 50,
          orderBy: 'LastEventTime',
        }),
      )
    })

    it('should throw if no log streams exist', async () => {
      provider.request.mockResolvedValue({
        logStreams: [],
      })
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)
      plugin.options.logGroupName =
        '/aws/bedrock-agentcore/runtimes/test-DEFAULT'

      await expect(plugin.getLogStreams()).rejects.toThrow(
        'No existing log streams for the agent',
      )
    })

    it('should throw descriptive error if log group not found', async () => {
      const resourceNotFoundError = new Error('ResourceNotFoundException')
      resourceNotFoundError.providerError = {
        code: 'ResourceNotFoundException',
      }
      provider.request.mockRejectedValue(resourceNotFoundError)
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)
      plugin.options.logGroupName =
        '/aws/bedrock-agentcore/runtimes/test-DEFAULT'

      await expect(plugin.getLogStreams()).rejects.toThrow(
        'Log group not found for agent',
      )
    })
  })

  describe('showLogs', () => {
    beforeEach(() => {
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)
      plugin.options.logGroupName =
        '/aws/bedrock-agentcore/runtimes/test-DEFAULT'
      plugin.options.interval = 1000
    })

    it('should display log events', async () => {
      provider.request.mockResolvedValue({
        events: [
          { message: 'Hello from agent\n', timestamp: 1000 },
          { message: 'Processing request\n', timestamp: 2000 },
        ],
      })

      await plugin.showLogs(['stream-1'])

      expect(mockUtils.log.notice).toHaveBeenCalledWith('Hello from agent')
      expect(mockUtils.log.notice).toHaveBeenCalledWith('Processing request')
      expect(mockUtils.progress.remove).toHaveBeenCalled()
    })

    it('should show no-logs message when no events found', async () => {
      provider.request.mockResolvedValue({ events: [] })

      await plugin.showLogs(['stream-1'])

      expect(mockUtils.log.aside).toHaveBeenCalledWith(
        expect.stringContaining('No logs found from start time'),
      )
    })

    it('should pass filter pattern when --filter is provided', async () => {
      plugin.options.filter = 'ERROR'
      provider.request.mockResolvedValue({ events: [] })

      await plugin.showLogs(['stream-1'])

      expect(provider.request).toHaveBeenCalledWith(
        'CloudWatchLogs',
        'filterLogEvents',
        expect.objectContaining({
          filterPattern: 'ERROR',
        }),
      )
    })

    it('should handle relative startTime (e.g., "30m")', async () => {
      plugin.options.startTime = '30m'
      provider.request.mockResolvedValue({ events: [] })

      await plugin.showLogs(['stream-1'])

      const callArgs = provider.request.mock.calls[0][2]
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
      expect(callArgs.startTime).toBeGreaterThan(thirtyMinutesAgo - 5000)
      expect(callArgs.startTime).toBeLessThanOrEqual(thirtyMinutesAgo + 5000)
    })

    it('should handle absolute startTime', async () => {
      plugin.options.startTime = '2024-01-15T10:00:00'
      provider.request.mockResolvedValue({ events: [] })

      await plugin.showLogs(['stream-1'])

      const callArgs = provider.request.mock.calls[0][2]
      expect(callArgs.startTime).toBeDefined()
      expect(typeof callArgs.startTime).toBe('number')
    })
  })

  describe('getAiConfig', () => {
    it('should return ai config from service.ai', () => {
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      const config = plugin.getAiConfig()
      expect(config).toEqual({ agents: { assistant: {} } })
    })

    it('should fallback to initialServerlessConfig.ai', () => {
      serverless.service.ai = undefined
      serverless.service.initialServerlessConfig = {
        ai: { agents: { fallback: {} } },
      }
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      const config = plugin.getAiConfig()
      expect(config).toEqual({ agents: { fallback: {} } })
    })

    it('should fallback to configurationInput.ai', () => {
      serverless.service.ai = undefined
      serverless.configurationInput = {
        ai: { agents: { input: {} } },
      }
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      const config = plugin.getAiConfig()
      expect(config).toEqual({ agents: { input: {} } })
    })

    it('should return null if no ai config exists', () => {
      serverless.service.ai = undefined
      plugin = new AwsLogsAgent(serverless, { agent: 'assistant' }, mockUtils)

      const config = plugin.getAiConfig()
      expect(config).toBeNull()
    })
  })
})
