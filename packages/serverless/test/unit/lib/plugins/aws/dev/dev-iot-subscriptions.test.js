import { afterEach, describe, expect, it, jest } from '@jest/globals'

// Dev mode receives invocations over AWS IoT. AWS IoT Core allows 50 subscriptions
// per connection and the IoT device SDK queues at most 50 while offline, so dev mode
// must not subscribe once per function: a service with 26+ functions lost the rest.
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

const devices = []

// The SDK's offline queue and the AWS IoT Core per-connection quota both stop at
// 50 subscriptions; the fake drops the rest the same way.
const MAX_SUBSCRIPTIONS = 50

// MQTT topic filter matching, limited to the single-level "+" wildcard.
const topicMatches = (filter, topic) => {
  const filterLevels = filter.split('/')
  const topicLevels = topic.split('/')
  return (
    filterLevels.length === topicLevels.length &&
    filterLevels.every((level, i) => level === '+' || level === topicLevels[i])
  )
}

class FakeDevice {
  constructor() {
    this.handlers = {}
    this.subscriptions = []
    devices.push(this)
  }
  on(event, handler) {
    this.handlers[event] = handler
  }
  subscribe(topic, options) {
    if (this.subscriptions.length >= MAX_SUBSCRIPTIONS) {
      this.handlers.error?.(
        new Error('Maximum queued offline subscription reached'),
      )
      return
    }
    this.subscriptions.push({ topic, options })
  }
  publish() {}
  // Like the broker, delivers a message only when a subscription matches its topic.
  async receive(topic, payload) {
    if (this.subscriptions.some(({ topic: f }) => topicMatches(f, topic))) {
      await this.handlers.message(topic, Buffer.from(JSON.stringify(payload)))
    }
  }
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

function buildDev(functionCount) {
  const options = { stage: 'alex', region: 'us-east-1' }
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
  serverless.service.functions = Object.fromEntries(
    Array.from({ length: functionCount }, (_, i) => [
      `fn${i + 1}`,
      { handler: `src/fn${i + 1}.handler` },
    ]),
  )
  const dev = new AwsDev(serverless, options)
  dev.getIotEndpoint = jest.fn(async () => 'iot.example')
  dev.provider.getCredentials = jest.fn(async () => ({
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
  }))
  return dev
}

async function connect(dev) {
  // connect() registers SIGINT/SIGTERM handlers; keep them off the real process.
  jest.spyOn(process, 'on').mockImplementation(() => process)
  await dev.connect()
  return devices.at(-1)
}

afterEach(() => {
  jest.restoreAllMocks()
  logger.error.mockClear()
  devices.length = 0
})

describe('dev mode IoT subscriptions', () => {
  it('subscribes with two wildcard topics, however many functions the service has', async () => {
    const dev = buildDev(30)
    const device = await connect(dev)

    expect(device.subscriptions).toEqual([
      { topic: 'sls/us-east-1/users-api/alex/+/request', options: { qos: 1 } },
      { topic: 'sls/us-east-1/users-api/alex/+/error', options: { qos: 1 } },
    ])
    clearInterval(dev.heartbeatInterval)
  })

  it('handles messages for functions beyond the 25th', async () => {
    const dev = buildDev(30)
    const device = await connect(dev)

    await device.receive('sls/us-east-1/users-api/alex/fn30/error', {
      error: 'fn30 payload too large',
    })

    expect(logger.error).toHaveBeenCalledWith('fn30 payload too large')
    clearInterval(dev.heartbeatInterval)
  })

  it('ignores invocations of functions the service does not define', async () => {
    const dev = buildDev(30)
    const device = await connect(dev)

    // The wildcard also matches functions missing from the local configuration,
    // e.g. ones another session deployed to the same stage.
    await expect(
      device.receive('sls/us-east-1/users-api/alex/ghost/request', {
        event: {},
        environment: {},
        context: { awsRequestId: 'request-1' },
      }),
    ).resolves.toBeUndefined()

    expect(logger.error).not.toHaveBeenCalled()
    clearInterval(dev.heartbeatInterval)
  })
})
