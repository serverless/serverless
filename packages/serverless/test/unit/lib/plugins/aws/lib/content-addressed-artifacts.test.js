import { afterAll, jest } from '@jest/globals'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildArtifactKey,
  findUnusedArtifacts,
  persistArtifacts,
  readUploadManifest,
  resolveBucketRef,
  resolveManifestFile,
  sha256Hex,
  uploadArtifactIfMissing,
  uploadPackagedArtifacts,
} from '../../../../../../lib/plugins/aws/lib/content-addressed-artifacts.js'
import ServerlessError from '../../../../../../lib/serverless-error.js'

// fs/promises-like stub that keeps written files in memory.
function makeFs() {
  const files = {}
  return {
    files,
    mkdir: jest.fn(async () => {}),
    writeFile: jest.fn(async (p, data) => {
      files[String(p)] = data
    }),
    copyFile: jest.fn(async (src, dest) => {
      files[String(dest)] = `copy-of:${src}`
    }),
    readFile: jest.fn(async (p) => {
      if (files[String(p)] === undefined) {
        throw Object.assign(new Error('no'), { code: 'ENOENT' })
      }
      return files[String(p)]
    }),
  }
}

const tmpDirs = []
const makeTmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-content-addressed-'))
  tmpDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe('buildArtifactKey', () => {
  test('builds <prefix>/<service>/<stage>/<kind>/<name>-<sha256>.zip', () => {
    expect(
      buildArtifactKey({
        prefix: 'serverless',
        serviceName: 'svc',
        stage: 'dev',
        kind: 'webapps',
        name: 'site',
        sha256: 'abc123',
      }),
    ).toBe('serverless/svc/dev/webapps/site-abc123.zip')
    expect(
      buildArtifactKey({
        prefix: 'custom-prefix',
        serviceName: 'my-svc',
        stage: 'prod',
        kind: 'sandboxes',
        name: 'runner',
        sha256: 'def456',
      }),
    ).toBe('custom-prefix/my-svc/prod/sandboxes/runner-def456.zip')
  })
})

describe('sha256Hex', () => {
  test('returns the lowercase hex SHA-256 of the buffer', () => {
    expect(sha256Hex(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })
})

describe('resolveBucketRef', () => {
  test('returns the resolved bucket name when known', () => {
    expect(resolveBucketRef('my-bucket')).toBe('my-bucket')
  })

  test('returns the in-stack deployment bucket Ref when no name is known', () => {
    expect(resolveBucketRef(undefined)).toEqual({
      Ref: 'ServerlessDeploymentBucket',
    })
  })
})

describe.each(['webapps', 'sandboxes'])(
  'persistArtifacts / readUploadManifest (kind: %s)',
  (kind) => {
    test('writes each zip under <packageDir>/<kind>/ and the <kind>-uploads.json manifest', async () => {
      const fakeFs = makeFs()
      const key = `serverless/svc/dev/${kind}/site-abc123.zip`
      const entries = await persistArtifacts({
        packageDir: '/pkg',
        kind,
        pendingUploads: new Map([
          ['site', { key, zipBuffer: Buffer.from('zip-bytes') }],
        ]),
        fs: fakeFs,
      })
      expect(entries).toEqual([
        { name: 'site', key, file: `${kind}/site-abc123.zip` },
      ])
      // The write path uses native path.join (backslashes on Windows).
      expect(fakeFs.files[path.join('/pkg', kind, 'site-abc123.zip')]).toEqual(
        Buffer.from('zip-bytes'),
      )
      expect(
        JSON.parse(fakeFs.files[path.join('/pkg', `${kind}-uploads.json`)]),
      ).toEqual(entries)
    })

    test('copies a sourceFile instead of writing a buffer', async () => {
      const fakeFs = makeFs()
      const key = `serverless/svc/dev/${kind}/site-abc123.zip`
      await persistArtifacts({
        packageDir: '/pkg',
        kind,
        pendingUploads: new Map([
          ['site', { key, sourceFile: '/build/site.zip' }],
        ]),
        fs: fakeFs,
      })
      expect(fakeFs.copyFile).toHaveBeenCalledWith(
        '/build/site.zip',
        path.join('/pkg', kind, 'site-abc123.zip'),
      )
    })

    test('writes no manifest when there are no artifacts', async () => {
      const fakeFs = makeFs()
      const entries = await persistArtifacts({
        packageDir: '/pkg',
        kind,
        pendingUploads: new Map(),
        fs: fakeFs,
      })
      expect(entries).toEqual([])
      expect(fakeFs.writeFile).not.toHaveBeenCalled()
    })

    test('readUploadManifest round-trips what persistArtifacts wrote', async () => {
      const fakeFs = makeFs()
      await persistArtifacts({
        packageDir: '/pkg',
        kind,
        pendingUploads: new Map([
          ['site', { key: 'k/site-x.zip', zipBuffer: Buffer.from('z') }],
        ]),
        fs: fakeFs,
      })
      expect(
        await readUploadManifest({ packageDir: '/pkg', kind, fs: fakeFs }),
      ).toEqual([
        { name: 'site', key: 'k/site-x.zip', file: `${kind}/site-x.zip` },
      ])
    })

    test('readUploadManifest returns [] when no manifest exists', async () => {
      expect(
        await readUploadManifest({ packageDir: '/pkg', kind, fs: makeFs() }),
      ).toEqual([])
    })
  },
)

const KINDS = [
  {
    kind: 'webapps',
    label: 'web app artifact',
    errorCode: 'WEB_APPS_ARTIFACT_PATH_ESCAPE',
    missingErrorCode: 'WEB_APPS_ARTIFACT_MISSING',
  },
  {
    kind: 'sandboxes',
    label: 'sandbox artifact',
    errorCode: 'SANDBOXES_ARTIFACT_PATH_ESCAPE',
    missingErrorCode: 'SANDBOXES_ARTIFACT_MISSING',
  },
]

describe.each(KINDS)(
  'resolveManifestFile (kind: $kind)',
  ({ kind, label, errorCode }) => {
    test('accepts a file inside the package directory', () => {
      expect(
        resolveManifestFile({
          packageDir: '/pkg',
          file: `${kind}/a.zip`,
          label,
          errorCode,
        }),
      ).toBe(path.resolve('/pkg', kind, 'a.zip'))
    })

    test('rejects a ../ path that escapes the package directory', () => {
      expect(() =>
        resolveManifestFile({
          packageDir: '/pkg',
          file: '../x.zip',
          label,
          errorCode,
        }),
      ).toThrow(
        expect.objectContaining({
          code: errorCode,
          message: `Refusing to upload ${label} from '../x.zip': path escapes the package directory.`,
        }),
      )
    })

    test('rejects an absolute path outside the package directory', () => {
      const outside = path.resolve('/etc/passwd')
      expect(() =>
        resolveManifestFile({
          packageDir: '/pkg',
          file: outside,
          label,
          errorCode,
        }),
      ).toThrow(expect.objectContaining({ code: errorCode }))
    })

    test('rejects a sibling directory that shares the package dir prefix', () => {
      expect(() =>
        resolveManifestFile({
          packageDir: '/pkg',
          file: '../pkg-other/a.zip',
          label,
          errorCode,
        }),
      ).toThrow(expect.objectContaining({ code: errorCode }))
    })
  },
)

describe.each(KINDS)(
  'uploadPackagedArtifacts (kind: $kind)',
  ({ kind, label, errorCode, missingErrorCode }) => {
    const existingKey = `serverless/svc/dev/${kind}/old-aaa.zip`
    const newKey = `serverless/svc/dev/${kind}/new-bbb.zip`

    const makeProvider = (existingKeys = []) => ({
      getServerlessDeploymentBucketName: jest.fn(async () => 'dep-bucket'),
      request: jest.fn(async (service, method, params) => {
        if (service === 'S3' && method === 'headObject') {
          if (existingKeys.includes(params.Key)) return {}
          throw Object.assign(new Error('Not Found'), {
            providerError: { statusCode: 404, code: 'NotFound' },
          })
        }
        return {}
      }),
    })
    const uploadCalls = (provider) =>
      provider.request.mock.calls.filter(
        ([service, method]) => service === 'S3' && method === 'upload',
      )
    const run = (provider, packageDir, extra = {}) =>
      uploadPackagedArtifacts({
        provider,
        packageDir,
        kind,
        label,
        errorCode,
        missingErrorCode,
        log: { debug: jest.fn() },
        ...extra,
      })
    const persist = (packageDir, entries) =>
      persistArtifacts({
        packageDir,
        kind,
        pendingUploads: new Map(
          entries.map(([name, key, body]) => [
            name,
            { key, zipBuffer: Buffer.from(body) },
          ]),
        ),
      })

    test('uploads new keys, skips existing ones, and logs the skipped keys', async () => {
      const packageDir = makeTmpDir()
      await persist(packageDir, [
        ['old', existingKey, 'old-bytes'],
        ['new', newKey, 'new-bytes'],
      ])
      const provider = makeProvider([existingKey])
      const log = { debug: jest.fn() }

      await expect(
        run(provider, packageDir, {
          log,
          deploymentBucketObject: { serverSideEncryption: 'AES256' },
        }),
      ).resolves.toEqual({ uploaded: [newKey], skipped: [existingKey] })

      const uploads = uploadCalls(provider)
      expect(uploads).toHaveLength(1)
      expect(uploads[0][2]).toEqual({
        Bucket: 'dep-bucket',
        Key: newKey,
        Body: Buffer.from('new-bytes'),
        ContentType: 'application/zip',
        ServerSideEncryption: 'AES256',
      })
      expect(log.debug).toHaveBeenCalledWith(
        `${kind}: artifact s3://dep-bucket/${existingKey} already exists, upload skipped`,
      )
    })

    test('does nothing (not even a bucket lookup) when there is no manifest', async () => {
      const provider = makeProvider()
      await expect(run(provider, makeTmpDir())).resolves.toEqual({
        uploaded: [],
        skipped: [],
      })
      expect(provider.getServerlessDeploymentBucketName).not.toHaveBeenCalled()
      expect(provider.request).not.toHaveBeenCalled()
    })

    test('refuses a manifest entry that escapes the package directory, before any S3 call', async () => {
      const packageDir = makeTmpDir()
      fs.writeFileSync(
        path.join(packageDir, `${kind}-uploads.json`),
        JSON.stringify([{ name: 'x', key: newKey, file: '../../etc/passwd' }]),
      )
      const provider = makeProvider()
      await expect(run(provider, packageDir)).rejects.toMatchObject({
        code: errorCode,
        message: `Refusing to upload ${label} from '../../etc/passwd': path escapes the package directory.`,
      })
      expect(provider.request).not.toHaveBeenCalled()
    })

    test('a manifest entry whose zip is missing fails with a clear error and uploads nothing', async () => {
      // `deploy --package <dir>` with a package dir copied without its zips.
      const packageDir = makeTmpDir()
      await persist(packageDir, [['new', newKey, 'new-bytes']])
      fs.rmSync(path.join(packageDir, kind), { recursive: true })
      const provider = makeProvider()

      const error = await run(provider, packageDir).catch((err) => err)
      expect(error).toBeInstanceOf(ServerlessError)
      expect(error.code).toBe(missingErrorCode)
      expect(error.message).toBe(
        `Cannot find ${label} '${kind}/new-bbb.zip' in the package directory ${packageDir}. Run serverless package again, or deploy without --package.`,
      )
      expect(provider.request).not.toHaveBeenCalled()
    })

    test('reads and uploads at most four artifacts at a time', async () => {
      const packageDir = makeTmpDir()
      const keys = Array.from(
        { length: 10 },
        (_, i) => `serverless/svc/dev/${kind}/app${i}-${i}.zip`,
      )
      await persist(
        packageDir,
        keys.map((key, i) => [`app${i}`, key, `bytes-${i}`]),
      )
      let inFlight = 0
      let maxInFlight = 0
      const realFs = fsPromises
      const trackingFs = {
        readFile: jest.fn(async (p, ...rest) => {
          if (String(p).endsWith('.zip')) {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
          }
          return realFs.readFile(p, ...rest)
        }),
      }
      const provider = makeProvider()
      const request = provider.request
      provider.request = jest.fn(async (service, method, params) => {
        const result = await request(service, method, params).catch(
          (err) => err,
        )
        if (method === 'upload') {
          await new Promise((resolve) => setTimeout(resolve, 5))
          inFlight -= 1
        }
        if (result instanceof Error) throw result
        return result
      })

      await expect(
        run(provider, packageDir, { fs: trackingFs }),
      ).resolves.toEqual({ uploaded: keys, skipped: [] })
      expect(maxInFlight).toBe(4)
    })

    test('rethrows a read error other than ENOENT unchanged', async () => {
      const packageDir = makeTmpDir()
      await persist(packageDir, [['new', newKey, 'new-bytes']])
      const readError = Object.assign(new Error('denied'), { code: 'EACCES' })
      const realFs = fsPromises
      const fakeFs = {
        readFile: jest.fn(async (p, ...rest) => {
          if (String(p).endsWith('.zip')) throw readError
          return realFs.readFile(p, ...rest)
        }),
      }
      const provider = makeProvider()
      await expect(run(provider, packageDir, { fs: fakeFs })).rejects.toBe(
        readError,
      )
      expect(uploadCalls(provider)).toHaveLength(0)
    })
  },
)

describe('uploadArtifactIfMissing', () => {
  const body = Buffer.from('zip-content')
  const key = 'serverless/svc/dev/webapps/site-abc.zip'

  const makeProvider = (headObject) => ({
    request: jest.fn(async (service, method) => {
      if (service === 'S3' && method === 'headObject') return headObject()
      return {}
    }),
  })
  const uploadCalls = (provider) =>
    provider.request.mock.calls.filter(
      ([service, method]) => service === 'S3' && method === 'upload',
    )

  test('skips the upload when the object already exists', async () => {
    const provider = makeProvider(async () => ({ ContentLength: 11 }))
    await expect(
      uploadArtifactIfMissing({ provider, bucket: 'b', key, body }),
    ).resolves.toBe('skipped')
    expect(provider.request).toHaveBeenCalledWith('S3', 'headObject', {
      Bucket: 'b',
      Key: key,
    })
    expect(uploadCalls(provider)).toHaveLength(0)
  })

  test.each([
    ['v3 $metadata 404', { $metadata: { httpStatusCode: 404 } }],
    ['v3 $metadata 403', { $metadata: { httpStatusCode: 403 } }],
    ['statusCode 404', { statusCode: 404 }],
    ['statusCode 403', { statusCode: 403 }],
    ['providerError statusCode 404', { providerError: { statusCode: 404 } }],
    ['providerError statusCode 403', { providerError: { statusCode: 403 } }],
    ['providerError code NotFound', { providerError: { code: 'NotFound' } }],
    ['providerError code Forbidden', { providerError: { code: 'Forbidden' } }],
    ['name NotFound', { name: 'NotFound' }],
    ['code Forbidden', { code: 'Forbidden' }],
  ])('uploads when headObject reports a missing key (%s)', async (_, error) => {
    const provider = makeProvider(async () => {
      throw Object.assign(new Error('head failed'), error)
    })
    await expect(
      uploadArtifactIfMissing({ provider, bucket: 'b', key, body }),
    ).resolves.toBe('uploaded')
    const uploads = uploadCalls(provider)
    expect(uploads).toHaveLength(1)
    expect(uploads[0][2]).toEqual({
      Bucket: 'b',
      Key: key,
      Body: body,
      ContentType: 'application/zip',
    })
  })

  test('fails on any other headObject error without uploading, naming the object', async () => {
    const providerError = { statusCode: 500, code: 'InternalError' }
    const error = Object.assign(new Error('internal'), {
      $metadata: { httpStatusCode: 500 },
      providerError,
    })
    const provider = makeProvider(async () => {
      throw error
    })
    const thrown = await uploadArtifactIfMissing({
      provider,
      bucket: 'b',
      key,
      body,
    }).catch((err) => err)
    expect(thrown).toBeInstanceOf(ServerlessError)
    expect(thrown).toMatchObject({
      code: 'ARTIFACT_HEAD_OBJECT_FAILED',
      message: `Cannot check whether s3://b/${key} exists: internal`,
      providerError,
    })
    expect(uploadCalls(provider)).toHaveLength(0)
  })

  test('applies the deployment bucket encryption options to the upload', async () => {
    const provider = makeProvider(async () => {
      throw Object.assign(new Error('nf'), {
        $metadata: { httpStatusCode: 404 },
      })
    })
    await uploadArtifactIfMissing({
      provider,
      bucket: 'b',
      key,
      body,
      deploymentBucketObject: {
        serverSideEncryption: 'aws:kms',
        sseKMSKeyId: 'k',
      },
    })
    const [[, , params]] = uploadCalls(provider)
    expect(params.ServerSideEncryption).toBe('aws:kms')
    expect(params.SSEKMSKeyId).toBe('k')
  })
})

describe('findUnusedArtifacts', () => {
  const TEMPLATE = 'compiled-cloudformation-template.json'
  const DIR_OLD = '1792583884942-2026-10-21T11:58:04.942Z'
  const DIR_NEW = '1792584095223-2026-10-21T12:01:35.223Z'
  const zip = (prefix, sha) => `${prefix}/shop/dev/sandboxes/echo-${sha}.zip`
  const templateFor = (key) =>
    JSON.stringify({
      Resources: {
        EchoImage: {
          Type: 'AWS::Lambda::MicrovmImage',
          Properties: {
            CodeArtifact: {
              Uri: { 'Fn::Sub': [`s3://\${B}/${key}`, { B: 'bucket' }] },
            },
          },
        },
      },
    })

  // `objects` maps keys to template bodies (or '' for other files)
  const makeProvider = (objects, { failGet, uploadedAt = {} } = {}) => {
    const request = jest.fn(async (service, method, params) => {
      if (method === 'listObjectsV2') {
        const keys = Object.keys(objects)
          .filter((k) => k.startsWith(params.Prefix))
          .sort()
        // two keys per page, to exercise continuation
        const start = Number(params.ContinuationToken || 0)
        const page = keys.slice(start, start + 2)
        const more = start + 2 < keys.length
        return {
          Contents: page.map((Key) => ({ Key, LastModified: uploadedAt[Key] })),
          IsTruncated: more,
          ...(more && { NextContinuationToken: String(start + 2) }),
        }
      }
      if (method === 'getObject') {
        if (failGet) throw new Error('AccessDenied')
        return { Body: Buffer.from(objects[params.Key]) }
      }
      throw new Error(`unexpected ${method}`)
    })
    return { request }
  }

  const run = (provider, extra = {}) =>
    findUnusedArtifacts({
      provider,
      bucketName: 'bucket',
      deploymentPrefix: 'serverless',
      service: 'shop',
      stage: 'dev',
      kind: 'sandboxes',
      templateFileName: TEMPLATE,
      ...extra,
    })

  it('returns zips that no remaining deployment folder points to', async () => {
    const old = zip('serverless', 'a1')
    const current = zip('serverless', 'b2')
    const orphan = zip('serverless', 'c3')
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_OLD}/${TEMPLATE}`]: templateFor(old),
      [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor(current),
      [old]: '',
      [current]: '',
      [orphan]: '',
    })

    const result = await run(provider)

    expect(result).toEqual({ unused: [orphan] })
  })

  it('matches keys whose sandbox name the template escapes', async () => {
    const live = 'serverless/shop/dev/sandboxes/say"hi\\-a1.zip'
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor(live),
      [live]: '',
    })

    const result = await run(provider)

    expect(result).toEqual({ unused: [] })
  })

  it('keeps zips uploaded within the last hour', async () => {
    const now = Date.parse('2026-10-21T12:00:00Z')
    const fresh = zip('serverless', 'f1')
    const hourOld = zip('serverless', 'h1')
    const old = zip('serverless', 'o1')
    const provider = makeProvider(
      {
        [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor('x'),
        [fresh]: '',
        [hourOld]: '',
        [old]: '',
      },
      {
        uploadedAt: {
          [fresh]: new Date(now - 59 * 60 * 1000),
          [hourOld]: new Date(now - 60 * 60 * 1000),
          [old]: new Date(now - 24 * 60 * 60 * 1000),
        },
      },
    )

    const result = await run(provider, { now })

    expect(result).toEqual({ unused: [hourOld, old] })
  })

  it('keeps a fresh zip when no deployment folder is left', async () => {
    const now = Date.parse('2026-10-21T12:00:00Z')
    const current = zip('serverless', 'c1')
    const provider = makeProvider(
      { [current]: '' },
      { uploadedAt: { [current]: new Date(now - 30 * 1000) } },
    )

    const result = await run(provider, { now })

    expect(result).toEqual({ unused: [] })
    expect(provider.request).toHaveBeenCalledTimes(1)
  })

  it('returns nothing without listing folders when there are no zips', async () => {
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor('x'),
    })

    expect(await run(provider)).toEqual({ unused: [] })
    expect(
      provider.request.mock.calls.filter(([, m]) => m === 'getObject'),
    ).toHaveLength(0)
  })

  it('keeps every zip when a template cannot be read', async () => {
    const provider = makeProvider(
      {
        [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor('x'),
        [zip('serverless', 'c3')]: '',
      },
      { failGet: true },
    )

    expect(await run(provider)).toEqual({
      unused: [],
      keptAll: `could not read the template of deployment ${DIR_NEW}`,
    })
  })

  it('keeps every zip when a folder has no template', async () => {
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_NEW}/serverless-state.json`]: '{}',
      [zip('serverless', 'c3')]: '',
    })

    expect(await run(provider)).toEqual({
      unused: [],
      keptAll: `could not read the template of deployment ${DIR_NEW}`,
    })
  })

  it('also covers the extra prefixes under a custom deployment prefix', async () => {
    const legacyKept = zip('serverless', 'a1')
    const legacyUnused = zip('serverless', 'b2')
    const current = zip('custom', 'c3')
    const provider = makeProvider({
      [`custom/shop/dev/${DIR_OLD}/${TEMPLATE}`]: templateFor(legacyKept),
      [`custom/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor(current),
      [legacyKept]: '',
      [legacyUnused]: '',
      [current]: '',
    })

    const result = await run(provider, {
      deploymentPrefix: 'custom',
      extraPrefixes: ['serverless'],
    })

    expect(result).toEqual({ unused: [legacyUnused] })
  })

  it('treats ignored folders as gone', async () => {
    const old = zip('serverless', 'a1')
    const current = zip('serverless', 'b2')
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_OLD}/${TEMPLATE}`]: templateFor(old),
      [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor(current),
      [old]: '',
      [current]: '',
    })

    const result = await run(provider, { ignoreDirectories: [DIR_OLD] })

    expect(result).toEqual({ unused: [old] })
  })

  it('keeps every zip when a template body is not readable', async () => {
    const key = zip('serverless', 'a1')
    const provider = {
      request: jest.fn(async (service, method, params) => {
        if (method === 'listObjectsV2') {
          return params.Prefix.endsWith('/sandboxes/')
            ? { Contents: [{ Key: key }] }
            : {
                Contents: [
                  { Key: `serverless/shop/dev/${DIR_NEW}/${TEMPLATE}` },
                ],
              }
        }
        return { Body: { unexpected: true } }
      }),
    }

    expect(await run(provider)).toEqual({
      unused: [],
      keptAll: `could not read the template of deployment ${DIR_NEW}`,
    })
  })

  it('keeps every zip when a template is not JSON', async () => {
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: 'not json',
      [zip('serverless', 'c3')]: '',
    })

    expect((await run(provider)).keptAll).toBe(
      `could not read the template of deployment ${DIR_NEW}`,
    )
  })

  it('reads newest first and stops once every zip is accounted for', async () => {
    const current = zip('serverless', 'b2')
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_OLD}/${TEMPLATE}`]: templateFor(current),
      [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor(current),
      [current]: '',
    })

    expect(await run(provider)).toEqual({ unused: [] })
    expect(
      provider.request.mock.calls
        .filter(([, m]) => m === 'getObject')
        .map(([, , params]) => params.Key),
    ).toEqual([`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`])
  })

  it('keeps every zip when more folders than the cap remain to be read', async () => {
    const provider = makeProvider({
      [`serverless/shop/dev/${DIR_OLD}/${TEMPLATE}`]: templateFor('x'),
      [`serverless/shop/dev/${DIR_NEW}/${TEMPLATE}`]: templateFor('y'),
      [zip('serverless', 'c3')]: '',
    })

    expect(await run(provider, { maxTemplateReads: 1 })).toEqual({
      unused: [],
      keptAll:
        'more than 1 deployments to check; "serverless prune --includeArtifacts" retires older ones',
    })
  })

  it('reads a v3 stream body', async () => {
    const key = zip('serverless', 'a1')
    const provider = {
      request: jest.fn(async (service, method, params) => {
        if (method === 'listObjectsV2') {
          return params.Prefix.endsWith('/sandboxes/')
            ? { Contents: [{ Key: key }] }
            : {
                Contents: [
                  { Key: `serverless/shop/dev/${DIR_NEW}/${TEMPLATE}` },
                ],
              }
        }
        return {
          Body: { transformToString: async () => templateFor(key) },
        }
      }),
    }

    expect(await run(provider)).toEqual({ unused: [] })
  })
})
