import { jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    get: jest.fn(() => ({
      logoDevMode: jest.fn(),
      blankLine: jest.fn(),
      aside: jest.fn(),
      notice: jest.fn(),
      debug: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    })),
    error: jest.fn(),
    blankLine: jest.fn(),
    warning: jest.fn(),
    notice: jest.fn(),
  },
  progress: {
    get: jest.fn(() => ({
      notice: jest.fn(),
      remove: jest.fn(),
    })),
  },
  style: { aside: jest.fn((m) => m) },
  stringToSafeColor: jest.fn((v) => v),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options = {}) {
      super(message)
      this.code = code
      this.options = options
    }
  },
}))

jest.unstable_mockModule('aws-iot-device-sdk', () => ({ default: {} }))
jest.unstable_mockModule('chokidar', () => ({
  default: { watch: jest.fn(() => ({ on: jest.fn() })) },
}))

const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')

function makeDev(options, { functions = {}, agents = {}, sandboxes } = {}) {
  const serverless = {
    processedInput: { commands: ['dev'], options },
    service: {
      functions,
      sandboxes,
      initialServerlessConfig: { ai: { agents } },
    },
    configurationInput: { sandboxes },
    classes: { Error },
    getProvider: () => ({}),
  }
  return new AwsDev(serverless, options, { log: { notice() {}, error() {} } })
}

test('--mode sandboxes selects sandbox dev mode', () => {
  const dev = makeDev({ mode: 'sandboxes' }, { sandboxes: { api: {} } })
  expect(dev.shouldUseSandboxesDevMode()).toBe(true)
})

test('auto-detects sandbox mode when only sandboxes are defined', () => {
  const dev = makeDev({}, { sandboxes: { api: {} } })
  expect(dev.shouldUseSandboxesDevMode()).toBe(true)
})

test('does not select sandbox mode when functions exist and no --mode', () => {
  const dev = makeDev({}, { functions: { f: {} }, sandboxes: { api: {} } })
  expect(dev.shouldUseSandboxesDevMode()).toBe(false)
})

test('--mode sandboxes with no sandboxes throws', () => {
  const dev = makeDev({ mode: 'sandboxes' }, {})
  expect(() => dev.shouldUseSandboxesDevMode()).toThrow(/No sandboxes/i)
})

test('validateModeOption accepts sandboxes', () => {
  const dev = makeDev({ mode: 'sandboxes' }, { sandboxes: { api: {} } })
  expect(() => dev.validateModeOption()).not.toThrow()
})

test('--sandbox flag selects sandbox mode on mixed service (functions + sandboxes)', () => {
  // I3 fix: --sandbox must override auto-detect on mixed services
  const dev = makeDev(
    { sandbox: 'api' },
    { functions: { f: {} }, sandboxes: { api: {} } },
  )
  expect(dev.shouldUseSandboxesDevMode()).toBe(true)
})

test('--sandbox flag with no sandboxes defined throws', () => {
  const dev = makeDev({ sandbox: 'api' }, {})
  expect(() => dev.shouldUseSandboxesDevMode()).toThrow(/No sandboxes/i)
})
