import { describe, it, expect, jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: { info: jest.fn() },
}))

const cleanupMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/cleanup-s3-bucket.js')
).default

const buildCtx = ({ referenceMode, emptyChangeSet = false }) => ({
  ...cleanupMixin,
  provider: {
    isReferenceCodeStorageMode: () => referenceMode,
    getStage: () => 'dev',
    getDeploymentPrefix: () => 'serverless',
    request: jest.fn(async () => ({ Contents: [] })),
  },
  bucketName: 'bucket',
  serverless: {
    service: {
      service: 'svc',
      package: { artifactDirectoryName: 'serverless/svc/dev/123' },
      provider: { deploymentWithEmptyChangeSet: emptyChangeSet },
    },
  },
})

describe('cleanupS3Bucket — reference mode', () => {
  it('skips cleanup entirely in reference mode', async () => {
    const ctx = buildCtx({ referenceMode: true })
    await ctx.cleanupS3Bucket()
    expect(ctx.provider.request).not.toHaveBeenCalled()
  })

  it('still cleans the current deploy artifacts on an empty change set', async () => {
    const ctx = buildCtx({ referenceMode: true, emptyChangeSet: true })
    const dir = '1690000000000-2026-07-22T10:00:00.000Z'
    ctx.serverless.service.package.artifactDirectoryName = `serverless/svc/dev/${dir}`
    ctx.provider.request = jest.fn(async (service, method) => {
      if (method === 'listObjectsV2') {
        return {
          Contents: [
            { Key: `serverless/svc/dev/${dir}/compiled-template.json` },
            { Key: `serverless/svc/dev/${dir}/svc.zip` },
          ],
        }
      }
      return {}
    })

    await ctx.cleanupS3Bucket()

    // Lists only the current deploy's directory, and deletes exactly its
    // objects — never anything from other deployments.
    expect(ctx.provider.request).toHaveBeenCalledWith('S3', 'listObjectsV2', {
      Bucket: 'bucket',
      Prefix: `serverless/svc/dev/${dir}`,
    })
    expect(ctx.provider.request).toHaveBeenCalledWith('S3', 'deleteObjects', {
      Bucket: 'bucket',
      Delete: {
        Objects: [
          { Key: `serverless/svc/dev/${dir}/compiled-template.json` },
          { Key: `serverless/svc/dev/${dir}/svc.zip` },
        ],
      },
    })
  })

  it('runs today’s cleanup in copy mode', async () => {
    const ctx = buildCtx({ referenceMode: false })
    // Six deployment directories, oldest first; the default retention window
    // (maxPreviousDeploymentArtifacts: 5) must remove only the oldest one.
    const dirs = [1, 2, 3, 4, 5, 6].map(
      (n) => `169000000000${n}-2026-07-22T10:00:0${n}.000Z`,
    )
    ctx.provider.request = jest.fn(async (service, method) => {
      if (method === 'listObjectsV2') {
        return {
          Contents: dirs.map((dir) => ({
            Key: `serverless/svc/dev/${dir}/svc.zip`,
          })),
        }
      }
      return {}
    })

    await ctx.cleanupS3Bucket()

    expect(ctx.provider.request).toHaveBeenCalledWith('S3', 'listObjectsV2', {
      Bucket: 'bucket',
      Prefix: 'serverless/svc/dev',
    })
    expect(ctx.provider.request).toHaveBeenCalledWith('S3', 'deleteObjects', {
      Bucket: 'bucket',
      Delete: {
        Objects: [{ Key: `serverless/svc/dev/${dirs[0]}/svc.zip` }],
      },
    })
  })
})
