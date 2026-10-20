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

test('a failing metadata lookup does not report a successful run twice, or as failed', async () => {
  const runner = new FakeRunner()
  let finalizeError
  await finalize(finalizeParams(runner)).catch((error) => {
    finalizeError = error
  })
  // The failure stays in its own task: the metadata step is the one that fails.
  expect(finalizeError?.message).toContain('AWS account could not be resolved')
  expect(saveMeta).not.toHaveBeenCalled()

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

  expect(analysisEvents()).toHaveLength(1)
  expect(analysisEvents()[0].event.actionSucceeded).toBe(true)
  expect(analysisEvents()[0].event).not.toHaveProperty('error')
  expect(platformEventClient.publishEventBatches).toHaveBeenCalledTimes(1)
})

test('a finalize failure before the run was reported still sends one event', async () => {
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

test('a failure while queuing the analysis event starts no finalize task', async () => {
  const runner = new FakeRunner()
  runner.getAnalysisEventDetails = () => {
    throw new Error('details unavailable')
  }
  runner.getDeploymentEventDetails = jest.fn(async () => null)
  await expect(finalize(finalizeParams(runner))).rejects.toThrow(
    'details unavailable',
  )
  expect(runner.getDeploymentEventDetails).not.toHaveBeenCalled()
  expect(platformEventClient.publishEventBatches).not.toHaveBeenCalled()
  expect(saveMeta).not.toHaveBeenCalled()
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
