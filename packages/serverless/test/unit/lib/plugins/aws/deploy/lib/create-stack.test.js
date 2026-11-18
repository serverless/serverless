import { describe, it, expect, jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: { info: jest.fn() },
  progress: { get: jest.fn(() => ({ notice: jest.fn() })) },
}))

const createStackMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/create-stack.js')
).default

const buildCtx = (describeStacks) => ({
  ...createStackMixin,
  serverless: { service: { provider: {} } },
  provider: {
    naming: { getStackName: () => 'shop-dev' },
    request: jest.fn(describeStacks),
    isS3TransferAccelerationEnabled: () => false,
    isLegacyDeploymentBucketEnabled: false,
  },
})

describe('createStack', () => {
  it('records the status and last update time of an existing stack', async () => {
    const ctx = buildCtx(async () => ({
      Stacks: [
        {
          StackStatus: 'UPDATE_ROLLBACK_COMPLETE',
          CreationTime: new Date('2026-10-01T00:00:00Z'),
          LastUpdatedTime: new Date('2026-10-15T00:00:00Z'),
        },
      ],
    }))

    await ctx.createStack()

    expect(ctx.stackStatus).toBe('UPDATE_ROLLBACK_COMPLETE')
    expect(ctx.stackLastUpdatedTime).toEqual(new Date('2026-10-15T00:00:00Z'))
  })

  it('uses the creation time of a stack never updated', async () => {
    const ctx = buildCtx(async () => ({
      Stacks: [
        {
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date('2026-10-01T00:00:00Z'),
        },
      ],
    }))

    await ctx.createStack()

    expect(ctx.stackLastUpdatedTime).toEqual(new Date('2026-10-01T00:00:00Z'))
  })

  it('records no status when the stack does not exist yet', async () => {
    const ctx = buildCtx(async () => {
      throw new Error('Stack with id shop-dev does not exist')
    })
    ctx.stackStatus = 'UPDATE_COMPLETE'
    ctx.stackLastUpdatedTime = new Date()

    await ctx.createStack()

    expect(ctx.stackStatus).toBeUndefined()
    expect(ctx.stackLastUpdatedTime).toBeUndefined()
    expect(ctx.createLater).toBe(true)
  })
})
