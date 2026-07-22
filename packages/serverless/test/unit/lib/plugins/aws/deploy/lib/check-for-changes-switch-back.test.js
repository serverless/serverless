import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    warning: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn() })),
  },
}))
const { log } = await import('@serverless/util')

const checkForChangesMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/check-for-changes.js')
).default

describe('warnOnReferenceModeSwitchBack', () => {
  beforeEach(() => {
    log.warning.mockClear()
  })

  const buildCtx = ({ referenceMode, previousState }) => ({
    ...checkForChangesMixin,
    provider: { isReferenceCodeStorageMode: () => referenceMode },
    previousDeploymentState: previousState,
  })

  it('warns when the previous deployment used reference mode and current does not', () => {
    const ctx = buildCtx({
      referenceMode: false,
      previousState: {
        service: {
          provider: {
            deploymentBucketObject: { codeStorageMode: 'reference' },
          },
        },
      },
    })
    ctx.warnOnReferenceModeSwitchBack()
    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('reference'),
    )
  })

  it('does not warn when still in reference mode', () => {
    const ctx = buildCtx({
      referenceMode: true,
      previousState: {
        service: {
          provider: {
            deploymentBucketObject: { codeStorageMode: 'reference' },
          },
        },
      },
    })
    ctx.warnOnReferenceModeSwitchBack()
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('does not warn when the previous deployment was copy mode', () => {
    const ctx = buildCtx({
      referenceMode: false,
      previousState: { service: { provider: {} } },
    })
    ctx.warnOnReferenceModeSwitchBack()
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('tolerates a missing previous state', () => {
    const ctx = buildCtx({ referenceMode: false, previousState: null })
    expect(() => ctx.warnOnReferenceModeSwitchBack()).not.toThrow()
  })
})
