import { jest } from '@jest/globals'
import AwsInvokeAgent from '../../../../../lib/plugins/aws/invoke-agent.js'

const createServerless = (aiConfig = {}) => ({
  service: {
    service: 'test-service',
    ai: aiConfig,
  },
  getProvider: jest.fn().mockReturnValue({
    getRegion: jest.fn().mockReturnValue('us-east-1'),
    request: jest.fn(),
  }),
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
  },
  progress: {
    notice: jest.fn(),
  },
})

describe('AwsInvokeAgent', () => {
  let serverless
  let options
  let pluginUtils
  let awsInvokeAgent

  beforeEach(() => {
    serverless = createServerless({
      agents: {
        myAgent: {
          type: 'runtime',
        },
      },
    })

    options = {
      agent: 'myAgent',
      data: 'test message',
    }

    pluginUtils = createMockUtils()

    awsInvokeAgent = new AwsInvokeAgent(serverless, options, pluginUtils)
  })

  describe('validateAgent', () => {
    test('accepts valid session ID (33+ characters)', async () => {
      options['session-id'] = 'user-session-001-demo-flow-test-12345'
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).resolves.not.toThrow()
    })

    test('accepts session ID with exactly 33 characters', async () => {
      options['session-id'] = '123456789012345678901234567890123' // 33 chars
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).resolves.not.toThrow()
    })

    test('rejects session ID shorter than 33 characters', async () => {
      options['session-id'] = 'short-session-id' // 16 chars
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).rejects.toThrow(
        "Session ID must be at least 33 characters long. Provided: 'short-session-id' (16 characters)",
      )
    })

    test('accepts when no session ID is provided', async () => {
      // No session-id option
      await expect(awsInvokeAgent.validateAgent()).resolves.not.toThrow()
    })

    test('throws error when agent not found', async () => {
      options.agent = 'nonExistentAgent'
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).rejects.toThrow(
        "Agent 'nonExistentAgent' not found in serverless.yml",
      )
    })

    test('throws error when agent type is not runtime', async () => {
      serverless.service.ai.agents.myAgent.type = 'memory'
      options.agent = 'myAgent'
      awsInvokeAgent.options = options

      await expect(awsInvokeAgent.validateAgent()).rejects.toThrow(
        "Agent 'myAgent' is of type 'memory', but only 'runtime' agents can be invoked",
      )
    })

    test('defaults agent type to runtime when not specified', async () => {
      delete serverless.service.ai.agents.myAgent.type
      options.agent = 'myAgent'
      awsInvokeAgent.options = options

      await awsInvokeAgent.validateAgent()
      expect(awsInvokeAgent.agentConfig.type).toBe('runtime')
    })
  })
})
