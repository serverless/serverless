import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const mockLogger = {
  logoDevMode: jest.fn(),
  blankLine: jest.fn(),
  aside: jest.fn(),
  notice: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  confirm: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    get: jest.fn(() => mockLogger),
    error: jest.fn(),
    blankLine: jest.fn(),
    warning: jest.fn(),
  },
  progress: {
    get: jest.fn(() => ({
      notice: jest.fn(),
      remove: jest.fn(),
      get: jest.fn(() => ({
        notice: jest.fn(),
        remove: jest.fn(),
      })),
    })),
  },
  style: {
    aside: jest.fn((message) => message),
  },
  stringToSafeColor: jest.fn((value) => value),
  // read by the domains code that info's endpoint lines load for web app hostnames
  ServerlessErrorCodes: { domains: {} },
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options = {}) {
      super(message)
      this.code = code
      this.options = options
    }
  },
}))

const { default: AwsDev } =
  await import('../../../../../lib/plugins/aws/dev/index.js')

const createServerless = () => {
  const provider = {
    getStage: jest.fn(),
    getRegion: jest.fn(),
    getRuntime: jest.fn((runtime) => runtime),
  }

  return {
    getProvider: jest.fn(() => provider),
    processedInput: { commands: [] },
    configurationInput: {},
    service: {
      provider: {},
      getServiceName: jest.fn(() => 'test-service'),
      getAllFunctions: jest.fn(() => ['hello']),
      getFunction: jest.fn(() => ({
        handler: 'handler.main',
        runtime: 'nodejs20.x',
      })),
    },
  }
}

describe('AwsDev', () => {
  let awsDev

  beforeEach(() => {
    jest.clearAllMocks()
    awsDev = new AwsDev(createServerless(), {})
  })

  describe('hooks', () => {
    const hooksFor = (commands, options = {}) => {
      const serverless = createServerless()
      serverless.processedInput = { commands, options }
      return new AwsDev(serverless, options).hooks
    }

    it('does not hook packaging for "serverless dev" in any mode', () => {
      for (const options of [{}, { sandbox: 'web' }, { mode: 'agents' }]) {
        expect(
          hooksFor(['dev'], options)[
            'before:package:createDeploymentArtifacts'
          ],
        ).toBeUndefined()
      }
    })

    it('registers the setup hook for "serverless dev setup"', () => {
      const hooks = hooksFor(['dev', 'setup'])
      expect(hooks['before:package:createDeploymentArtifacts']).toBeUndefined()
      expect(hooks['dev:setup:setup']).toBeInstanceOf(Function)
    })

    it('registers the restore hook for "serverless dev restore"', () => {
      const hooks = hooksFor(['dev', 'restore'])
      expect(hooks['dev:restore:restore']).toBeInstanceOf(Function)
      expect(hooks['before:deploy:deploy']).toBeUndefined()
    })

    it.each([
      [['deploy'], 'before:deploy:deploy'],
      [['remove'], 'before:remove:remove'],
      [['rollback'], 'before:rollback:rollback'],
      [['deploy', 'function'], 'before:deploy:function:initialize'],
    ])('restores Dev Mode functions first in "%s"', (commands, hook) => {
      expect(hooksFor(commands)[hook]).toBeInstanceOf(Function)
    })

    it('runs no restore-first hook in the deployment "serverless dev" starts itself', () => {
      const hooks = hooksFor(['dev'])
      for (const hook of [
        'before:deploy:deploy',
        'before:remove:remove',
        'before:rollback:rollback',
        'before:deploy:function:initialize',
      ]) {
        expect(hooks[hook]).toBeUndefined()
      }
    })
  })

  describe('#validateOnExitOption()', () => {
    it('should not throw when --on-exit is not provided', () => {
      expect(() => awsDev.validateOnExitOption()).not.toThrow()
    })

    it.each(['keep', 'remove'])(
      'should not throw when --on-exit is set to "%s"',
      (value) => {
        awsDev.options['on-exit'] = value

        expect(() => awsDev.validateOnExitOption()).not.toThrow()
      },
    )

    it('should throw when --on-exit has an unsupported value', () => {
      awsDev.options['on-exit'] = 'foo'

      expect(() => awsDev.validateOnExitOption()).toThrow(
        'Option "--on-exit" must be "keep" or "remove".',
      )

      try {
        awsDev.validateOnExitOption()
      } catch (error) {
        expect(error.code).toBe('INVALID_DEV_ON_EXIT_OPTION')
      }
    })
  })

  describe('#validateModeOption()', () => {
    it('should not throw when --mode is not provided', () => {
      expect(() => awsDev.validateModeOption()).not.toThrow()
    })

    it('should not throw when --mode is "functions"', () => {
      awsDev.options.mode = 'functions'

      expect(() => awsDev.validateModeOption()).not.toThrow()
    })

    it('should not throw when --mode is "agents"', () => {
      awsDev.options.mode = 'agents'

      expect(() => awsDev.validateModeOption()).not.toThrow()
    })

    it('should throw when --mode has an unsupported value', () => {
      awsDev.options.mode = 'foo'

      expect(() => awsDev.validateModeOption()).toThrow(
        'Option "--mode" must be one of: functions, agents, sandboxes.',
      )

      try {
        awsDev.validateModeOption()
      } catch (error) {
        expect(error.code).toBe('INVALID_DEV_MODE_OPTION')
      }
    })
  })

  describe('#shouldUseAgentsDevMode()', () => {
    it('should return false when --mode is "functions"', () => {
      awsDev.options.mode = 'functions'

      expect(awsDev.shouldUseAgentsDevMode()).toBe(false)
    })

    it('should return true when --mode is "agents" and agents are defined', () => {
      awsDev.options.mode = 'agents'
      awsDev.serverless.service.initialServerlessConfig = {
        ai: { agents: { myAgent: {} } },
      }

      expect(awsDev.shouldUseAgentsDevMode()).toBe(true)
    })

    it('should throw when --mode is "agents" but no agents are defined', () => {
      awsDev.options.mode = 'agents'

      expect(() => awsDev.shouldUseAgentsDevMode()).toThrow(
        'No agents defined in configuration. Cannot use --mode agents.',
      )

      try {
        awsDev.shouldUseAgentsDevMode()
      } catch (error) {
        expect(error.code).toBe('NO_AGENTS_DEFINED')
      }
    })

    it('should auto-detect agents mode when no functions but agents exist', () => {
      awsDev.serverless.service.functions = {}
      awsDev.serverless.service.initialServerlessConfig = {
        ai: { agents: { myAgent: {} } },
      }

      expect(awsDev.shouldUseAgentsDevMode()).toBe(true)
    })

    it('should default to functions mode when both functions and agents exist', () => {
      awsDev.serverless.service.functions = { myFunc: {} }
      awsDev.serverless.service.initialServerlessConfig = {
        ai: { agents: { myAgent: {} } },
      }

      expect(awsDev.shouldUseAgentsDevMode()).toBe(false)
    })

    it('should default to functions mode when no functions and no agents exist', () => {
      awsDev.serverless.service.functions = {}

      expect(awsDev.shouldUseAgentsDevMode()).toBe(false)
    })
  })
})
