import { jest } from '@jest/globals'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import {
  SIDE_CHANNEL_ROOT,
  START_SWEEP_MS,
  SWEEP_OLDER_THAN_MS,
  URL_TTL_SECONDS,
  bridgePrefix,
  createSideChannel,
  encryptionOf,
  objectTopic,
  openSideChannel,
  stagePrefix,
} from '../../../../../../../lib/plugins/aws/dev/relay/side-channel.js'
import {
  KIND,
  createSealer,
  decodeFrame,
  openRaw,
} from '../../../../../../../lib/plugins/aws/dev/relay/protocol.js'

const key = Buffer.alloc(32, 5)
const KMS_KEY = 'arn:aws:kms:us-east-1:111122223333:key/k'
const hex32 = (c) => c.repeat(32)
const PRESIGNED_ERROR =
  'GET https://b.s3.us-east-1.amazonaws.com/k?X-Amz-Credential=AKID%2F20261003&X-Amz-Signature=abc123 failed'

/** An S3 client stand-in: keeps one version per key in memory and records every command. */
const fakeS3 = ({ pageSize = Infinity } = {}) => {
  const objects = new Map()
  const calls = []
  let version = 0
  return {
    objects,
    calls,
    async send(command) {
      calls.push(command)
      const input = command.input
      if (command instanceof PutObjectCommand) {
        version += 1
        objects.set(input.Key, {
          body: input.Body,
          version: `v${version}`,
          lastModified: new Date(),
        })
        return { VersionId: `v${version}` }
      }
      if (command instanceof GetObjectCommand) {
        const object = objects.get(input.Key)
        if (
          !object ||
          (input.VersionId && input.VersionId !== object.version)
        ) {
          throw Object.assign(new Error('The specified key does not exist.'), {
            name: 'NoSuchKey',
            $metadata: { httpStatusCode: 404 },
          })
        }
        return {
          VersionId: object.version,
          Body: {
            transformToByteArray: async () => new Uint8Array(object.body),
          },
        }
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(input.Key)
        return {}
      }
      if (command instanceof ListObjectVersionsCommand) {
        const entries = [...objects.entries()]
          .filter(([k]) => k.startsWith(input.Prefix))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .filter(([k]) => !input.KeyMarker || k > input.KeyMarker)
        const page = entries.slice(0, pageSize)
        const truncated = entries.length > page.length
        return {
          Versions: page.map(([Key, o]) => ({
            Key,
            VersionId: o.version,
            LastModified: o.lastModified,
          })),
          IsTruncated: truncated,
          ...(truncated && {
            NextKeyMarker: page[page.length - 1][0],
            NextVersionIdMarker: page[page.length - 1][1].version,
          }),
        }
      }
      if (command instanceof ListObjectsV2Command) {
        const entries = [...objects.entries()]
          .filter(([k]) => k.startsWith(input.Prefix))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .filter(
            ([k]) => !input.ContinuationToken || k > input.ContinuationToken,
          )
        const page = entries.slice(0, pageSize)
        const truncated = entries.length > page.length
        return {
          Contents: page.map(([Key, o]) => ({
            Key,
            LastModified: o.lastModified,
          })),
          IsTruncated: truncated,
          ...(truncated && {
            NextContinuationToken: page[page.length - 1][0],
          }),
        }
      }
      if (command instanceof DeleteObjectsCommand) {
        for (const { Key } of input.Delete.Objects) objects.delete(Key)
        return {}
      }
      throw new Error(`unexpected ${command.constructor.name}`)
    },
  }
}

/** A fake S3 whose commands of these classes are denied. */
const denying = (Commands, message = 'Access Denied', options) => {
  const s3 = fakeS3(options)
  const send = s3.send
  s3.send = async (command) => {
    if ([Commands].flat().some((Command) => command instanceof Command)) {
      throw Object.assign(new Error(message), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      })
    }
    return send(command)
  }
  return s3
}

/**
 * An S3 stand-in for the sweep: lists these versions and delete markers (from long ago) and refuses
 * every object of a DeleteObjects request for which `refuse` returns an error code.
 */
const versionsS3 = ({
  versions = [],
  markers = [],
  refuse = () => false,
} = {}) => {
  const calls = []
  return {
    calls,
    async send(command) {
      calls.push(command)
      if (command instanceof ListObjectVersionsCommand) {
        const old = (entry) => ({ ...entry, LastModified: new Date(0) })
        return {
          Versions: versions.map(old),
          DeleteMarkers: markers.map(old),
          IsTruncated: false,
        }
      }
      if (command instanceof DeleteObjectsCommand) {
        const Errors = command.input.Delete.Objects.flatMap((object) => {
          const Code = refuse(object)
          return Code ? [{ ...object, Code, Message: Code }] : []
        })
        return Errors.length ? { Errors } : {}
      }
      throw new Error(`unexpected ${command.constructor.name}`)
    },
  }
}
/** The objects of each DeleteObjects request sent. */
const deletedObjects = (s3) =>
  s3.calls
    .filter((c) => c instanceof DeleteObjectsCommand)
    .map((c) => c.input.Delete.Objects)
const sealed = (objectKey, header = { kind: KIND.PAYLOAD }, body) =>
  createSealer({ key })(objectTopic(objectKey), header, Buffer.from(body))

const credentials = () => ({
  accessKeyId: 'AKID',
  secretAccessKey: 'secret',
  sessionToken: 'token',
})

const channel = (s3, extra = {}) =>
  createSideChannel({
    s3,
    bucket: 'my-deployment-bucket',
    region: 'us-east-1',
    service: 'svc',
    stage: 'dev',
    sessionId: 's_0123456789ab',
    key,
    deploymentBucket: { serverSideEncryption: 'aws:kms', sseKMSKeyId: KMS_KEY },
    credentials,
    ...extra,
  })

describe('the S3 side channel', () => {
  test('a result is sealed for its key, put with the bucket encryption, and handed over as presigned GET and DELETE of its version', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    const pointer = await side.upload(Buffer.from('big result'))
    expect(pointer.key).toMatch(
      /^serverless-dev-mode\/svc\/dev\/s_0123456789ab\/[0-9a-f]{32}$/,
    )
    const put = s3.calls[0].input
    expect(put).toMatchObject({
      Bucket: 'my-deployment-bucket',
      Key: pointer.key,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: KMS_KEY,
    })
    const opened = openRaw({
      key,
      topic: `s3/${pointer.key}`,
      message: put.Body,
    })
    const frame = decodeFrame(opened.plaintext)
    expect(frame.header.kind).toBe(KIND.PAYLOAD)
    expect(frame.body.toString()).toBe('big result')
    const get = new URL(pointer.get)
    const del = new URL(pointer.delete)
    expect(`${get.origin}${get.pathname}`).toBe(
      `https://my-deployment-bucket.s3.us-east-1.amazonaws.com/${pointer.key}`,
    )
    expect(`${del.origin}${del.pathname}`).toBe(`${get.origin}${get.pathname}`)
    expect(get.searchParams.get('versionId')).toBe('v1')
    expect(del.searchParams.get('versionId')).toBe('v1')
    expect(get.searchParams.get('x-id')).toBe('GetObject')
    expect(del.searchParams.get('x-id')).toBe('DeleteObject')
    expect(get.searchParams.get('X-Amz-Expires')).toBe(String(URL_TTL_SECONDS))
    expect(del.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(Object.keys(pointer).sort()).toEqual(['delete', 'get', 'key'])
  })

  test('an upload URL signs the encryption headers the bridge must send', async () => {
    const upload = await channel(fakeS3()).uploadUrl()
    expect(upload.headers).toEqual({
      'x-amz-server-side-encryption': 'aws:kms',
      'x-amz-server-side-encryption-aws-kms-key-id': KMS_KEY,
    })
    const url = new URL(upload.url)
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'host;x-amz-server-side-encryption;x-amz-server-side-encryption-aws-kms-key-id',
    )
    expect(url.searchParams.get('x-id')).toBe('PutObject')
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://my-deployment-bucket.s3.us-east-1.amazonaws.com/${upload.key}`,
    )
    expect(upload.key).toMatch(
      /^serverless-dev-mode\/svc\/dev\/s_0123456789ab\/[0-9a-f]{32}$/,
    )
    // The bridge's PUT carries no checksum of its own: one signed for an empty body would fail it.
    expect(
      [...url.searchParams.keys()].filter((name) => /checksum/i.test(name)),
    ).toEqual([])
    // The bridge's decoder drops a frame whose fields have other types.
    expect(upload.ttlMs).toBe(900_000)
    expect(Number.isInteger(upload.ttlMs)).toBe(true)
    expect(typeof upload.url).toBe('string')
    expect(typeof upload.key).toBe('string')
    expect(
      Object.values(upload.headers).every((v) => typeof v === 'string'),
    ).toBe(true)
  })

  test('a bucket with default encryption gets an upload URL that signs only the host', async () => {
    const upload = await channel(fakeS3(), { deploymentBucket: {} }).uploadUrl()
    expect(upload.headers).toEqual({})
    expect(new URL(upload.url).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'host',
    )
  })

  test('every link is signed with the credentials current at that moment', async () => {
    let current = { accessKeyId: 'AKIDFIRST', secretAccessKey: 's1' }
    const side = channel(fakeS3(), { credentials: () => current })
    const first = new URL((await side.uploadUrl()).url)
    current = { accessKeyId: 'AKIDSECOND', secretAccessKey: 's2' }
    const second = new URL((await side.uploadUrl()).url)
    expect(first.searchParams.get('X-Amz-Credential')).toMatch(/^AKIDFIRST\//)
    expect(second.searchParams.get('X-Amz-Credential')).toMatch(/^AKIDSECOND\//)
    const failing = channel(fakeS3(), {
      credentials: () => {
        throw new Error('AWS credentials were not read yet')
      },
    })
    await expect(failing.uploadUrl()).rejects.toThrow('not read yet')
  })

  test('a request payload is downloaded with its version, opened and deleted with that version', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    const objectKey = `${side.prefix}${hex32('a')}`
    s3.objects.set(objectKey, {
      body: sealed(objectKey, { kind: KIND.PAYLOAD }, 'event'),
      version: 'v7',
      lastModified: new Date(),
    })
    expect(
      (await side.download({ key: objectKey, versionId: 'v7' })).toString(),
    ).toBe('event')
    const got = s3.calls.find((c) => c instanceof GetObjectCommand)
    expect(got.input).toEqual({
      Bucket: 'my-deployment-bucket',
      Key: objectKey,
      VersionId: 'v7',
    })
    const deleted = s3.calls.find((c) => c instanceof DeleteObjectCommand)
    expect(deleted.input).toEqual({
      Bucket: 'my-deployment-bucket',
      Key: objectKey,
      VersionId: 'v7',
    })
    expect(s3.objects.size).toBe(0)
  })

  test('a request payload the laptop never takes is deleted with its version, unread, and only in this session', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    const objectKey = `${side.prefix}${hex32('c')}`
    s3.objects.set(objectKey, {
      body: sealed(objectKey, { kind: KIND.PAYLOAD }, 'event'),
      version: 'v3',
      lastModified: new Date(),
    })
    await side.discard({ key: objectKey, versionId: 'v3' })
    expect(s3.calls.map((c) => c.constructor.name)).toEqual([
      'DeleteObjectCommand',
    ])
    expect(s3.calls[0].input).toEqual({
      Bucket: 'my-deployment-bucket',
      Key: objectKey,
      VersionId: 'v3',
    })
    expect(s3.objects.size).toBe(0)
    s3.calls.length = 0
    await expect(
      side.discard({
        key: `serverless-dev-mode/svc/dev/s_other/${hex32('a')}`,
      }),
    ).rejects.toThrow(/not in this session/)
    await expect(
      side.discard({ key: `${side.prefix}${hex32('a')}`, versionId: 7 }),
    ).rejects.toThrow(/version/)
    expect(s3.calls).toEqual([])
  })

  test('without a version from the bridge the version read is the one deleted', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    const objectKey = `${side.prefix}${hex32('b')}`
    s3.objects.set(objectKey, {
      body: sealed(objectKey, undefined, 'event'),
      version: 'v9',
      lastModified: new Date(),
    })
    await side.download({ key: objectKey })
    const deleted = s3.calls.find((c) => c instanceof DeleteObjectCommand)
    expect(deleted.input.VersionId).toBe('v9')
  })

  test('a key outside the session, or not one this machine hands out, is refused without an S3 call', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    for (const objectKey of [
      `serverless-dev-mode/svc/dev/s_other/${hex32('a')}`,
      `serverless-dev-mode/svc/dev2/s_0123456789ab/${hex32('a')}`,
      `${side.prefix}abc`,
      `${side.prefix}../${hex32('a')}`,
      `${side.prefix}${hex32('a')}/x`,
      undefined,
      42,
    ]) {
      await expect(side.download({ key: objectKey })).rejects.toThrow(
        /not in this session/,
      )
    }
    await expect(
      side.download({ key: `${side.prefix}${hex32('a')}`, versionId: 7 }),
    ).rejects.toThrow(/version/)
    expect(s3.calls).toEqual([])
  })

  test('a payload sealed for another key, another object or as another kind is refused, and still deleted', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    const objectKey = `${side.prefix}${hex32('c')}`
    const bodies = [
      sealed(`${side.prefix}${hex32('d')}`, undefined, 'x'),
      createSealer({ key: Buffer.alloc(32, 6) })(
        objectTopic(objectKey),
        { kind: KIND.PAYLOAD },
        Buffer.from('x'),
      ),
      sealed(objectKey, { kind: KIND.RESPONSE }, 'x'),
      Buffer.from('not sealed at all'),
    ]
    for (const body of bodies) {
      s3.objects.set(objectKey, {
        body,
        version: 'v1',
        lastModified: new Date(),
      })
      await expect(side.download({ key: objectKey })).rejects.toThrow(
        /not sealed/,
      )
      expect(s3.objects.has(objectKey)).toBe(false)
    }
  })

  test('S3 errors are reported without URLs or signatures', async () => {
    const s3 = fakeS3()
    s3.send = async () => {
      throw new Error(PRESIGNED_ERROR)
    }
    const side = channel(s3)
    const errors = await Promise.all([
      side.upload(Buffer.from('x')).catch((error) => error),
      side
        .download({ key: `${side.prefix}${hex32('e')}` })
        .catch((error) => error),
      side.sweep().catch((error) => error),
    ])
    for (const error of errors) {
      expect(error).toBeInstanceOf(Error)
      expect(error.message).not.toMatch(/X-Amz-|https:\/\/|abc123|AKID/)
    }
  })

  test('the sweep deletes versions under the session or stage prefix older than the cutoff, page by page', async () => {
    const now = 10_000_000
    const s3 = fakeS3({ pageSize: 2 })
    const side = channel(s3, { now: () => now })
    const stage = stagePrefix({ service: 'svc', stage: 'dev' })
    const old = new Date(now - 20 * 60_000)
    s3.objects.set(`${side.prefix}old`, {
      body: '',
      version: 'a',
      lastModified: old,
    })
    s3.objects.set(`${stage}s_crashed/x`, {
      body: '',
      version: 'b',
      lastModified: old,
    })
    s3.objects.set(`${stage}s_crashed/y`, {
      body: '',
      version: 'c',
      lastModified: old,
    })
    s3.objects.set(`${side.prefix}new`, {
      body: '',
      version: 'd',
      lastModified: new Date(now),
    })
    s3.objects.set('serverless-dev-mode/svc/dev2/s_x/z', {
      body: '',
      version: 'e',
      lastModified: old,
    })
    s3.objects.set('serverless/svc/dev/1-artifact/x.zip', {
      body: '',
      version: 'f',
      lastModified: old,
    })
    // The web bridge zip dev revisions are created from outlives every session.
    const bridgeZip = `${bridgePrefix({ service: 'svc', stage: 'dev' })}0123456789abcdef.zip`
    expect(bridgeZip).toBe(
      'serverless-dev-mode/svc/dev/bridge/0123456789abcdef.zip',
    )
    s3.objects.set(bridgeZip, { body: '', version: 'g', lastModified: old })
    expect(
      await side.sweep({ scope: stage, olderThanMs: SWEEP_OLDER_THAN_MS }),
    ).toBe(3)
    expect([...s3.objects.keys()].sort()).toEqual([
      bridgeZip,
      `${side.prefix}new`,
      'serverless-dev-mode/svc/dev2/s_x/z',
      'serverless/svc/dev/1-artifact/x.zip',
    ])
    const listings = s3.calls.filter(
      (c) => c instanceof ListObjectVersionsCommand,
    )
    expect(listings.length).toBeGreaterThan(1)
    expect(listings.every((c) => c.input.Prefix === stage)).toBe(true)
    const deletes = s3.calls.filter((c) => c instanceof DeleteObjectsCommand)
    expect(deletes.flatMap((c) => c.input.Delete.Objects)).toEqual(
      expect.arrayContaining([{ Key: `${side.prefix}old`, VersionId: 'a' }]),
    )
    expect(await side.sweep()).toBe(1)
    expect([...s3.objects.keys()].sort()).toEqual([
      bridgeZip,
      'serverless-dev-mode/svc/dev2/s_x/z',
      'serverless/svc/dev/1-artifact/x.zip',
    ])
  })

  test("the session's own sweep takes every object, whatever the machine's clock says", async () => {
    const s3 = fakeS3()
    // The machine's clock is 5 s behind S3's: an object S3 stamped a second ago is "in the future".
    const side = channel(s3, { now: () => Date.now() - 5_000 })
    s3.objects.set(`${side.prefix}${hex32('a')}`, {
      body: '',
      version: 'a',
      lastModified: new Date(Date.now() - 1_000),
    })
    expect(await side.sweep()).toBe(1)
    expect(s3.objects.size).toBe(0)
  })

  test('null versions and null delete markers are deleted with their version, as real versions are', async () => {
    const prefix = channel(versionsS3()).prefix
    const s3 = versionsS3({
      versions: [
        { Key: `${prefix}x`, VersionId: 'null' },
        { Key: `${prefix}y` },
        { Key: `${prefix}z`, VersionId: 'v3' },
      ],
      markers: [{ Key: `${prefix}m`, VersionId: 'null' }],
    })
    expect(await channel(s3).sweep()).toBe(4)
    expect(deletedObjects(s3)).toEqual([
      [
        { Key: `${prefix}x`, VersionId: 'null' },
        { Key: `${prefix}y` },
        { Key: `${prefix}z`, VersionId: 'v3' },
        { Key: `${prefix}m`, VersionId: 'null' },
      ],
    ])
  })

  test('when listing versions is denied the sweep lists and deletes by key, page by page', async () => {
    const now = 10_000_000
    const s3 = denying(ListObjectVersionsCommand, 'Access Denied', {
      pageSize: 2,
    })
    const side = channel(s3, { now: () => now })
    const stage = stagePrefix({ service: 'svc', stage: 'dev' })
    const old = new Date(now - 20 * 60_000)
    for (const name of ['a', 'b', 'c']) {
      s3.objects.set(`${stage}s_crashed/${name}`, {
        body: '',
        version: 'null',
        lastModified: old,
      })
    }
    s3.objects.set(`${stage}s_live/d`, {
      body: '',
      version: 'null',
      lastModified: new Date(now),
    })
    s3.objects.set('serverless-dev-mode/svc/dev2/s_x/z', {
      body: '',
      version: 'null',
      lastModified: old,
    })
    expect(
      await side.sweep({ scope: stage, olderThanMs: SWEEP_OLDER_THAN_MS }),
    ).toBe(3)
    expect([...s3.objects.keys()].sort()).toEqual([
      `${stage}s_live/d`,
      'serverless-dev-mode/svc/dev2/s_x/z',
    ])
    const listings = s3.calls.filter((c) => c instanceof ListObjectsV2Command)
    expect(listings.length).toBeGreaterThan(1)
    expect(listings.every((c) => c.input.Prefix === stage)).toBe(true)
    expect(
      s3.calls
        .filter((c) => c instanceof DeleteObjectsCommand)
        .flatMap((c) => c.input.Delete.Objects)
        .every((o) => !('VersionId' in o)),
    ).toBe(true)
    expect(await side.sweep()).toBe(0)
  })

  test('when both listings are denied the sweep fails with a reason that holds no URL', async () => {
    const side = channel(
      denying(
        [ListObjectVersionsCommand, ListObjectsV2Command],
        PRESIGNED_ERROR,
      ),
    )
    const error = await side.sweep().catch((e) => e)
    expect(error.message).toMatch(/could not be swept/)
    expect(error.message).not.toMatch(/X-Amz-|https:\/\/|abc123|AKID/)
  })

  test('an aborted sweep passes its signal to every S3 request and stops before the next one', async () => {
    const s3 = fakeS3({ pageSize: 1 })
    const side = channel(s3)
    for (const name of ['a', 'b', 'c']) {
      s3.objects.set(`${side.prefix}${hex32(name)}`, {
        body: '',
        version: name,
        lastModified: new Date(),
      })
    }
    const cut = new AbortController()
    const send = s3.send
    const signals = []
    s3.send = async (command, options) => {
      signals.push(options?.abortSignal)
      const result = await send(command)
      // The signal ends after the first page's delete. This fake does not act on the signal: the
      // sweep itself checks it before each next request, so that delete is the last one sent.
      if (command instanceof DeleteObjectsCommand) cut.abort()
      return result
    }
    await expect(side.sweep({ abortSignal: cut.signal })).rejects.toThrow(
      /the payload objects could not be swept/,
    )
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal === cut.signal)).toBe(true)
    expect(
      s3.calls.filter((c) => c instanceof DeleteObjectsCommand),
    ).toHaveLength(1)
    expect(s3.objects.size).toBe(2)
  })

  test('the sweep never reaches beyond the session or the stage', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    for (const scope of [
      '',
      `${SIDE_CHANNEL_ROOT}/`,
      `${SIDE_CHANNEL_ROOT}/svc/`,
      `${SIDE_CHANNEL_ROOT}/svc/dev`,
      `${SIDE_CHANNEL_ROOT}/svc/dev2/`,
      `${SIDE_CHANNEL_ROOT}/svc/dev/s_other/`,
    ]) {
      await expect(side.sweep({ scope })).rejects.toThrow(
        /session or its stage/,
      )
    }
    expect(s3.calls).toEqual([])
  })

  test('the sweep counts only what S3 deleted and reports what it could not', async () => {
    const s3 = fakeS3()
    const side = channel(s3)
    s3.objects.set(`${side.prefix}x`, {
      body: '',
      version: 'a',
      lastModified: new Date(0),
    })
    s3.objects.set(`${side.prefix}y`, {
      body: '',
      version: 'b',
      lastModified: new Date(0),
    })
    const send = s3.send
    s3.send = async (command) =>
      command instanceof DeleteObjectsCommand
        ? {
            Errors: [
              { Key: `${side.prefix}y`, VersionId: 'b', Code: 'AccessDenied' },
            ],
          }
        : send(command)
    await expect(side.sweep()).rejects.toThrow(/1 of 2 .*AccessDenied/)
  })

  test('null versions refused as AccessDenied are deleted again by key, once, and counted', async () => {
    const debug = jest.fn()
    const prefix = channel(versionsS3()).prefix
    const s3 = versionsS3({
      versions: [
        { Key: `${prefix}x`, VersionId: 'null' },
        { Key: `${prefix}y`, VersionId: 'v2' },
      ],
      markers: [{ Key: `${prefix}m`, VersionId: 'null' }],
      // Like a caller without s3:DeleteObjectVersion: every delete with a version id is refused.
      refuse: ({ VersionId }) => VersionId === 'null' && 'AccessDenied',
    })
    expect(await channel(s3, { debug }).sweep()).toBe(3)
    expect(deletedObjects(s3)).toEqual([
      [
        { Key: `${prefix}x`, VersionId: 'null' },
        { Key: `${prefix}y`, VersionId: 'v2' },
        { Key: `${prefix}m`, VersionId: 'null' },
      ],
      [{ Key: `${prefix}x` }, { Key: `${prefix}m` }],
    ])
    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug.mock.calls[0][0]).toMatch(
      /2 payload objects .*by key: .*needs s3:DeleteObjectVersion/,
    )
  })

  test('a refusal that is not AccessDenied on a null version is not retried and is reported as before', async () => {
    const prefix = channel(versionsS3()).prefix
    for (const refuse of [
      // AccessDenied on a null version and another error
      ({ Key, VersionId }) =>
        VersionId === 'null' &&
        (Key.endsWith('x') ? 'AccessDenied' : 'InternalError'),
      // AccessDenied on a null version and on a real version
      ({ Key, VersionId }) =>
        (Key.endsWith('x') || VersionId === 'v3') && 'AccessDenied',
    ]) {
      const debug = jest.fn()
      const s3 = versionsS3({
        versions: [
          { Key: `${prefix}x`, VersionId: 'null' },
          { Key: `${prefix}y`, VersionId: 'null' },
          { Key: `${prefix}z`, VersionId: 'v3' },
        ],
        refuse,
      })
      const error = await channel(s3, { debug })
        .sweep()
        .catch((e) => e)
      expect(error.message).toMatch(
        /^2 of 3 payload objects could not be deleted \((AccessDenied|InternalError)\)$/,
      )
      expect(deletedObjects(s3)).toHaveLength(1)
      expect(debug).not.toHaveBeenCalled()
    }
  })

  test('what the delete by key still refuses is reported as before', async () => {
    const prefix = channel(versionsS3()).prefix
    const s3 = versionsS3({
      versions: [
        { Key: `${prefix}x`, VersionId: 'null' },
        { Key: `${prefix}y`, VersionId: 'null' },
      ],
      refuse: ({ Key }) => Key.endsWith('y') && 'AccessDenied',
    })
    const error = await channel(s3)
      .sweep()
      .catch((e) => e)
    expect(error.message).toBe(
      '1 of 2 payload objects could not be deleted (AccessDenied)',
    )
    expect(deletedObjects(s3)).toEqual([
      [
        { Key: `${prefix}x`, VersionId: 'null' },
        { Key: `${prefix}y`, VersionId: 'null' },
      ],
      [{ Key: `${prefix}y` }],
    ])
  })

  test('SSE-C buckets are refused with a reason; bucket names with dots use path-style URLs', async () => {
    expect(
      encryptionOf({ sseCustomerAlgorithim: 'AES256', sseCustomerKey: 'k' })
        .refused,
    ).toMatch(/SSE-C/)
    expect(encryptionOf({ sseCustomerKeyMD5: 'm' }).refused).toMatch(/SSE-C/)
    expect(
      channel(fakeS3(), { deploymentBucket: { sseCustomerKey: 'k' } }),
    ).toEqual({ enabled: false, reason: expect.stringMatching(/SSE-C/) })
    expect(encryptionOf({})).toEqual({ headers: {}, params: {} })
    expect(encryptionOf(undefined)).toEqual({ headers: {}, params: {} })
    expect(encryptionOf({ serverSideEncryption: 'AES256', name: 'b' })).toEqual(
      {
        headers: { 'x-amz-server-side-encryption': 'AES256' },
        params: { ServerSideEncryption: 'AES256' },
      },
    )
    // A KMS key: the same fields deploy's uploads get, and a header for each.
    expect(
      encryptionOf({ serverSideEncryption: 'aws:kms', sseKMSKeyId: KMS_KEY }),
    ).toEqual({
      headers: {
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': KMS_KEY,
      },
      params: { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: KMS_KEY },
    })
    // A field the shared mapping sets that has no known header is refused, never signed as an
    // "undefined" header.
    const withExtraField = (params, settings) => ({
      ...params,
      ServerSideEncryption: settings.serverSideEncryption,
      BucketKeyEnabled: true,
    })
    expect(
      encryptionOf({ serverSideEncryption: 'aws:kms' }, withExtraField),
    ).toEqual({
      refused:
        'the deployment bucket uses an encryption setting Dev Mode cannot sign for the bridge (BucketKeyEnabled)',
    })
    const dotted = channel(fakeS3(), {
      bucket: 'a.b.example',
      region: 'eu-west-1',
    })
    const url = new URL((await dotted.uploadUrl()).url)
    expect(`${url.origin}${url.pathname}`).toMatch(
      /^https:\/\/s3\.eu-west-1\.amazonaws\.com\/a\.b\.example\/serverless-dev-mode\/svc\/dev\/s_0123456789ab\/[0-9a-f]{32}$/,
    )
  })
})

describe('opening the side channel for a session', () => {
  const provider = (bucket = 'b') => ({
    getServerlessDeploymentBucketName: async () => {
      if (bucket instanceof Error) throw bucket
      return bucket
    },
    getRegion: () => 'us-east-1',
    getStage: () => 'dev',
  })
  const serverless = (deploymentBucketObject) => ({
    service: { service: 'svc', provider: { deploymentBucketObject } },
  })
  const open = (overrides = {}) =>
    openSideChannel({
      provider: provider(),
      serverless: serverless(),
      sessionId: 's_0123456789ab',
      key,
      credentials: () => ({ accessKeyId: 'AKID', secretAccessKey: 's' }),
      s3: fakeS3(),
      ...overrides,
    })
  test('a usable bucket: a check object is put, read and deleted with its version, then the stage leftovers are swept', async () => {
    const s3 = fakeS3()
    const old = 'serverless-dev-mode/svc/dev/s_crashed/abc'
    const recent = 'serverless-dev-mode/svc/dev/s_live/def'
    s3.objects.set(old, {
      body: Buffer.alloc(1),
      version: 'v0',
      lastModified: new Date(Date.now() - 60 * 60_000),
    })
    s3.objects.set(recent, {
      body: Buffer.alloc(1),
      version: 'v00',
      lastModified: new Date(),
    })
    const debug = jest.fn()
    const side = await open({ s3, logger: { debug } })
    expect(side.enabled).toBe(true)
    expect(side.prefix).toBe('serverless-dev-mode/svc/dev/s_0123456789ab/')
    const put = s3.calls.find((c) => c instanceof PutObjectCommand)
    expect(put.input.Key.startsWith(side.prefix)).toBe(true)
    expect(
      s3.calls.find((c) => c instanceof GetObjectCommand).input,
    ).toMatchObject({ Key: put.input.Key })
    expect(
      s3.calls.find((c) => c instanceof DeleteObjectCommand).input,
    ).toEqual({ Bucket: 'b', Key: put.input.Key, VersionId: 'v1' })
    expect([...s3.objects.keys()]).toEqual([recent])
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/removed 1 /))
  })

  test("the start sweep's delete by key, when deleting a null version is denied, is logged at debug", async () => {
    const s3 = fakeS3()
    const old = 'serverless-dev-mode/svc/dev/s_crashed/abc'
    s3.objects.set(old, {
      body: Buffer.alloc(1),
      version: 'null',
      lastModified: new Date(Date.now() - 60 * 60_000),
    })
    const send = s3.send
    s3.send = async (command) => {
      const objects = command.input?.Delete?.Objects ?? []
      const Errors = objects
        .filter(({ VersionId }) => VersionId === 'null')
        .map(({ Key }) => ({ Key, VersionId: 'null', Code: 'AccessDenied' }))
      return Errors.length ? { Errors } : send(command)
    }
    const debug = jest.fn()
    const side = await open({ s3, logger: { debug } })
    expect(side.enabled).toBe(true)
    expect(s3.objects.has(old)).toBe(false)
    expect(debug.mock.calls.map(([text]) => text)).toEqual([
      expect.stringMatching(/deleting 1 payload objects in b by key/),
      expect.stringMatching(/removed 1 /),
    ])
  })

  test('a denied put, read or delete, a missing bucket and an SSE-C bucket disable it with a reason', async () => {
    expect(await open({ s3: denying(PutObjectCommand) })).toEqual({
      enabled: false,
      reason: expect.stringMatching(
        /may not write to the deployment bucket b under serverless-dev-mode\/ \(Access Denied\)/,
      ),
    })
    const unreadable = denying(GetObjectCommand, 'kms:Decrypt denied')
    expect(await open({ s3: unreadable })).toEqual({
      enabled: false,
      reason: expect.stringMatching(
        /may not read from the deployment bucket b under serverless-dev-mode\/ \(kms:Decrypt denied\)/,
      ),
    })
    // the check object it could not read is still deleted
    expect(unreadable.objects.size).toBe(0)
    expect(await open({ s3: denying(DeleteObjectCommand) })).toEqual({
      enabled: false,
      reason: expect.stringMatching(
        /may not delete from the deployment bucket b under serverless-dev-mode\//,
      ),
    })
    expect(
      await open({ provider: provider(new Error('Stack does not exist')) }),
    ).toEqual({
      enabled: false,
      reason: expect.stringMatching(
        /could not find the deployment bucket \(Stack does not exist\)/,
      ),
    })
    expect(
      await open({
        serverless: serverless({
          sseCustomerKey: 'k',
          sseCustomerAlgorithim: 'AES256',
        }),
      }),
    ).toEqual({ enabled: false, reason: expect.stringMatching(/SSE-C/) })
  })

  test('another failure disables it with a reason that holds no URL or signature', async () => {
    const s3 = fakeS3()
    s3.send = async () => {
      throw Object.assign(new Error(PRESIGNED_ERROR), {
        name: 'PermanentRedirect',
        $metadata: { httpStatusCode: 301 },
      })
    }
    const side = await open({ s3 })
    expect(side).toEqual({
      enabled: false,
      reason: expect.stringMatching(
        /the deployment bucket b could not be used/,
      ),
    })
    expect(side.reason).not.toMatch(/X-Amz-|https:\/\/|abc123|AKID/)
  })

  test('it never throws', async () => {
    const broken = {
      ...provider(),
      getRegion: () => {
        throw new Error('no region')
      },
    }
    expect(await open({ provider: broken })).toEqual({
      enabled: false,
      reason: expect.stringMatching(/no region/),
    })
    expect(await open({ serverless: {} })).toEqual({
      enabled: false,
      reason: expect.any(String),
    })
  })

  test('the sweep at the start is ended after START_SWEEP_MS: its request is aborted, and the side channel stays on', async () => {
    expect(START_SWEEP_MS).toBe(10_000)
    const s3 = fakeS3()
    const send = s3.send
    let listing = false
    let aborted = false
    s3.send = (command, options) => {
      if (!(command instanceof ListObjectVersionsCommand)) return send(command)
      listing = true
      // A listing that never answers ends only when its signal aborts.
      return new Promise((resolve, reject) =>
        options?.abortSignal?.addEventListener('abort', () => {
          aborted = true
          reject(options.abortSignal.reason)
        }),
      )
    }
    const pending = new Map()
    let next = 0
    const timers = {
      setTimeout: (fn, ms) => {
        next += 1
        pending.set(next, { fn, ms })
        return next
      },
      clearTimeout: (handle) => pending.delete(handle),
    }
    const debug = jest.fn()
    const opening = open({ s3, logger: { debug }, timers, sweepMs: 25 })
    // Once the listing is under way, the bound fires.
    while (!listing) await new Promise((resolve) => setImmediate(resolve))
    expect([...pending.values()].map(({ ms }) => ms)).toEqual([25])
    for (const [handle, { fn }] of pending) {
      pending.delete(handle)
      fn()
    }
    const side = await opening
    expect(aborted).toBe(true)
    expect(side.enabled).toBe(true)
    expect(debug).toHaveBeenCalledWith(
      'Dev Mode stopped sweeping earlier payload objects after 0.025 s; a later session removes the rest',
    )
    expect(pending.size).toBe(0)
  })

  test('a sweep that fails at the start is logged and the side channel stays on', async () => {
    const debug = jest.fn()
    const side = await open({
      s3: denying(
        [ListObjectVersionsCommand, ListObjectsV2Command],
        PRESIGNED_ERROR,
      ),
      logger: { debug },
    })
    expect(side.enabled).toBe(true)
    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug.mock.calls[0][0]).toMatch(/could not sweep/)
    expect(debug.mock.calls[0][0]).not.toMatch(/X-Amz-|https:\/\//)
  })
})
