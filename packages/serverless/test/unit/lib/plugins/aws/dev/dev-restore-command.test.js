import { jest } from '@jest/globals'

// A Dev Mode session leaves the stage instrumented until the service is
// deployed again. The session tells the developer (and every instrumented
// function tells its caller) how: the deploy command for the stage, region and
// Compose service the session used. A plain `serverless deploy` would deploy
// the default stage instead, and from a Compose root every service.
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  aside: jest.fn(),
  blankLine: jest.fn(),
  logoDevMode: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    ...logger,
    get: jest.fn(() => logger),
  },
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
jest.unstable_mockModule('aws-iot-device-sdk', () => ({ default: {} }))
jest.unstable_mockModule('chokidar', () => ({
  default: { watch: jest.fn(() => ({ on: jest.fn() })) },
}))

const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')

function buildDev({ compose } = {}) {
  const options = { stage: 'alex', region: 'eu-west-1' }
  const serverless = new Serverless({ commands: [], options })
  serverless.cli = { log: jest.fn() }
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.processedInput = { commands: ['dev'], options }
  serverless.configurationInput = {}
  serverless.service.service = 'users-api'
  serverless.service.serviceObject = { name: 'users-api' }
  serverless.service.provider.name = 'aws'
  serverless.service.provider.runtime = 'nodejs24.x'
  serverless.service.provider.compiledCloudFormationTemplate = {
    Resources: {},
    Outputs: {},
  }
  if (compose) Object.assign(serverless.compose, compose)
  serverless.setProvider('aws', new AwsProvider(serverless, options))
  serverless.service.functions = {
    getUser: {
      handler: 'src/users.getUser',
      environment: { USERS_TABLE: 'users' },
    },
  }
  serverless.getProvider('aws').request = jest.fn(async () => ({
    endpointAddress: 'iot.example',
  }))
  return { serverless, dev: new AwsDev(serverless, options) }
}

describe('dev mode: the command that restores the stage', () => {
  it('names the session stage and region', () => {
    const { dev } = buildDev()
    expect(dev.restoreCommand()).toBe(
      'serverless deploy --stage alex --region eu-west-1',
    )
  })

  it('names the Compose service when the session runs within Compose', () => {
    const { dev } = buildDev({
      compose: { isWithinCompose: true, serviceName: 'api' },
    })
    expect(dev.restoreCommand()).toBe(
      'serverless deploy --service=api --stage alex --region eu-west-1',
    )
  })

  it('passes the command to every instrumented function, and restore() takes it away', async () => {
    const { serverless, dev } = buildDev({
      compose: { isWithinCompose: true, serviceName: 'api' },
    })
    await dev.update()
    const { environment } = serverless.service.getFunction('getUser')
    expect(environment.SLS_RESTORE_COMMAND).toBe(
      'serverless deploy --service=api --stage alex --region eu-west-1',
    )
    expect(environment.USERS_TABLE).toBe('users')

    await dev.restore()
    expect(serverless.service.getFunction('getUser').environment).toEqual({
      USERS_TABLE: 'users',
    })
  })
})
