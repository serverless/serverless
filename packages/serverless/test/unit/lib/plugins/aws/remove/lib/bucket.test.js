import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const logInfo = jest.fn()
const logWarning = jest.fn()
const logDebug = jest.fn()
jest.unstable_mockModule('@serverless/util', () => ({
  log: { info: logInfo, warning: logWarning, debug: logDebug },
}))

const bucketMixin = (
  await import('../../../../../../../lib/plugins/aws/remove/lib/bucket.js')
).default
const checkIfBucketExistsMixin = (
  await import('../../../../../../../lib/plugins/aws/lib/check-if-bucket-exists.js')
).default
const ServerlessError = (
  await import('../../../../../../../lib/serverless-error.js')
).default

// Artifact keys are `<prefix>/<service>/<stage>/<deployment dir>/<file>`; the
// trailing slash keeps a stage from matching a sibling stage that merely
// starts with the same characters (dev vs dev2, prod vs production)
const PREFIX = 'serverless/svc/dev/'
// Payloads `serverless dev` relayed through the bucket live under their own prefix
const DEV_MODE_PREFIX = 'serverless-dev-mode/svc/dev/'
const isDevMode = (params) =>
  params?.Prefix?.startsWith('serverless-dev-mode/') ||
  params?.Delete?.Objects?.some(({ Key }) =>
    Key.startsWith('serverless-dev-mode/'),
  )
const IN_STACK = 'svc-dev-serverlessdeploymentbucket-abc'

const accessDenied = (code) =>
  Object.assign(new ServerlessError('Access Denied', code), {
    providerError: { code: 'AccessDenied', statusCode: 403 },
  })

// Builds an AwsRemove-like context for one deployment-bucket mode.
//  - inStack: physical name of the in-stack ServerlessDeploymentBucket (modes 3/4)
//  - global: the global bucket is in use (mode 2)
//  - named: a user-named bucket (mode 1)
//  - none: the resolver found no bucket at all
//  - deploymentBucketObject: the normalized `provider.deploymentBucket` object
//  - existingBuckets: names for which S3 headBucket succeeds (default: all)
//  - versioning: bucket name → getBucketVersioning Status ('Enabled',
//    'Suspended'), or 'DENIED' to make the probe fail with AccessDenied
//    (default: the bucket reports no versioning configuration)
//  - s3: per-method S3 response overrides (a value or a function of params);
//    `devModeListObjectVersions` answers the listing of the Dev Mode prefix
//    (default: empty)
const buildCtx = ({
  inStack = null,
  global = false,
  named = null,
  none = false,
  deploymentBucketObject,
  referenceMode = false,
  existingBuckets,
  versioning = {},
  s3 = {},
  resolveError,
} = {}) => {
  const resolvedName = none
    ? null
    : named || (global ? 'global-bucket' : inStack)
  const request = jest.fn(async (service, method, params) => {
    if (service !== 'S3') throw new Error(`unexpected ${service}.${method}`)
    if (method === 'headBucket') {
      if (existingBuckets && !existingBuckets.includes(params.Bucket)) {
        throw Object.assign(new Error('not found'), {
          code: 'AWS_S3_HEAD_BUCKET_NOT_FOUND',
        })
      }
      return {}
    }
    if (
      method === 'getBucketVersioning' &&
      s3.getBucketVersioning === undefined
    ) {
      const Status = versioning[params.Bucket]
      if (Status === 'DENIED') {
        throw accessDenied('AWS_S3_GET_BUCKET_VERSIONING_ACCESS_DENIED')
      }
      return Status ? { Status } : {}
    }
    const override =
      method === 'listObjectVersions' && isDevMode(params)
        ? (s3.devModeListObjectVersions ?? { Versions: [] })
        : method === 'listObjectsV2' && isDevMode(params)
          ? (s3.devModeListObjectsV2 ?? { Contents: [] })
          : s3[method]
    if (override !== undefined) {
      return typeof override === 'function' ? override(params) : override
    }
    if (method === 'listObjectsV2') return { Contents: [] }
    if (method === 'listObjectVersions') return { Versions: [] }
    if (method === 'deleteObjects') return {}
    throw new Error(`unexpected S3.${method}`)
  })
  const provider = {
    request,
    getStage: () => 'dev',
    getDeploymentPrefix: () => 'serverless',
    isReferenceCodeStorageMode: () => referenceMode,
    async getServerlessDeploymentBucketName() {
      this.globalDeploymentBucketUsed = false
      this.deploymentBucketInStack = null
      if (resolveError) throw resolveError
      this.deploymentBucketInStack = inStack
      this.globalDeploymentBucketUsed = global
      return resolvedName
    },
  }
  return {
    ...bucketMixin,
    ...checkIfBucketExistsMixin,
    provider,
    serverless: {
      service: {
        service: 'svc',
        provider: { deploymentBucketObject },
      },
    },
  }
}

// The calls for the service's artifacts; `devModeCallsOf` has the Dev Mode ones
const callsOf = (ctx, method) =>
  ctx.provider.request.mock.calls
    .filter(([, m, params]) => m === method && !isDevMode(params))
    .map(([, , params]) => params)
const devModeCallsOf = (ctx, method) =>
  ctx.provider.request.mock.calls
    .filter(([, m, params]) => m === method && isDevMode(params))
    .map(([, , params]) => params)

const versionedListing = {
  Versions: [
    { Key: `${PREFIX}1/svc.zip`, VersionId: 'v1' },
    { Key: `${PREFIX}1/svc.zip`, VersionId: 'v2' },
  ],
  DeleteMarkers: [
    { Key: `${PREFIX}1/compiled-template.json`, VersionId: 'm1' },
  ],
}
const versionedObjects = [
  { Key: `${PREFIX}1/svc.zip`, VersionId: 'v1' },
  { Key: `${PREFIX}1/svc.zip`, VersionId: 'v2' },
  { Key: `${PREFIX}1/compiled-template.json`, VersionId: 'm1' },
]

// What ListObjectVersions returns for a bucket that never had versioning
// enabled: every object is reported with the version id "null"
const unversionedListing = {
  Versions: [
    { Key: `${PREFIX}1/svc.zip`, VersionId: 'null' },
    { Key: `${PREFIX}1/compiled-template.json`, VersionId: 'null' },
  ],
}

// S3's answer to a remover without the "s3:DeleteObjectVersion" permission:
// every version-specific delete is refused, key-only deletes succeed
const withoutVersionDeletePermission = ({ Delete: { Objects } }) => ({
  Deleted: Objects.filter((o) => !o.VersionId).map(({ Key }) => ({ Key })),
  Errors: Objects.filter((o) => o.VersionId).map(({ Key, VersionId }) => ({
    Key,
    VersionId,
    Code: 'AccessDenied',
    Message: 'Access Denied',
  })),
})

const plainListing = {
  Contents: [
    { Key: `${PREFIX}1/svc.zip` },
    { Key: `${PREFIX}1/compiled-template.json` },
  ],
}

beforeEach(() => {
  logInfo.mockClear()
  logWarning.mockClear()
  logDebug.mockClear()
})

describe('emptyS3Bucket — in-stack deployment bucket', () => {
  it('deletes every object version and delete marker when the bucket reports versioning enabled', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      deploymentBucketObject: { versioning: true },
      versioning: { [IN_STACK]: 'Enabled' },
      s3: { listObjectVersions: versionedListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'getBucketVersioning')).toEqual([{ Bucket: IN_STACK }])
    expect(callsOf(ctx, 'listObjectVersions')).toEqual([
      { Bucket: IN_STACK, Prefix: PREFIX },
    ])
    expect(callsOf(ctx, 'listObjectsV2')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: IN_STACK, Delete: { Objects: versionedObjects } },
    ])
    expect(logInfo).not.toHaveBeenCalled()
    expect(logWarning).not.toHaveBeenCalled()
  })

  it('deletes every object version when the bucket is versioned but the configuration no longer declares it', async () => {
    // The bucket's S3 versioning state outlives the flag that enabled it
    const ctx = buildCtx({
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Enabled' },
      s3: { listObjectVersions: versionedListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'listObjectVersions')).toHaveLength(1)
    expect(callsOf(ctx, 'listObjectsV2')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: IN_STACK, Delete: { Objects: versionedObjects } },
    ])
  })

  it('deletes null versions by version id when versioning is suspended', async () => {
    // A key-only delete on a suspended bucket would replace each null version
    // with a delete marker and leave the bucket non-empty
    const ctx = buildCtx({
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Suspended' },
      s3: { listObjectVersions: unversionedListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'listObjectsV2')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: IN_STACK, Delete: { Objects: unversionedListing.Versions } },
    ])
  })

  it('does not retry by key when the bucket is known to be versioned and version-specific deletes are denied', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Suspended' },
      s3: {
        listObjectVersions: unversionedListing,
        deleteObjects: withoutVersionDeletePermission,
      },
    })

    await expect(ctx.emptyS3Bucket()).rejects.toMatchObject({
      code: 'CANNOT_DELETE_S3_OBJECTS_ACCESS_DENIED',
    })
    expect(callsOf(ctx, 'deleteObjects')).toHaveLength(1)
  })

  it('deletes plain objects when the bucket was never versioned, without listing versions', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      s3: { listObjectsV2: plainListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'getBucketVersioning')).toEqual([{ Bucket: IN_STACK }])
    expect(callsOf(ctx, 'listObjectVersions')).toEqual([])
    expect(callsOf(ctx, 'listObjectsV2')).toEqual([
      { Bucket: IN_STACK, Prefix: PREFIX },
    ])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: IN_STACK, Delete: { Objects: plainListing.Contents } },
    ])
  })

  it('empties the in-stack bucket exactly once and prints no notice when it is also the resolved bucket', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      s3: { listObjectsV2: plainListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'headBucket')).toHaveLength(1)
    expect(callsOf(ctx, 'deleteObjects')).toHaveLength(1)
    expect(logInfo).not.toHaveBeenCalled()
    expect(logWarning).not.toHaveBeenCalled()
  })

  describe('when the versioning state cannot be read', () => {
    it('lists versions when the configuration declares versioning, with an info notice', async () => {
      const ctx = buildCtx({
        inStack: IN_STACK,
        deploymentBucketObject: { versioning: true },
        versioning: { [IN_STACK]: 'DENIED' },
        s3: { listObjectVersions: versionedListing },
      })

      await ctx.emptyS3Bucket()

      expect(callsOf(ctx, 'listObjectVersions')).toHaveLength(1)
      expect(callsOf(ctx, 'deleteObjects')).toEqual([
        { Bucket: IN_STACK, Delete: { Objects: versionedObjects } },
      ])
      expect(logWarning).not.toHaveBeenCalled()
      expect(logInfo).toHaveBeenCalledTimes(1)
      expect(logInfo.mock.calls[0][0]).toContain('s3:GetBucketVersioning')
      expect(logInfo.mock.calls[0][0]).toContain(IN_STACK)
    })

    it('lists versions in reference code storage mode without an explicit versioning flag', async () => {
      const ctx = buildCtx({
        inStack: IN_STACK,
        deploymentBucketObject: { codeStorageMode: 'reference' },
        referenceMode: true,
        versioning: { [IN_STACK]: 'DENIED' },
        s3: { listObjectVersions: versionedListing },
      })

      await ctx.emptyS3Bucket()

      expect(callsOf(ctx, 'listObjectVersions')).toHaveLength(1)
      expect(callsOf(ctx, 'deleteObjects')[0].Delete.Objects).toHaveLength(3)
    })

    it('lists versions anyway when nothing declares versioning, so historical versions are removed when they can be listed', async () => {
      const ctx = buildCtx({
        inStack: IN_STACK,
        versioning: { [IN_STACK]: 'DENIED' },
        s3: { listObjectVersions: versionedListing },
      })

      await ctx.emptyS3Bucket()

      expect(callsOf(ctx, 'listObjectVersions')).toHaveLength(1)
      expect(callsOf(ctx, 'listObjectsV2')).toEqual([])
      expect(callsOf(ctx, 'deleteObjects')).toEqual([
        { Bucket: IN_STACK, Delete: { Objects: versionedObjects } },
      ])
      expect(logWarning).not.toHaveBeenCalled()
      expect(logInfo).toHaveBeenCalledTimes(1)
    })

    describe('and version-specific deletes are denied', () => {
      it('deletes null versions by key, removing a never-versioned bucket as fully as a plain listing would', async () => {
        const ctx = buildCtx({
          inStack: IN_STACK,
          versioning: { [IN_STACK]: 'DENIED' },
          s3: {
            listObjectVersions: unversionedListing,
            deleteObjects: withoutVersionDeletePermission,
          },
        })

        await ctx.emptyS3Bucket()

        expect(callsOf(ctx, 'deleteObjects')).toEqual([
          {
            Bucket: IN_STACK,
            Delete: {
              Objects: [
                { Key: `${PREFIX}1/svc.zip`, VersionId: 'null' },
                { Key: `${PREFIX}1/compiled-template.json`, VersionId: 'null' },
              ],
            },
          },
          {
            Bucket: IN_STACK,
            Delete: {
              Objects: [
                { Key: `${PREFIX}1/svc.zip` },
                { Key: `${PREFIX}1/compiled-template.json` },
              ],
            },
          },
        ])
        expect(logWarning).not.toHaveBeenCalled()
      })

      it('deletes a null delete marker by key as well', async () => {
        const ctx = buildCtx({
          inStack: IN_STACK,
          versioning: { [IN_STACK]: 'DENIED' },
          s3: {
            listObjectVersions: {
              Versions: [{ Key: `${PREFIX}1/svc.zip`, VersionId: 'null' }],
              DeleteMarkers: [
                { Key: `${PREFIX}1/compiled-template.json`, VersionId: 'null' },
              ],
            },
            deleteObjects: withoutVersionDeletePermission,
          },
        })

        await ctx.emptyS3Bucket()

        expect(callsOf(ctx, 'deleteObjects')[1].Delete.Objects).toEqual([
          { Key: `${PREFIX}1/svc.zip` },
          { Key: `${PREFIX}1/compiled-template.json` },
        ])
      })

      it('does not retry by key when a refused delete carries a real version id', async () => {
        const ctx = buildCtx({
          inStack: IN_STACK,
          versioning: { [IN_STACK]: 'DENIED' },
          s3: {
            listObjectVersions: {
              Versions: [
                { Key: `${PREFIX}1/svc.zip`, VersionId: 'v1' },
                { Key: `${PREFIX}1/compiled-template.json`, VersionId: 'null' },
              ],
            },
            deleteObjects: withoutVersionDeletePermission,
          },
        })

        await expect(ctx.emptyS3Bucket()).rejects.toMatchObject({
          code: 'CANNOT_DELETE_S3_OBJECTS_ACCESS_DENIED',
        })
        expect(callsOf(ctx, 'deleteObjects')).toHaveLength(1)
      })

      it('does not retry by key when a null version is refused for a reason other than access', async () => {
        const ctx = buildCtx({
          inStack: IN_STACK,
          versioning: { [IN_STACK]: 'DENIED' },
          s3: {
            listObjectVersions: unversionedListing,
            deleteObjects: {
              Errors: [
                {
                  Key: `${PREFIX}1/svc.zip`,
                  VersionId: 'null',
                  Code: 'InternalError',
                },
              ],
            },
          },
        })

        await expect(ctx.emptyS3Bucket()).rejects.toMatchObject({
          code: 'CANNOT_DELETE_S3_OBJECTS_GENERIC',
        })
        expect(callsOf(ctx, 'deleteObjects')).toHaveLength(1)
      })

      it('surfaces the access-denied error when deleting by key is denied too', async () => {
        const ctx = buildCtx({
          inStack: IN_STACK,
          versioning: { [IN_STACK]: 'DENIED' },
          s3: {
            listObjectVersions: unversionedListing,
            deleteObjects: ({ Delete: { Objects } }) => ({
              Errors: Objects.map(({ Key, VersionId }) => ({
                Key,
                VersionId,
                Code: 'AccessDenied',
              })),
            }),
          },
        })

        await expect(ctx.emptyS3Bucket()).rejects.toMatchObject({
          code: 'CANNOT_DELETE_S3_OBJECTS_ACCESS_DENIED',
        })
        expect(callsOf(ctx, 'deleteObjects')).toHaveLength(2)
      })
    })

    it('falls back to a plain listing without a warning when versions cannot be listed either and nothing declares versioning', async () => {
      // The documented minimal deployment policy has neither permission; such
      // a role keeps today's request and sees nothing above info level
      const ctx = buildCtx({
        inStack: IN_STACK,
        versioning: { [IN_STACK]: 'DENIED' },
        s3: {
          listObjectVersions: () => {
            throw accessDenied('AWS_S3_LIST_OBJECT_VERSIONS_ACCESS_DENIED')
          },
          listObjectsV2: plainListing,
        },
      })

      await ctx.emptyS3Bucket()

      expect(callsOf(ctx, 'deleteObjects')).toEqual([
        { Bucket: IN_STACK, Delete: { Objects: plainListing.Contents } },
      ])
      expect(logWarning).not.toHaveBeenCalled()
      expect(logInfo).toHaveBeenCalledTimes(2)
      expect(logInfo.mock.calls[0][0]).toContain('s3:GetBucketVersioning')
      expect(logInfo.mock.calls[1][0]).toContain('s3:ListBucketVersions')
    })

    it('warns when versions cannot be listed and the configuration declares versioning', async () => {
      const ctx = buildCtx({
        inStack: IN_STACK,
        deploymentBucketObject: { versioning: true },
        versioning: { [IN_STACK]: 'DENIED' },
        s3: {
          listObjectVersions: () => {
            throw accessDenied('AWS_S3_LIST_OBJECT_VERSIONS_ACCESS_DENIED')
          },
          listObjectsV2: plainListing,
        },
      })

      await ctx.emptyS3Bucket()

      expect(callsOf(ctx, 'deleteObjects')).toHaveLength(1)
      expect(logWarning).toHaveBeenCalledTimes(1)
      expect(logWarning.mock.calls[0][0]).toContain('s3:ListBucketVersions')
    })

    it('rethrows probe errors other than access denied', async () => {
      const boom = Object.assign(
        new ServerlessError(
          'boom',
          'AWS_S3_GET_BUCKET_VERSIONING_INTERNAL_ERROR',
        ),
        {
          providerError: { code: 'InternalError' },
        },
      )
      const ctx = buildCtx({
        inStack: IN_STACK,
        s3: {
          getBucketVersioning: () => {
            throw boom
          },
        },
      })

      await expect(ctx.emptyS3Bucket()).rejects.toBe(boom)
    })
  })

  it('warns and falls back to a plain listing when object versions cannot be listed', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Enabled' },
      s3: {
        listObjectVersions: () => {
          throw accessDenied('AWS_S3_LIST_OBJECT_VERSIONS_ACCESS_DENIED')
        },
        listObjectsV2: plainListing,
      },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'listObjectsV2')).toEqual([
      { Bucket: IN_STACK, Prefix: PREFIX },
    ])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: IN_STACK, Delete: { Objects: plainListing.Contents } },
    ])
    expect(logWarning).toHaveBeenCalledTimes(1)
    expect(logWarning.mock.calls[0][0]).toContain('s3:ListBucketVersions')
    expect(logWarning.mock.calls[0][0]).toContain(IN_STACK)
  })

  it('surfaces an actionable error when plain objects cannot be listed', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      s3: {
        listObjectsV2: () => {
          throw accessDenied('AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED')
        },
      },
    })

    await expect(ctx.emptyS3Bucket()).rejects.toMatchObject({
      code: 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED',
      message: expect.stringContaining('sufficient permissions'),
    })
  })
})

describe('emptyS3Bucket — global deployment bucket', () => {
  it('deletes every object version under the service prefix without probing versioning', async () => {
    const ctx = buildCtx({
      global: true,
      s3: { listObjectVersions: versionedListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'getBucketVersioning')).toEqual([])
    expect(callsOf(ctx, 'listObjectVersions')).toEqual([
      { Bucket: 'global-bucket', Prefix: PREFIX },
    ])
    expect(callsOf(ctx, 'listObjectsV2')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: 'global-bucket', Delete: { Objects: versionedObjects } },
    ])
    expect(logInfo).not.toHaveBeenCalled()
  })

  it('does not retry by key when version-specific deletes are denied', async () => {
    const ctx = buildCtx({
      global: true,
      s3: {
        listObjectVersions: unversionedListing,
        deleteObjects: withoutVersionDeletePermission,
      },
    })

    await expect(ctx.emptyS3Bucket()).rejects.toMatchObject({
      code: 'CANNOT_DELETE_S3_OBJECTS_ACCESS_DENIED',
    })
    expect(callsOf(ctx, 'deleteObjects')).toHaveLength(1)
  })

  it('also empties a leftover in-stack bucket, probing only that bucket', async () => {
    const ctx = buildCtx({
      global: true,
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Enabled' },
      s3: { listObjectVersions: versionedListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'getBucketVersioning')).toEqual([{ Bucket: IN_STACK }])
    expect(callsOf(ctx, 'listObjectVersions').map((p) => p.Bucket)).toEqual([
      IN_STACK,
      'global-bucket',
    ])
    expect(callsOf(ctx, 'deleteObjects').map((p) => p.Bucket)).toEqual([
      IN_STACK,
      'global-bucket',
    ])
  })
})

describe('emptyS3Bucket — user-named deployment bucket', () => {
  it('deletes object versions when the bucket is declared versioned in the configuration', async () => {
    const ctx = buildCtx({
      named: 'my-bucket',
      deploymentBucketObject: { name: 'my-bucket', versioning: true },
      s3: { listObjectVersions: versionedListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'getBucketVersioning')).toEqual([])
    expect(callsOf(ctx, 'listObjectVersions')).toEqual([
      { Bucket: 'my-bucket', Prefix: PREFIX },
    ])
    expect(callsOf(ctx, 'listObjectsV2')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: 'my-bucket', Delete: { Objects: versionedObjects } },
    ])
  })

  it('deletes plain objects when the bucket is not declared versioned, even if S3 versioning is enabled', async () => {
    // A user-owned bucket is never deleted by the Framework, so undeclared
    // versioning keeps the previous behavior: current objects get delete
    // markers and the history stays in the user's bucket
    const ctx = buildCtx({
      named: 'my-bucket',
      deploymentBucketObject: { name: 'my-bucket' },
      versioning: { 'my-bucket': 'Enabled' },
      s3: { listObjectsV2: plainListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'getBucketVersioning')).toEqual([])
    expect(callsOf(ctx, 'listObjectsV2')).toEqual([
      { Bucket: 'my-bucket', Prefix: PREFIX },
    ])
    expect(callsOf(ctx, 'listObjectVersions')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: 'my-bucket', Delete: { Objects: plainListing.Contents } },
    ])
    expect(logInfo).not.toHaveBeenCalled()
  })

  it('deletes plain objects in reference code storage mode without a declared versioning flag', async () => {
    const ctx = buildCtx({
      named: 'my-bucket',
      deploymentBucketObject: {
        name: 'my-bucket',
        codeStorageMode: 'reference',
      },
      referenceMode: true,
      versioning: { 'my-bucket': 'Enabled' },
      s3: { listObjectsV2: plainListing },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'listObjectsV2')).toHaveLength(1)
    expect(callsOf(ctx, 'listObjectVersions')).toEqual([])
  })

  it('skips with one notice naming the bucket when it does not exist', async () => {
    const ctx = buildCtx({
      named: 'my-bucket',
      deploymentBucketObject: { name: 'my-bucket' },
      existingBuckets: [],
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'getBucketVersioning')).toEqual([])
    expect(callsOf(ctx, 'listObjectsV2')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([])
    expect(logInfo).toHaveBeenCalledTimes(1)
    expect(logInfo.mock.calls[0][0]).toContain('my-bucket')
  })
})

describe('emptyS3Bucket — no deployment bucket resolved', () => {
  it('prints one notice and makes no S3 calls', async () => {
    const ctx = buildCtx({ none: true })

    await ctx.emptyS3Bucket()

    expect(ctx.provider.request).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledTimes(1)
    expect(logInfo.mock.calls[0][0]).toMatch(
      /Skipping S3 bucket objects removal/,
    )
  })
})

describe('emptyS3Bucket — large buckets', () => {
  it('follows listObjectsV2 continuation tokens and deletes each page as it is listed', async () => {
    const page = (start, count, next) => ({
      Contents: Array.from({ length: count }, (_, i) => ({
        Key: `${PREFIX}1/file-${start + i}`,
      })),
      IsTruncated: Boolean(next),
      NextContinuationToken: next,
    })
    const ctx = buildCtx({
      named: 'my-bucket',
      deploymentBucketObject: { name: 'my-bucket' },
      s3: {
        listObjectsV2: (params) =>
          params.ContinuationToken === 'page-2'
            ? page(1000, 500)
            : page(0, 1000, 'page-2'),
      },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'listObjectsV2')).toEqual([
      { Bucket: 'my-bucket', Prefix: PREFIX },
      { Bucket: 'my-bucket', Prefix: PREFIX, ContinuationToken: 'page-2' },
    ])
    const deletes = callsOf(ctx, 'deleteObjects')
    expect(deletes.map((d) => d.Delete.Objects.length)).toEqual([1000, 500])
    expect(deletes[0].Delete.Objects[0]).toEqual({ Key: `${PREFIX}1/file-0` })
    expect(deletes[1].Delete.Objects[499]).toEqual({
      Key: `${PREFIX}1/file-1499`,
    })
    // the first page is deleted before the second page is requested
    const order = ctx.provider.request.mock.calls.map(([, m]) => m)
    expect(order.indexOf('deleteObjects')).toBeLessThan(
      order.lastIndexOf('listObjectsV2'),
    )
  })

  it('follows listObjectVersions key/version markers and deletes each page as it is listed', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Enabled' },
      s3: {
        listObjectVersions: (params) =>
          params.KeyMarker
            ? { Versions: [{ Key: `${PREFIX}2/svc.zip`, VersionId: 'v3' }] }
            : {
                ...versionedListing,
                IsTruncated: true,
                NextKeyMarker: `${PREFIX}1/svc.zip`,
                NextVersionIdMarker: 'v2',
              },
      },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'listObjectVersions')).toEqual([
      { Bucket: IN_STACK, Prefix: PREFIX },
      {
        Bucket: IN_STACK,
        Prefix: PREFIX,
        KeyMarker: `${PREFIX}1/svc.zip`,
        VersionIdMarker: 'v2',
      },
    ])
    expect(
      callsOf(ctx, 'deleteObjects').map((d) => d.Delete.Objects.length),
    ).toEqual([3, 1])
  })

  it('stops paginating versions when a truncated page carries no next marker', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Enabled' },
      s3: {
        listObjectVersions: { ...versionedListing, IsTruncated: true },
      },
    })

    await ctx.emptyS3Bucket()

    expect(callsOf(ctx, 'listObjectVersions')).toHaveLength(1)
    expect(callsOf(ctx, 'deleteObjects')).toHaveLength(1)
  })

  it('splits a page larger than the DeleteObjects limit into batches of 1000', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      versioning: { [IN_STACK]: 'Suspended' },
      s3: {
        listObjectVersions: {
          Versions: Array.from({ length: 1200 }, (_, i) => ({
            Key: `${PREFIX}1/file-${i}`,
            VersionId: 'null',
          })),
        },
      },
    })

    await ctx.emptyS3Bucket()

    const deletes = callsOf(ctx, 'deleteObjects')
    expect(deletes.map((d) => d.Delete.Objects.length)).toEqual([1000, 200])
    expect(deletes[1].Delete.Objects[199]).toEqual({
      Key: `${PREFIX}1/file-1199`,
      VersionId: 'null',
    })
  })
})

describe('emptyS3Bucket — payloads of serverless dev', () => {
  it("deletes every version and delete marker under the stage's Dev Mode prefix, page by page, before the artifacts", async () => {
    const ctx = buildCtx({
      global: true,
      s3: {
        listObjectVersions: versionedListing,
        devModeListObjectVersions: (params) =>
          params.KeyMarker
            ? {
                DeleteMarkers: [
                  { Key: `${DEV_MODE_PREFIX}s_2/b`, VersionId: 'm1' },
                ],
              }
            : {
                Versions: [
                  { Key: `${DEV_MODE_PREFIX}s_1/a`, VersionId: 'v1' },
                  { Key: `${DEV_MODE_PREFIX}s_1/a`, VersionId: 'v2' },
                ],
                IsTruncated: true,
                NextKeyMarker: `${DEV_MODE_PREFIX}s_1/a`,
                NextVersionIdMarker: 'v2',
              },
      },
    })

    await ctx.emptyS3Bucket()

    expect(devModeCallsOf(ctx, 'listObjectVersions')).toEqual([
      { Bucket: 'global-bucket', Prefix: DEV_MODE_PREFIX },
      {
        Bucket: 'global-bucket',
        Prefix: DEV_MODE_PREFIX,
        KeyMarker: `${DEV_MODE_PREFIX}s_1/a`,
        VersionIdMarker: 'v2',
      },
    ])
    expect(devModeCallsOf(ctx, 'deleteObjects')).toEqual([
      {
        Bucket: 'global-bucket',
        Delete: {
          Objects: [
            { Key: `${DEV_MODE_PREFIX}s_1/a`, VersionId: 'v1' },
            { Key: `${DEV_MODE_PREFIX}s_1/a`, VersionId: 'v2' },
          ],
        },
      },
      {
        Bucket: 'global-bucket',
        Delete: {
          Objects: [{ Key: `${DEV_MODE_PREFIX}s_2/b`, VersionId: 'm1' }],
        },
      },
    ])
    // the service's artifacts are still removed as before
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: 'global-bucket', Delete: { Objects: versionedObjects } },
    ])
    const order = ctx.provider.request.mock.calls.map(([, m, p]) =>
      isDevMode(p) ? `dev:${m}` : m,
    )
    expect(order.lastIndexOf('dev:deleteObjects')).toBeLessThan(
      order.indexOf('deleteObjects'),
    )
  })

  it('never fails the removal when the Dev Mode prefix cannot be listed or deleted', async () => {
    for (const devModeListObjectVersions of [
      // a denied version listing falls back to listing by key (tested below)
      () => {
        throw Object.assign(new Error('We encountered an internal error'), {
          code: 'AWS_S3_LIST_OBJECT_VERSIONS_INTERNAL_ERROR',
        })
      },
      { Versions: [{ Key: `${DEV_MODE_PREFIX}s_1/a`, VersionId: 'v1' }] },
    ]) {
      logDebug.mockClear()
      const ctx = buildCtx({
        named: 'my-bucket',
        deploymentBucketObject: { name: 'my-bucket', versioning: true },
        s3: {
          listObjectVersions: versionedListing,
          devModeListObjectVersions,
          deleteObjects: (params) =>
            isDevMode(params)
              ? {
                  Errors: [
                    {
                      Key: `${DEV_MODE_PREFIX}s_1/a`,
                      VersionId: 'v1',
                      Code: 'InternalError',
                    },
                  ],
                }
              : {},
        },
      })

      await expect(ctx.emptyS3Bucket()).resolves.toBeUndefined()

      expect(callsOf(ctx, 'deleteObjects')).toEqual([
        { Bucket: 'my-bucket', Delete: { Objects: versionedObjects } },
      ])
      expect(logDebug).toHaveBeenCalledTimes(1)
      expect(logDebug.mock.calls[0][0]).toContain(DEV_MODE_PREFIX)
      expect(logWarning).not.toHaveBeenCalled()
    }
  })

  it('empties the prefix by key, page by page, when its versions cannot be listed in an unversioned bucket the stack owns', async () => {
    const page = (start, count, next) => ({
      Contents: Array.from({ length: count }, (_, i) => ({
        Key: `${DEV_MODE_PREFIX}s_1/${start + i}`,
      })),
      IsTruncated: Boolean(next),
      NextContinuationToken: next,
    })
    const ctx = buildCtx({
      inStack: IN_STACK,
      s3: {
        listObjectsV2: plainListing,
        devModeListObjectVersions: () => {
          throw accessDenied('AWS_S3_LIST_OBJECT_VERSIONS_ACCESS_DENIED')
        },
        devModeListObjectsV2: (params) =>
          params.ContinuationToken === 'page-2'
            ? page(1000, 2)
            : page(0, 1000, 'page-2'),
      },
    })

    await ctx.emptyS3Bucket()

    expect(devModeCallsOf(ctx, 'listObjectsV2')).toEqual([
      { Bucket: IN_STACK, Prefix: DEV_MODE_PREFIX },
      {
        Bucket: IN_STACK,
        Prefix: DEV_MODE_PREFIX,
        ContinuationToken: 'page-2',
      },
    ])
    const deletes = devModeCallsOf(ctx, 'deleteObjects')
    expect(deletes.map((d) => d.Delete.Objects.length)).toEqual([1000, 2])
    expect(deletes[1].Delete.Objects).toEqual([
      { Key: `${DEV_MODE_PREFIX}s_1/1000` },
      { Key: `${DEV_MODE_PREFIX}s_1/1001` },
    ])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: IN_STACK, Delete: { Objects: plainListing.Contents } },
    ])
    expect(logDebug).not.toHaveBeenCalled()
  })

  it('proceeds with a debug line only when neither listing of the prefix is allowed', async () => {
    const ctx = buildCtx({
      inStack: IN_STACK,
      s3: {
        listObjectsV2: plainListing,
        devModeListObjectVersions: () => {
          throw accessDenied('AWS_S3_LIST_OBJECT_VERSIONS_ACCESS_DENIED')
        },
        devModeListObjectsV2: () => {
          throw accessDenied('AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED')
        },
      },
    })

    await expect(ctx.emptyS3Bucket()).resolves.toBeUndefined()

    expect(devModeCallsOf(ctx, 'deleteObjects')).toEqual([])
    expect(callsOf(ctx, 'deleteObjects')).toEqual([
      { Bucket: IN_STACK, Delete: { Objects: plainListing.Contents } },
    ])
    expect(logDebug).toHaveBeenCalledTimes(1)
    expect(logDebug.mock.calls[0][0]).toContain(DEV_MODE_PREFIX)
    expect(logWarning).not.toHaveBeenCalled()
  })

  it('uses the prefix the Dev Mode side channel writes under', async () => {
    const { SIDE_CHANNEL_ROOT } =
      await import('../../../../../../../lib/plugins/aws/dev/relay/side-channel.js')
    expect(buildCtx().getDevModePrefix()).toBe(`${SIDE_CHANNEL_ROOT}/svc/dev/`)
  })

  it('leaves the Dev Mode prefixes of other stages alone', async () => {
    const ctx = buildCtx({ global: true })

    await ctx.emptyS3Bucket()

    expect(
      devModeCallsOf(ctx, 'listObjectVersions').map((p) => p.Prefix),
    ).toEqual([DEV_MODE_PREFIX])
    expect(devModeCallsOf(ctx, 'deleteObjects')).toEqual([])
  })
})

describe('setServerlessDeploymentBucketName', () => {
  it('rethrows a framework error that carries no provider error, unchanged', async () => {
    const resolveError = new ServerlessError(
      'Access denied when storing the parameter',
      'DEPLOYMENT_BUCKET_INSUFFICIENT_PERMISSIONS',
    )
    const ctx = buildCtx({ resolveError })

    await expect(ctx.setServerlessDeploymentBucketName()).rejects.toBe(
      resolveError,
    )
  })

  it('rethrows provider errors other than the missing-resource validation error', async () => {
    const resolveError = Object.assign(
      new ServerlessError(
        'boom',
        'AWS_CLOUD_FORMATION_DESCRIBE_STACK_RESOURCE_ACCESS_DENIED',
      ),
      { providerError: { code: 'AccessDenied' } },
    )
    const ctx = buildCtx({ resolveError })

    await expect(ctx.setServerlessDeploymentBucketName()).rejects.toBe(
      resolveError,
    )
  })

  it('proceeds without a bucket when the stack has no deployment bucket resource', async () => {
    const resolveError = Object.assign(
      new ServerlessError(
        'Resource ServerlessDeploymentBucket does not exist for stack svc-dev',
        'AWS_CLOUD_FORMATION_DESCRIBE_STACK_RESOURCE_VALIDATION_ERROR',
      ),
      { providerError: { code: 'ValidationError' } },
    )
    const ctx = buildCtx({ resolveError })

    await ctx.emptyS3Bucket()

    expect(ctx.bucketName).toBeUndefined()
    expect(ctx.provider.request).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledTimes(1)
  })
})
