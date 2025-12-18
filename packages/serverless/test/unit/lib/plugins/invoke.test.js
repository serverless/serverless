import {
  jest,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
} from '@jest/globals'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
    notice: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: {},
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
  getOrCreateGlobalDeploymentBucket: jest.fn(),
}))

const { default: Invoke } = await import('../../../../lib/plugins/invoke.js')
const { default: Serverless } = await import('../../../../lib/serverless.js')

describe('Invoke', () => {
  let invoke
  let serverless
  let originalEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    serverless = new Serverless({ commands: [], options: {} })
    invoke = new Invoke(serverless)
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('#constructor()', () => {
    it('should have commands', () => {
      expect(invoke.commands).toBeDefined()
      expect(Object.keys(invoke.commands).length).toBeGreaterThan(0)
    })

    it('should have hooks', () => {
      expect(invoke.hooks).toBeDefined()
      expect(Object.keys(invoke.hooks).length).toBeGreaterThan(0)
    })
  })

  describe('#loadEnvVarsForLocal()', () => {
    it('should set IS_LOCAL', () => {
      invoke.loadEnvVarsForLocal()
      expect(process.env.IS_LOCAL).toBe('true')
      expect(serverless.service.provider.environment.IS_LOCAL).toBe('true')
    })

    it('should leave provider env variable untouched if already defined', () => {
      serverless.service.provider.environment = { IS_LOCAL: 'false' }
      invoke.loadEnvVarsForLocal()
      expect(serverless.service.provider.environment.IS_LOCAL).toBe('false')
    })
  })

  describe('hooks', () => {
    describe('invoke:local:loadEnvVars', () => {
      it('should be an event', () => {
        expect(invoke.commands.invoke.commands.local.lifecycleEvents).toContain(
          'loadEnvVars',
        )
      })

      it('should set IS_LOCAL when hook is called', async () => {
        await invoke.hooks['invoke:local:loadEnvVars']()
        expect(process.env.IS_LOCAL).toBe('true')
        expect(serverless.service.provider.environment.IS_LOCAL).toBe('true')
      })

      it('should leave provider env variable untouched if already defined', async () => {
        serverless.service.provider.environment = { IS_LOCAL: 'false' }
        await invoke.hooks['invoke:local:loadEnvVars']()
        expect(serverless.service.provider.environment.IS_LOCAL).toBe('false')
      })

      it('should accept a single env option', async () => {
        invoke.options = { env: 'NAME=value' }
        await invoke.hooks['invoke:local:loadEnvVars']()
        expect(process.env.NAME).toBe('value')
      })

      it('should accept multiple env options', async () => {
        invoke.options = { env: ['NAME1=val1', 'NAME2=val2'] }
        await invoke.hooks['invoke:local:loadEnvVars']()
        expect(process.env.NAME1).toBe('val1')
        expect(process.env.NAME2).toBe('val2')
      })
    })
  })
})
