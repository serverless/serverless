import { jest, describe, it, expect, beforeEach } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    get: jest.fn(() => ({
      logoDevMode: jest.fn(),
      blankLine: jest.fn(),
      aside: jest.fn(),
      notice: jest.fn(),
      debug: jest.fn(),
      warning: jest.fn(),
      confirm: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
    })),
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
    service: {
      provider: {},
    },
  }
}

describe('AwsDev', () => {
  let awsDev

  beforeEach(() => {
    awsDev = new AwsDev(createServerless(), {})
  })

  describe('#validateOnExitOption()', () => {
    it('should not throw when --on-exit is not provided', () => {
      expect(() => awsDev.validateOnExitOption()).not.toThrow()
    })

    it('should not throw when --on-exit is set to "remove"', () => {
      awsDev.options['on-exit'] = 'remove'

      expect(() => awsDev.validateOnExitOption()).not.toThrow()
    })

    it('should throw when --on-exit has an unsupported value', () => {
      awsDev.options['on-exit'] = 'foo'

      expect(() => awsDev.validateOnExitOption()).toThrow(
        'Option "--on-exit" must be "remove".',
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
        'Option "--mode" must be one of: functions, agents.',
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
