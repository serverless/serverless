import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { jest, expect, test, beforeEach, afterEach } from '@jest/globals'

const saveMeta = jest.fn(async () => {})
jest.unstable_mockModule('../../../../src/lib/meta/index.js', () => ({
  default: saveMeta,
}))

const { platformEventClient } = await import('@serverless/util')
const { forcedExit } = await import('@serverless/util/src/forced-exit/index.js')
const { route } = await import('../../../../src/lib/router.js')
const { TraditionalRunner } =
  await import('../../../../src/lib/runners/framework.js')

const authenticatedData = {
  accessKeyV1: 'key',
  orgId: 'org',
  orgName: 'org-name',
  userId: 'user',
  userName: 'user-name',
}

let serviceDir
let published
beforeEach(() => {
  serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exit-reason-'))
  fs.writeFileSync(
    path.join(serviceDir, 'serverless.yml'),
    'service: svc\nprovider:\n  name: aws\n  region: us-east-1\n',
  )
  published = []
  let queued = []
  jest
    .spyOn(platformEventClient, 'addToPublishBatch')
    .mockImplementation((event) => queued.push(event))
  jest
    .spyOn(platformEventClient, 'publishEventBatches')
    .mockImplementation(async () => {
      published.push(...queued)
      queued = []
    })
  jest
    .spyOn(TraditionalRunner.prototype, 'getMetadataToSave')
    .mockImplementation(async () => ({}))
  jest
    .spyOn(TraditionalRunner.prototype, 'getUsageEventDetails')
    .mockImplementation(async () => ({ service: { serviceName: 'svc' } }))
  jest
    .spyOn(TraditionalRunner.prototype, 'getAnalysisEventDetails')
    .mockImplementation(() => ({}))
})
afterEach(() => {
  jest.restoreAllMocks()
  fs.rmSync(serviceDir, { recursive: true, force: true })
})

const runDev = () =>
  route({
    command: ['dev'],
    options: {},
    versions: { serverless_framework: '4.99.0' },
    compose: { workingDir: serviceDir },
  })

const analysisEvents = () =>
  published
    .filter(({ source }) => source === 'sfcore.analysis.generated.v1')
    .map(({ event }) => event)

test('a session that returns exit code 3 with a reason reports the reason as the error code', async () => {
  jest
    .spyOn(TraditionalRunner.prototype, 'run')
    .mockImplementation(async function () {
      this.authenticatedData = authenticatedData
      return {
        authenticatedData,
        exitCode: 3,
        exitReason: 'DEV_MODE_RESTORE_INCOMPLETE',
      }
    })
  await runDev()
  const events = analysisEvents()
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    actionName: 'dev',
    actionSucceeded: false,
    error: {
      name: 'ExitCode',
      message: 'The command ended with exit code 3.',
      code: 'DEV_MODE_RESTORE_INCOMPLETE',
    },
  })
  expect(events[0].error).not.toHaveProperty('stacktrace')
})

test.each(['DEV_MODE_FORCED_STOP', 'DEV_MODE_RESTORE_TIMEOUT'])(
  'a forced exit 3 (%s) sends one event with its reason as the error code',
  async (exitReason) => {
    const exits = []
    jest
      .spyOn(TraditionalRunner.prototype, 'run')
      .mockImplementation(async function () {
        this.authenticatedData = authenticatedData
        // As Dev Mode does: the exit runs while the command is still running, and never returns
        // to the CLI (the fake process records the exit instead).
        void forcedExit({
          code: 3,
          exitReason,
          processRef: { exit: (code) => exits.push(code) },
        })
        return new Promise(() => {})
      })
    // The route waits for the command; the forced exit has sent the event by the time it exits.
    void runDev()
    await new Promise((resolve) => {
      const check = () => (exits.length ? resolve() : setImmediate(check))
      check()
    })
    expect(exits).toEqual([3])
    const events = analysisEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      actionName: 'dev',
      actionSucceeded: false,
      error: { name: 'ExitCode', code: exitReason },
    })
  },
)
