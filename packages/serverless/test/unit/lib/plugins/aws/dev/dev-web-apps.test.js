import { jest } from '@jest/globals'

// `serverless dev` does not run web apps in v1: a service whose only compute
// is web apps stops with a message; any other service runs as before and says
// once that its web apps are not part of the session.
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

const NOTICE =
  'Web apps are not part of serverless dev yet; start their servers locally.'

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

test('a service whose only compute is web apps stops with the v1 message', async () => {
  const dev = makeDev({ webApps: { api: {} } })
  await expect(dev.dev()).rejects.toMatchObject({
    code: 'WEB_APPS_DEV_NOT_SUPPORTED',
    message:
      "serverless dev does not run web apps yet; support is planned. Start your web app's server locally to develop it.",
  })
  expect(runDevCommand).not.toHaveBeenCalled()
})

test('functions and web apps: functions mode runs, with one notice line', async () => {
  const dev = makeDev({ functions: { hello: {} }, webApps: { api: {} } })
  await dev.dev()
  expect(runDevCommand).toHaveBeenCalledTimes(1)
  expect(logger.notice.mock.calls).toEqual([[NOTICE]])
})

test('sandboxes and web apps: sandbox mode runs, with the notice', async () => {
  const dev = makeDev({ sandboxes: { box: {} }, webApps: { api: {} } })
  const start = jest
    .spyOn(dev, 'startSandboxesDevMode')
    .mockResolvedValue(undefined)
  await dev.dev()
  expect(start).toHaveBeenCalled()
  expect(logger.notice.mock.calls).toEqual([[NOTICE]])
})

test('agents and web apps: agents mode runs, with the notice', async () => {
  const dev = makeDev({ agents: { bot: {} }, webApps: { api: {} } })
  const start = jest.spyOn(dev, 'startAgentsDevMode').mockResolvedValue()
  await dev.dev()
  expect(start).toHaveBeenCalled()
  expect(logger.notice.mock.calls).toEqual([[NOTICE]])
})

test('a service without web apps prints no notice', async () => {
  const dev = makeDev({ functions: { hello: {} } })
  await dev.dev()
  expect(runDevCommand).toHaveBeenCalledTimes(1)
  expect(logger.notice).not.toHaveBeenCalledWith(NOTICE)
})
