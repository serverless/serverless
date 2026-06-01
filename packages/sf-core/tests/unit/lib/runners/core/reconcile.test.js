import { jest } from '@jest/globals'

const mockLog = {
  notice: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  blankLine: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  log: { get: () => mockLog },
  progress: { get: () => ({ notice: jest.fn(), remove: jest.fn() }) },
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options) {
      super(message)
      this.code = code
      this.options = options
    }
  },
  ServerlessErrorCodes: { general: { AUTH_FAILED: 'AUTH_FAILED' } },
  style: {
    bold: Object.assign((s) => s, { underline: (s) => s }),
  },
  getProxyDispatcher: () => undefined,
  addProxyToAwsClient: (client) => client,
}))

jest.unstable_mockModule('@smithy/util-retry', () => ({
  StandardRetryStrategy: class StandardRetryStrategy {},
}))

jest.unstable_mockModule('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: class CloudFormationClient {},
  ListStacksCommand: class ListStacksCommand {},
}))

const { reconcileInstances, getInstancesToReconcile, RECONCILE_BATCH_SIZE } =
  await import('../../../../../src/lib/runners/core/reconcile.js')

const auth = { orgId: 'org-1', accessKeyV1: 'token' }
const buildInstance = (i) => ({
  cftStackId: `arn:aws:cloudformation:us-east-1:111111111111:stack/svc-${i}/abc`,
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('reconcile.js', () => {
  let fetchSpy

  beforeEach(() => {
    Object.values(mockLog).forEach((fn) => fn.mockClear?.())
    fetchSpy = jest.spyOn(global, 'fetch')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('reconcileInstances', () => {
    it('batches a 250-instance reconcile into 3 POSTs of 100/100/50', async () => {
      fetchSpy.mockResolvedValue({ ok: true })

      const instancesToReconcile = Array.from({ length: 250 }, (_, i) =>
        buildInstance(i),
      )

      await reconcileInstances({
        auth,
        instancesToReconcile,
        isQualified: true,
        versionFramework: '4.0.0',
      })

      expect(RECONCILE_BATCH_SIZE).toBe(100)
      expect(fetchSpy).toHaveBeenCalledTimes(3)

      const sentBatchSizes = fetchSpy.mock.calls.map(
        ([, init]) => JSON.parse(init.body).instances.length,
      )
      expect(sentBatchSizes).toEqual([100, 100, 50])
    })

    it('sends one batch when total instances <= RECONCILE_BATCH_SIZE', async () => {
      fetchSpy.mockResolvedValue({ ok: true })

      const instancesToReconcile = Array.from({ length: 50 }, (_, i) =>
        buildInstance(i),
      )

      await reconcileInstances({
        auth,
        instancesToReconcile,
        isQualified: true,
        versionFramework: '4.0.0',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body).instances).toHaveLength(
        50,
      )
    })

    it('throws RECONCILIATION_FAILED and logs partial-success guidance when a mid-batch fails', async () => {
      // Batch 1 OK, batch 2 fails
      fetchSpy
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, statusText: 'Bad Gateway' })

      const instancesToReconcile = Array.from({ length: 150 }, (_, i) =>
        buildInstance(i),
      )

      await expect(
        reconcileInstances({
          auth,
          instancesToReconcile,
          isQualified: true,
          versionFramework: '4.0.0',
        }),
      ).rejects.toMatchObject({
        code: 'RECONCILIATION_FAILED',
        message: expect.stringContaining('batch 2/2'),
      })

      expect(fetchSpy).toHaveBeenCalledTimes(2)

      const partialMsg = mockLog.error.mock.calls.find(([msg]) =>
        msg.includes('Partial reconciliation completed'),
      )
      expect(partialMsg?.[0]).toContain('100')
      expect(partialMsg?.[0]).toContain('150')

      const reRunMsg = mockLog.notice.mock.calls.find(([msg]) =>
        msg.includes('Re-run'),
      )
      expect(reRunMsg?.[0]).toContain('50')
      expect(reRunMsg?.[0]).toContain('skipped automatically')
    })

    it('does not emit partial-success guidance when the first batch fails', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, statusText: 'Bad Gateway' })

      const instancesToReconcile = Array.from({ length: 150 }, (_, i) =>
        buildInstance(i),
      )

      await expect(
        reconcileInstances({
          auth,
          instancesToReconcile,
          isQualified: true,
          versionFramework: '4.0.0',
        }),
      ).rejects.toMatchObject({ code: 'RECONCILIATION_FAILED' })

      expect(mockLog.error).not.toHaveBeenCalled()
    })
  })

  describe('getInstancesToReconcile', () => {
    const instanceInRegion = (region, stackId) => ({
      cftStackId: `arn:aws:cloudformation:${region}:111111111111:stack/svc/${stackId}`,
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    it('excludes instances whose region is in failedRegions even when no matching stack is found', () => {
      const instances = [
        instanceInRegion('us-east-1', 'a'),
        instanceInRegion('eu-west-1', 'b'),
      ]
      const stacks = [] // both would otherwise be considered "deleted"

      const result = getInstancesToReconcile(instances, stacks, ['eu-west-1'])

      expect(result).toHaveLength(1)
      expect(result[0].cftStackId).toContain(':us-east-1:')
    })

    it('includes instances whose CFN stack is DELETE_COMPLETE and uses stack DeletionTime', () => {
      const instance = instanceInRegion('us-east-1', 'a')
      const stacks = [
        {
          StackId: instance.cftStackId,
          StackStatus: 'DELETE_COMPLETE',
          DeletionTime: '2026-04-01T12:00:00.000Z',
        },
      ]

      const result = getInstancesToReconcile([instance], stacks, [])

      expect(result).toHaveLength(1)
      expect(result[0].updatedAt).toBe('2026-04-01T12:00:00.000Z')
    })

    it('falls back to createdAt+1 day when stack is missing entirely', () => {
      const instance = instanceInRegion('us-east-1', 'a')

      const result = getInstancesToReconcile([instance], [], [])

      expect(result).toHaveLength(1)
      expect(result[0].updatedAt).toBe('2026-01-02T00:00:00.000Z')
    })
  })
})
