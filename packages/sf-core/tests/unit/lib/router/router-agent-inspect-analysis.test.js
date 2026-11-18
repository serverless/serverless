import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { jest, expect, test, beforeEach, afterEach } from '@jest/globals'

const saveMeta = jest.fn(async () => {})
jest.unstable_mockModule('../../../../src/lib/meta/index.js', () => ({
  default: saveMeta,
}))

const { platformEventClient } = await import('@serverless/util')
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
  serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-inspect-'))
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
    .mockImplementation(async ({ accessKey } = {}) => {
      if (!accessKey) throw new Error('Not authenticated')
      published.push(...queued)
      queued = []
    })
  // The delegated framework run signs in on its own runner and finds the stack.
  jest
    .spyOn(TraditionalRunner.prototype, 'run')
    .mockImplementation(async function () {
      this.authenticatedData = authenticatedData
      return { authenticatedData, serviceUniqueId: 'stack-id' }
    })
  jest
    .spyOn(TraditionalRunner.prototype, 'getMetadataToSave')
    .mockImplementation(async () => ({}))
  jest
    .spyOn(TraditionalRunner.prototype, 'getUsageEventDetails')
    .mockImplementation(async () => ({ service: { serviceName: 'svc' } }))
})
afterEach(() => {
  jest.restoreAllMocks()
  fs.rmSync(serviceDir, { recursive: true, force: true })
})

// Compose runs `serverless <service> agent inspect` through the same route,
// once per service, with the service's Compose context.
test.each([
  ['in a service directory', {}],
  ['for one service of a Compose project', { isWithinCompose: true }],
])(
  '`agent inspect` %s, delegated to the framework runner, sends its analysis and usage events once',
  async (_, compose) => {
    const result = await route({
      command: ['agent', 'inspect'],
      options: {},
      versions: { serverless_framework: '4.99.0' },
      compose: {
        workingDir: serviceDir,
        ...(compose.isWithinCompose && {
          isWithinCompose: true,
          serviceName: 'svc',
          params: {},
          serviceParams: {},
        }),
      },
    })
    expect(TraditionalRunner.prototype.run).toHaveBeenCalledTimes(1)
    expect(result.serviceUniqueId).toBe('stack-id')

    const analysis = published.filter(
      ({ source }) => source === 'sfcore.analysis.generated.v1',
    )
    expect(analysis).toHaveLength(1)
    expect(analysis[0].event).toMatchObject({
      actionName: 'agent-inspect',
      actionSucceeded: true,
      orgId: 'org',
      isCompose: Boolean(compose.isWithinCompose),
    })
    const usage = published.filter(
      ({ source }) => source === 'billing.instance.reported.v1',
    )
    expect(usage).toHaveLength(1)
    expect(usage[0].event).toMatchObject({ orgId: 'org' })
  },
)
