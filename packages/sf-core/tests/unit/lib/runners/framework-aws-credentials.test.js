/**
 * Which commands look up AWS credentials and the account before they run, and what they hand the
 * Framework. Every command but the five Dev Mode commands that read only the local session state
 * reads the credentials, resolves the account through AWS STS, looks the stack up and reports the
 * account and stack in its usage event. Those five read only the region.
 *
 * The AWS credential resolver is the one the resolver manager holds (as in a real run), the
 * Framework and the stack lookup are stand-ins: nothing here calls AWS.
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { ServerlessError } from '@serverless/util'

const STACK_ID = 'arn:aws:cloudformation:eu-west-1:ACCOUNT:stack/orders-dev/1'

// What the Framework was started with, one entry per run.
const started = []
class FakeServerless {
  constructor(args) {
    started.push(args)
    this.pluginManager = {
      externalPlugins: new Set(),
      cliOptions: {},
      lifecycleEventDurations: {},
    }
    this.processedInput = {}
    this.service = {}
  }

  async init() {}

  async run() {}
}
const describeStack = jest.fn(async (stackName) => ({
  StackId: STACK_ID,
  StackName: stackName,
  CreationTime: new Date('2026-10-01T00:00:00Z'),
  StackStatus: 'UPDATE_COMPLETE',
}))

jest.unstable_mockModule('@serverless/framework', () => ({
  default: FakeServerless,
}))
jest.unstable_mockModule(
  '@serverless/engine/src/lib/aws/cloudformation.js',
  () => ({
    AwsCloudformationService: class {
      describeStack(stackName) {
        return describeStack(stackName)
      }
    },
  }),
)

// Importing router.js first resolves a circular-import ordering between the runners.
await import('../../../../src/lib/router.js')
const { TraditionalRunner } =
  await import('../../../../src/lib/runners/framework.js')

// The AWS credential resolver: `resolveVariable({ key: 'accountId' })` is the STS call.
const resolver = {
  resolveRegion: jest.fn(() => 'eu-west-1'),
  resolveVariable: jest.fn(async ({ key }) =>
    key === 'accountId' ? 'ACCOUNT' : undefined,
  ),
  credentials: jest.fn(async () => ({
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
  })),
  // Where the credentials come from, as the resolver describes it without any call.
  credentialSource: jest.fn(() => ({ source: 'dashboard' })),
}

// Every field the Framework was started with before it was told the credential source.
const FRAMEWORK_FIELDS = [
  'accessKey',
  'commands',
  'compose',
  'credentialProviders',
  'instanceId',
  'options',
  'orgId',
  'orgName',
  'region',
  'service',
  'serviceConfigFileName',
  'servicePath',
  'version',
]

beforeEach(() => {
  started.length = 0
  describeStack.mockClear()
  resolver.resolveRegion.mockClear()
  resolver.resolveVariable.mockClear()
  resolver.credentials.mockClear()
})

const runnerFor = (command, options = {}) => {
  const runner = new TraditionalRunner({
    versionFramework: '4.0.0',
    command,
    options,
    config: {
      service: 'orders',
      provider: { name: 'aws', region: 'eu-west-1' },
    },
    configFilePath: '/services/orders/serverless.yml',
    stage: 'dev',
    resolverManager: {
      credentialResolverName: 'aws',
      resolverProviders: { aws: { instance: resolver } },
      resolveVariableOnce: async () => 'instance-id',
      resolveAndReplacePlaceholdersInConfig: async () => {},
      loadPlaceholders: async () => {},
    },
  })
  runner.resolveVariablesAndAuthenticate = async () => ({})
  runner.resolveVariables = async () => {}
  return runner
}

const stsCalls = () =>
  resolver.resolveVariable.mock.calls.filter(([{ key }]) => key === 'accountId')
    .length

describe.each([
  [['deploy'], {}],
  [['info'], {}],
  [['dev'], {}],
  // A session in the background and a dry run start like a foreground session.
  [['dev'], { detach: true }],
  [['dev'], { 'dry-run': true }],
])(
  '%j with options %j looks up the credentials and the account',
  (command, options) => {
    test('it reads the credentials, calls STS, looks the stack up and hands both to the Framework', async () => {
      const runner = runnerFor([...command], options)
      const result = await runner.run()
      expect(stsCalls()).toBeGreaterThan(0)
      expect(resolver.credentials).toHaveBeenCalled()
      expect(describeStack).toHaveBeenCalledWith('orders-dev')
      expect(result.serviceUniqueId).toBe(STACK_ID)
      expect(started).toHaveLength(1)
      expect(started[0].region).toBe('eu-west-1')
      expect(await started[0].credentialProviders.aws()).toMatchObject({
        accessKeyId: 'AKIDEXAMPLE',
        accountId: 'ACCOUNT',
        region: 'eu-west-1',
      })
      expect(typeof runner.getAwsDeploymentCredentials).toBe('function')
    })

    test('the Framework is told where the credentials come from, in one field added to the others', async () => {
      const runner = runnerFor([...command], options)
      await runner.run()
      expect(started[0].awsCredentialSource).toEqual({ source: 'dashboard' })
      expect(Object.keys(started[0]).sort()).toEqual(
        [...FRAMEWORK_FIELDS, 'awsCredentialSource'].sort(),
      )
    })

    test('its usage event names the account and the stack', async () => {
      const runner = runnerFor([...command], options)
      await runner.run()
      const details = await runner.getUsageEventDetails()
      expect(details.service).toMatchObject({
        awsAccountId: 'ACCOUNT',
        serviceName: 'orders',
        regionName: 'eu-west-1',
        stageName: 'dev',
      })
      expect(details.awsCfStack.awsCfStackId).toBe(STACK_ID)
    })
  },
)

describe.each([
  [['dev', 'status']],
  [['dev', 'stop']],
  [['dev', 'wait']],
  [['dev', 'requests']],
  [['dev', 'replay', '3f2a9c1e']],
])('%j reads only the local session state', (command) => {
  test('it reads neither the credentials nor the account, and no stack', async () => {
    const runner = runnerFor([...command])
    const result = await runner.run()
    expect(stsCalls()).toBe(0)
    expect(resolver.credentials).not.toHaveBeenCalled()
    expect(describeStack).not.toHaveBeenCalled()
    expect(runner.getAwsDeploymentCredentials).toBeUndefined()
    // No stack id: the router sends no usage event for the run.
    expect(result.serviceUniqueId).toBeFalsy()
  })

  test('the Framework gets the same region as every other command', async () => {
    const runner = runnerFor([...command])
    await runner.run()
    expect(resolver.resolveRegion).toHaveBeenCalled()
    expect(started).toHaveLength(1)
    expect(started[0].region).toBe('eu-west-1')
  })

  test('the Framework is told where the credentials come from, with no AWS call', async () => {
    const runner = runnerFor([...command])
    await runner.run()
    expect(started[0].awsCredentialSource).toEqual({ source: 'dashboard' })
    expect(stsCalls()).toBe(0)
    expect(resolver.credentials).not.toHaveBeenCalled()
  })

  test('asking it for AWS credentials fails clearly instead of calling AWS', async () => {
    const runner = runnerFor([...command])
    await runner.run()
    const error = await started[0].credentialProviders.aws().then(
      () => null,
      (reason) => reason,
    )
    expect(error).toBeInstanceOf(ServerlessError)
    expect(error).toMatchObject({ code: 'DEV_MODE_LOCAL_COMMAND_NO_AWS' })
    expect(error.message).toBe(
      `"serverless ${command.slice(0, 2).join(' ')}" reads only the local Dev Mode session and does not use AWS credentials.`,
    )
    expect(stsCalls()).toBe(0)
    expect(resolver.credentials).not.toHaveBeenCalled()
  })
})
