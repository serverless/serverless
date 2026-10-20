import { jest, expect, test, beforeEach, afterEach } from '@jest/globals'

const saveMeta = jest.fn(async () => {})
jest.unstable_mockModule('../../../../src/lib/meta/index.js', () => ({
  default: saveMeta,
}))

const { platformEventClient, log } = await import('@serverless/util')
const { finalize, handleFinalizationError } =
  await import('../../../../src/lib/router.js')
const { TraditionalRunner } =
  await import('../../../../src/lib/runners/framework.js')

const accountLookupError = () =>
  Object.assign(new Error('AWS account could not be resolved'), {
    code: 'AWS_ACCOUNT_ID_RESOLUTION_FAILED',
  })

const authenticatedData = {
  accessKeyV1: 'key',
  orgId: 'org',
  orgName: 'org-name',
  userId: 'user',
  userName: 'user-name',
}

// A runner whose command succeeded and whose metadata lookup fails, as the
// framework runner's did without working AWS credentials.
class FakeRunner {
  static runnerType = 'traditional'
  authenticatedData = authenticatedData
  getAnalysisEventDetails() {
    return {}
  }
  async getDeploymentEventDetails() {
    return null
  }
  async getUsageEventDetails() {
    return {}
  }
  async getMetadataToSave() {
    throw accountLookupError()
  }
}

const finalizeParams = (runner) => ({
  logger: log.get('test'),
  versionFramework: '4.99.0',
  command: ['print'],
  commandStartTime: Date.now(),
  options: {},
  configData: {
    config: { service: 'svc' },
    configFilePath: '/tmp/svc/serverless.yml',
    configFileRaw: '',
  },
  runnerData: { runner, runnerResult: {}, runnerError: undefined },
})

let queued
beforeEach(() => {
  queued = []
  jest
    .spyOn(platformEventClient, 'addToPublishBatch')
    .mockImplementation((event) => queued.push(event))
  jest
    .spyOn(platformEventClient, 'publishEventBatches')
    .mockImplementation(async () => {})
  saveMeta.mockClear()
})
afterEach(() => jest.restoreAllMocks())

const analysisEvents = () =>
  queued.filter(({ source }) => source === 'sfcore.analysis.generated.v1')

test('a failing metadata step fails its own task and is reported as a separate failed event', async () => {
  const runner = new FakeRunner()
  let finalizeError
  await finalize(finalizeParams(runner)).catch((error) => {
    finalizeError = error
  })
  // The failure stays in its own task: the run's event is still published.
  expect(finalizeError?.message).toMatch(
    /^Sending events failed: AWS account could not be resolved/,
  )
  expect(saveMeta).not.toHaveBeenCalled()
  expect(platformEventClient.publishEventBatches).toHaveBeenCalledTimes(1)

  // The router hands any finalize failure to the error handler.
  await handleFinalizationError({
    versionFramework: '4.99.0',
    command: ['print'],
    commandStartTime: Date.now(),
    options: {},
    configFilePath: '/tmp/svc/serverless.yml',
    authenticatedData,
    runner,
    error: finalizeError,
  })

  expect(analysisEvents()).toHaveLength(2)
  expect(analysisEvents()[0].event.actionSucceeded).toBe(true)
  expect(analysisEvents()[0].event).not.toHaveProperty('error')
  expect(analysisEvents()[1].event.actionSucceeded).toBe(false)
  expect(platformEventClient.publishEventBatches).toHaveBeenCalledTimes(2)
})

test('a finalize failure before the run was reported sends one failed event', async () => {
  const runner = new FakeRunner()
  await handleFinalizationError({
    versionFramework: '4.99.0',
    command: ['print'],
    commandStartTime: Date.now(),
    options: {},
    authenticatedData,
    runner,
    error: new Error('boom'),
  })
  expect(analysisEvents()).toHaveLength(1)
  expect(analysisEvents()[0].event.actionSucceeded).toBe(false)
  expect(platformEventClient.publishEventBatches).toHaveBeenCalledTimes(1)
})

test("a failing usage event still publishes the run's analysis event", async () => {
  const runner = new FakeRunner()
  runner.getMetadataToSave = async () => ({})
  runner.getUsageEventDetails = async () => {
    throw accountLookupError()
  }
  const params = finalizeParams(runner)
  params.runnerData.runnerResult = { serviceUniqueId: 'stack-id' }
  const finalizeError = await finalize(params).catch((error) => error)
  expect(finalizeError?.message).toContain('AWS account could not be resolved')
  expect(platformEventClient.publishEventBatches).toHaveBeenCalledTimes(1)
  expect(analysisEvents()).toHaveLength(1)
  expect(analysisEvents()[0].event.actionSucceeded).toBe(true)
})

test('without sign-in data, the usage error is reported rather than the failed publish', async () => {
  const runner = new FakeRunner()
  runner.authenticatedData = undefined
  runner.getMetadataToSave = async () => ({})
  const finalizeError = await finalize(finalizeParams(runner)).catch(
    (error) => error,
  )
  expect(finalizeError?.message).toBe(
    'Sending events failed: No authenticated data found',
  )
})

test('a failure while building the analysis event still sends the usage event, deployment record and metadata', async () => {
  const runner = new FakeRunner()
  runner.getAnalysisEventDetails = () => {
    throw new Error('details unavailable')
  }
  runner.getDeploymentEventDetails = jest.fn(async () => null)
  runner.getMetadataToSave = async () => ({})
  const params = finalizeParams(runner)
  params.runnerData.runnerResult = { serviceUniqueId: 'stack-id' }
  await expect(finalize(params)).rejects.toThrow(
    /^Sending events failed: details unavailable/,
  )
  expect(runner.getDeploymentEventDetails).toHaveBeenCalled()
  expect(saveMeta).toHaveBeenCalled()
  expect(platformEventClient.publishEventBatches).toHaveBeenCalledTimes(1)
  expect(analysisEvents()).toHaveLength(0)
  expect(
    queued.filter(({ source }) => source === 'billing.instance.reported.v1'),
  ).toHaveLength(1)
})

// A lookup that failed while the command ran leaves a resolver that throws
// synchronously; one that fails later rejects.
test.each([
  [
    'throws',
    () => {
      throw accountLookupError()
    },
  ],
  [
    'rejects',
    async () => {
      throw accountLookupError()
    },
  ],
])(
  'the framework runner saves its metadata without the AWS account when the account lookup %s',
  async (_, getAwsDeploymentCredentials) => {
    const metadata = await TraditionalRunner.prototype.getMetadataToSave.call({
      getAwsDeploymentCredentials,
      awsCfStack: { stackName: 'svc-dev' },
    })
    expect(metadata.serviceProviderAwsAccountId).toBeUndefined()
    expect(metadata.serviceProviderAwsCfStackName).toBe('svc-dev')
  },
)

test('the framework runner saves the AWS account when the account lookup succeeds', async () => {
  const metadata = await TraditionalRunner.prototype.getMetadataToSave.call({
    getAwsDeploymentCredentials: async () => ({ accountId: '000000000000' }),
  })
  expect(metadata.serviceProviderAwsAccountId).toBe('000000000000')
})
