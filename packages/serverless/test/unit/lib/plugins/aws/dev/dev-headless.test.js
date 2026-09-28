import { afterEach, describe, expect, it, jest } from '@jest/globals'

// `serverless dev` run by an agent or a script: no terminal, so the spinner
// renders nothing, and the session is usually stopped with `kill <pid>`.
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  notice: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  aside: jest.fn(),
  blankLine: jest.fn(),
  logoDevMode: jest.fn(),
  confirm: jest.fn(async () => true),
  isInteractive: jest.fn(() => false),
}

class FakeDevice {
  constructor() {
    this.handlers = {}
  }
  on(event, handler) {
    this.handlers[event] = handler
  }
  subscribe() {}
  publish() {}
}

jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: { ...logger, get: jest.fn(() => logger) },
  progress: { get: jest.fn(() => ({ notice: jest.fn(), remove: jest.fn() })) },
  style: { aside: jest.fn((m) => m), link: jest.fn((url) => url) },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))
jest.unstable_mockModule('aws-iot-device-sdk', () => ({
  default: { device: FakeDevice },
}))
jest.unstable_mockModule('chokidar', () => ({
  default: { watch: jest.fn(() => ({ on: jest.fn() })) },
}))

const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')

function buildDev(extraOptions = {}) {
  const options = { stage: 'alex', region: 'us-east-1', ...extraOptions }
  const serverless = new Serverless({ commands: [], options })
  serverless.cli = { log: jest.fn() }
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.processedInput = { commands: ['dev'], options }
  serverless.configurationInput = {}
  serverless.service.service = 'users-api'
  serverless.service.serviceObject = { name: 'users-api' }
  serverless.service.provider.name = 'aws'
  serverless.service.provider.runtime = 'nodejs24.x'
  serverless.setProvider('aws', new AwsProvider(serverless, options))
  serverless.service.functions = { hello: { handler: 'src/hello.handler' } }
  const dev = new AwsDev(serverless, options)
  dev.getIotEndpoint = jest.fn(async () => 'iot.example')
  dev.provider.getCredentials = jest.fn(async () => ({
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
  }))
  return dev
}

afterEach(() => {
  jest.restoreAllMocks()
  logger.notice.mockClear()
  logger.warning.mockClear()
})

describe('dev mode without a terminal', () => {
  it('logs each phase as a notice, since progress lines are hidden at the default level', () => {
    const dev = buildDev()
    const progress = { notice: jest.fn() }
    logger.isInteractive.mockReturnValue(false)
    dev.phase(progress, 'Connecting')
    expect(logger.notice).toHaveBeenCalledWith('Connecting…')
    expect(progress.notice).not.toHaveBeenCalled()
  })

  it('shows the phase on the spinner in a terminal', () => {
    const dev = buildDev()
    const progress = { notice: jest.fn() }
    logger.isInteractive.mockReturnValue(true)
    const isTTY = process.stderr.isTTY
    process.stderr.isTTY = true
    try {
      dev.phase(progress, 'Connecting')
    } finally {
      process.stderr.isTTY = isTTY
    }
    expect(progress.notice).toHaveBeenCalledWith('Connecting')
    expect(logger.notice).not.toHaveBeenCalled()
  })

  it('SIGTERM ends the session like Ctrl+C: once, with the restore command', async () => {
    const dev = buildDev()
    const handlers = {}
    jest.spyOn(process, 'on').mockImplementation((event, handler) => {
      handlers[event] = handler
      return process
    })
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {})

    await dev.connect()
    expect(handlers.SIGTERM).toBe(handlers.SIGINT)

    await handlers.SIGTERM()
    await handlers.SIGINT()
    expect(exit).toHaveBeenCalledTimes(1)
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'run "serverless deploy --stage alex --region us-east-1"',
      ),
    )
    clearInterval(dev.heartbeatInterval)
  })

  // A prompt nobody can answer would keep the process alive until SIGKILL.
  it('with --on-exit=remove and no terminal: skips the removal instead of prompting', async () => {
    const dev = buildDev({ 'on-exit': 'remove' })
    logger.isInteractive.mockReturnValue(false)
    const handlers = {}
    jest.spyOn(process, 'on').mockImplementation((event, handler) => {
      handlers[event] = handler
      return process
    })
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {})
    const spawn = jest.spyOn(dev.serverless.pluginManager, 'spawn')

    await dev.connect()
    await handlers.SIGTERM()
    expect(logger.confirm).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalledWith('remove')
    expect(exit).toHaveBeenCalledTimes(1)
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining('Removal skipped'),
    )
    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Run "serverless deploy --stage alex --region us-east-1"',
      ),
    )
    clearInterval(dev.heartbeatInterval)
  })
})
