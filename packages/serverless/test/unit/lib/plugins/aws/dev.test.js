import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals'

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

const originalProcessVersion = process.version

const setProcessVersion = (version) => {
  Object.defineProperty(process, 'version', {
    configurable: true,
    value: version,
  })
}
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
    setProcessVersion(originalProcessVersion)
    awsDev = new AwsDev(createServerless(), {})
  })

  afterEach(() => {
    setProcessVersion(originalProcessVersion)
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

  describe('#update()', () => {
    it('should set runtime to local node runtime when it is supported by AWS Lambda', async () => {
      setProcessVersion('v22.1.0')
      awsDev.getIotEndpoint = jest.fn().mockResolvedValue('iot-endpoint')

      const functionConfig = {
        handler: 'handler.main',
        runtime: 'nodejs20.x',
      }

      awsDev.serverless.service.getFunction = jest.fn(() => functionConfig)
      awsDev.serverless.service.provider.iam = {}
      awsDev.serverless.getProvider().getStage.mockReturnValue('dev')

      await awsDev.update()

      expect(functionConfig.runtime).toBe('nodejs22.x')
      expect(mockLogger.warning).toHaveBeenCalledWith(
        'Your local machine is using Node.js v22, while at least one of your functions is not. Ensure matching runtime versions for accurate testing.',
      )
    })

    it('should fall back to nodejs20.x when local node runtime is not supported by AWS Lambda', async () => {
      setProcessVersion('v26.0.0')
      awsDev.getIotEndpoint = jest.fn().mockResolvedValue('iot-endpoint')

      const functionConfig = {
        handler: 'handler.main',
        runtime: 'nodejs20.x',
      }

      awsDev.serverless.service.getFunction = jest.fn(() => functionConfig)
      awsDev.serverless.service.provider.iam = {}
      awsDev.serverless.getProvider().getStage.mockReturnValue('dev')

      await awsDev.update()

      expect(functionConfig.runtime).toBe('nodejs20.x')
      expect(mockLogger.warning).toHaveBeenCalledTimes(1)
      expect(mockLogger.warning).toHaveBeenCalledWith(
        'Your local machine is using Node.js v26, which is not yet supported by AWS Lambda. Falling back to nodejs20.x for dev mode deployment.',
      )
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
