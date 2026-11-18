import { jest } from '@jest/globals'

// Functions mode runs a service's web apps with its functions, so a service
// whose only compute is web apps starts a session too. Sandboxes and agents
// modes leave web apps out and say so once.
const logger = {
  logoDevMode: jest.fn(),
  blankLine: jest.fn(),
  aside: jest.fn(),
  notice: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    get: jest.fn(() => logger),
    error: jest.fn(),
    blankLine: jest.fn(),
    warning: jest.fn(),
    notice: jest.fn(),
  },
  progress: { get: jest.fn(() => ({ notice: jest.fn(), remove: jest.fn() })) },
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

const runDevCommand = jest.fn(async () => 0)
jest.unstable_mockModule(
  '../../../../../../lib/plugins/aws/dev/commands/dev.js',
  () => ({
    runDevCommand,
    validateOnExit: jest.fn(),
    validateDevOptions: jest.fn(),
  }),
)

const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')

const noticeFor = (mode) =>
  `Web apps are not part of ${mode} dev mode; start their servers locally.`

function makeDev({ functions = {}, agents = {}, sandboxes, webApps } = {}) {
  const options = {}
  const serverless = {
    processedInput: { commands: ['dev'], options },
    service: {
      functions,
      sandboxes,
      webApps,
      initialServerlessConfig: { ai: { agents } },
    },
    configurationInput: { sandboxes, webApps },
    classes: { Error },
    getProvider: () => ({}),
  }
  return new AwsDev(serverless, options, { log: logger })
}

beforeEach(() => jest.clearAllMocks())

test('web-apps-only service no longer throws WEB_APPS_DEV_NOT_SUPPORTED', async () => {
  const dev = makeDev({ webApps: { api: {} } })
  await dev.dev()
  expect(runDevCommand).toHaveBeenCalledTimes(1)
  expect(logger.notice).not.toHaveBeenCalled()
})

test('functions and web apps: functions mode runs, without a notice', async () => {
  const dev = makeDev({ functions: { hello: {} }, webApps: { api: {} } })
  await dev.dev()
  expect(runDevCommand).toHaveBeenCalledTimes(1)
  expect(logger.notice).not.toHaveBeenCalled()
})

test('sandboxes and web apps: sandbox mode runs, with the notice', async () => {
  const dev = makeDev({ sandboxes: { box: {} }, webApps: { api: {} } })
  const start = jest
    .spyOn(dev, 'startSandboxesDevMode')
    .mockResolvedValue(undefined)
  await dev.dev()
  expect(start).toHaveBeenCalled()
  expect(logger.notice.mock.calls).toEqual([[noticeFor('sandboxes')]])
})

test('agents and web apps: agents mode runs, with the notice', async () => {
  const dev = makeDev({ agents: { bot: {} }, webApps: { api: {} } })
  const start = jest.spyOn(dev, 'startAgentsDevMode').mockResolvedValue()
  await dev.dev()
  expect(start).toHaveBeenCalled()
  expect(logger.notice.mock.calls).toEqual([[noticeFor('agents')]])
})

test('sandboxes without web apps prints no notice', async () => {
  const dev = makeDev({ sandboxes: { box: {} } })
  jest.spyOn(dev, 'startSandboxesDevMode').mockResolvedValue(undefined)
  await dev.dev()
  expect(logger.notice).not.toHaveBeenCalled()
})
