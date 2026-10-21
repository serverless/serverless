import { describe, it, expect, jest } from '@jest/globals'

const logWarning = jest.fn()
jest.unstable_mockModule('@serverless/util', () => ({
  log: { info: jest.fn(), warning: logWarning },
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

describe('cleanupS3Bucket — listing and deleting', () => {
  it('reads every page of the stage prefix', async () => {
    const ctx = buildCtx({ referenceMode: false })
    const dirs = [1, 2, 3, 4, 5, 6].map(
      (n) => `169000000000${n}-2026-07-22T10:00:0${n}.000Z`,
    )
    ctx.provider.request = jest.fn(async (service, method, params) => {
      if (method !== 'listObjectsV2') return {}
      // the oldest folder is on the first page, the rest on the second
      return params.ContinuationToken
        ? {
            Contents: dirs
              .slice(1)
              .map((dir) => ({ Key: `serverless/svc/dev/${dir}/svc.zip` })),
          }
        : {
            Contents: [{ Key: `serverless/svc/dev/${dirs[0]}/svc.zip` }],
            IsTruncated: true,
            NextContinuationToken: 'next',
          }
    })

    await ctx.cleanupS3Bucket()

    expect(ctx.provider.request).toHaveBeenCalledWith('S3', 'listObjectsV2', {
      Bucket: 'bucket',
      Prefix: 'serverless/svc/dev',
      ContinuationToken: 'next',
    })
    expect(ctx.provider.request).toHaveBeenCalledWith('S3', 'deleteObjects', {
      Bucket: 'bucket',
      Delete: { Objects: [{ Key: `serverless/svc/dev/${dirs[0]}/svc.zip` }] },
    })
  })

  it('deletes in batches of 1000 keys', async () => {
    const ctx = buildCtx({ referenceMode: false })
    const objects = Array.from({ length: 2001 }, (_, i) => ({ Key: `k${i}` }))

    await ctx.removeObjects(objects)

    const batches = ctx.provider.request.mock.calls.map(
      ([, , params]) => params.Delete.Objects.length,
    )
    expect(batches).toEqual([1000, 1000, 1])
  })
})

describe('cleanupS3Bucket — sandbox artifacts', () => {
  const TEMPLATE = 'compiled-cloudformation-template.json'
  const DIR = '1690000000006-2026-07-22T10:00:06.000Z'

  // A bucket with one deployment folder whose template points to `kept`
  const buildSandboxCtx = ({
    referenceMode = false,
    emptyChangeSet,
    prefix = 'serverless',
    keys,
    uploadedAt = {},
  }) => {
    const ctx = buildCtx({ referenceMode, emptyChangeSet })
    ctx.serverless.service.sandboxes = { echo: { artifact: './app' } }
    ctx.provider.getDeploymentPrefix = () => prefix
    ctx.provider.naming = { getCompiledTemplateS3Suffix: () => TEMPLATE }
    ctx.serverless.service.package.artifactDirectoryName = `${prefix}/svc/dev/${DIR}`
    const kept = `${prefix}/svc/dev/sandboxes/echo-b2.zip`
    const all = [`${prefix}/svc/dev/${DIR}/${TEMPLATE}`, kept, ...keys]
    ctx.provider.request = jest.fn(async (service, method, params) => {
      if (method === 'listObjectsV2') {
        return {
          Contents: all
            .filter((key) => key.startsWith(params.Prefix))
            .map((Key) => ({ Key, LastModified: uploadedAt[Key] })),
        }
      }
      if (method === 'getObject') {
        return { Body: Buffer.from(JSON.stringify({ Uri: `s3://b/${kept}` })) }
      }
      return {}
    })
    return ctx
  }

  const deletedSandboxKeys = (ctx) =>
    ctx.provider.request.mock.calls
      .filter(([, method]) => method === 'deleteObjects')
      .flatMap(([, , params]) => params.Delete.Objects.map((o) => o.Key))
      .filter((key) => key.includes('/sandboxes/'))

  it.each([
    ['copy mode', { referenceMode: false }],
    ['reference mode', { referenceMode: true }],
    ['an empty change set', { emptyChangeSet: true }],
  ])('deletes unused sandbox zips in %s', async (_, mode) => {
    const unused = 'serverless/svc/dev/sandboxes/echo-a1.zip'
    const ctx = buildSandboxCtx({ ...mode, keys: [unused] })

    await ctx.cleanupS3Bucket()

    expect(deletedSandboxKeys(ctx)).toEqual([unused])
  })

  it('keeps a zip uploaded within the last hour that no folder points to yet', async () => {
    const inFlight = 'serverless/svc/dev/sandboxes/echo-c3.zip'
    const old = 'serverless/svc/dev/sandboxes/echo-a1.zip'
    const ctx = buildSandboxCtx({
      keys: [inFlight, old],
      uploadedAt: { [inFlight]: new Date(Date.now() - 5 * 60 * 1000) },
    })

    await ctx.cleanupS3Bucket()

    expect(deletedSandboxKeys(ctx)).toEqual([old])
  })

  it('covers zips at the "serverless/" location under a custom prefix', async () => {
    const legacy = 'serverless/svc/dev/sandboxes/echo-a1.zip'
    const ctx = buildSandboxCtx({ prefix: 'custom', keys: [legacy] })

    await ctx.cleanupS3Bucket()

    expect(deletedSandboxKeys(ctx)).toEqual([legacy])
  })

  it('warns instead of failing the deploy when the zip pass fails', async () => {
    const ctx = buildSandboxCtx({ keys: [] })
    const request = ctx.provider.request
    ctx.provider.request = jest.fn(async (service, method, params) => {
      if (method === 'listObjectsV2' && params.Prefix.endsWith('/sandboxes/')) {
        throw Object.assign(new Error('Access Denied'), {
          code: 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED',
        })
      }
      return request(service, method, params)
    })

    await ctx.cleanupS3Bucket()

    expect(logWarning).toHaveBeenCalledWith(
      'Could not remove unused sandbox artifacts from S3: Access Denied',
    )
  })

  it('warns when S3 refuses to delete some sandbox zips', async () => {
    const unused = 'serverless/svc/dev/sandboxes/echo-a1.zip'
    const ctx = buildSandboxCtx({ keys: [unused] })
    const request = ctx.provider.request
    ctx.provider.request = jest.fn(async (service, method, params) => {
      if (method === 'deleteObjects') {
        return {
          Errors: [
            { Key: unused, Code: 'AccessDenied', Message: 'Access Denied' },
          ],
        }
      }
      return request(service, method, params)
    })

    await ctx.cleanupS3Bucket()

    expect(logWarning).toHaveBeenCalledWith(
      'Could not remove 1 unused sandbox artifact(s) from S3: AccessDenied (Access Denied)',
    )
  })

  it('makes no sandbox calls for a service without sandboxes', async () => {
    const ctx = buildCtx({ referenceMode: true })

    await ctx.cleanupS3Bucket()

    expect(ctx.provider.request).not.toHaveBeenCalled()
  })
})
