/**
 * Payloads above one AWS IoT Core message travel through the service's deployment bucket, under
 * `serverless-dev-mode/<service>/<stage>/<session>/`. This machine does every S3 call with the
 * developer's own credentials and hands the bridge presigned URLs, so the function's role needs no
 * S3 or KMS permission: the bucket's encryption settings, KMS key and bucket policy apply exactly
 * as they do for `serverless deploy`. Every object is one sealed frame (its topic is `s3/<key>`),
 * and every object is deleted with its version right after it is read; a session sweeps its own
 * prefix when it ends, and the service and stage's leftovers older than 15 minutes when it starts.
 *
 * Presigned URLs are credentials until they expire: no URL, query string or signature goes into
 * an error, a reason or a log line from here.
 */
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomBytes as nodeRandomBytes } from 'crypto'
import {
  KIND,
  SIDE_CHANNEL_ROOT,
  createSealer,
  decodeFrame,
  openRaw,
} from './protocol.js'
import { withoutSecrets } from './redact.js'
import setS3UploadEncryptionOptions from '../../../../aws/set-s3-upload-encryption-options.js'

export { SIDE_CHANNEL_ROOT }
/** How long a presigned URL is valid. */
export const URL_TTL_SECONDS = 15 * 60
/** At the start of a session, objects of the stage older than this are an earlier session's. */
export const SWEEP_OLDER_THAN_MS = 15 * 60_000
/**
 * How long the start of a session waits for the sweep of earlier sessions' leftovers: what it
 * has not removed by then, a later start removes.
 */
export const START_SWEEP_MS = 10_000
// S3 DeleteObjects takes at most 1000 keys.
const DELETE_BATCH = 1000
// The name of every object this machine hands out: 16 random bytes in hex.
const OBJECT_NAME = /^[0-9a-f]{32}$/

/** The topic an object's frame is sealed for: an object cannot be swapped for another. */
export const objectTopic = (key) => `s3/${key}`

/** Every Dev Mode object of one service and stage is under this prefix. */
export const stagePrefix = ({ service, stage }) =>
  `${SIDE_CHANNEL_ROOT}/${service}/${stage}/`

// The header each PutObject encryption field travels in, for the presigned PUT the bridge sends:
// the fields the shared mapping sets once SSE-C is refused.
const ENCRYPTION_HEADERS = {
  ServerSideEncryption: 'x-amz-server-side-encryption',
  SSEKMSKeyId: 'x-amz-server-side-encryption-aws-kms-key-id',
}

/**
 * The PutObject fields and the headers a presigned PUT signs (the bridge sends them as they are),
 * from the deployment bucket settings (`provider.deploymentBucket`), with the mapping
 * `serverless deploy` uses for its uploads (`mapping`). SSE-C needs the customer key on every
 * request, so it is refused: the key would have to travel to the bridge. A field the mapping sets
 * that has no known header is refused too, rather than signed under a header the bridge cannot
 * send.
 */
export const encryptionOf = (
  deploymentBucket = {},
  mapping = setS3UploadEncryptionOptions,
) => {
  const settings = deploymentBucket ?? {}
  if (
    settings.sseCustomerAlgorithim ||
    settings.sseCustomerKey ||
    settings.sseCustomerKeyMD5
  ) {
    return {
      refused:
        'the deployment bucket uses customer-provided encryption keys (SSE-C)',
    }
  }
  const params = mapping({}, settings)
  const unsigned = Object.keys(params).find(
    (field) => !Object.hasOwn(ENCRYPTION_HEADERS, field),
  )
  if (unsigned) {
    return {
      refused: `the deployment bucket uses an encryption setting Dev Mode cannot sign for the bridge (${unsigned})`,
    }
  }
  const headers = Object.fromEntries(
    Object.entries(params).map(([field, value]) => [
      ENCRYPTION_HEADERS[field],
      String(value),
    ]),
  )
  return { headers, params }
}

export const disabledSideChannel = (reason) => ({ enabled: false, reason })

const isDenied = (error) =>
  /AccessDenied|Forbidden/.test(`${error?.name ?? ''} ${error?.Code ?? ''}`) ||
  error?.$metadata?.httpStatusCode === 403

const describe = (error) => withoutSecrets(error?.message ?? error)
const failure = (what, error) => new Error(`${what}: ${describe(error)}`)

export const createSideChannel = ({
  s3, // an S3Client with the developer's credentials
  bucket,
  region,
  service,
  stage,
  sessionId,
  key,
  deploymentBucket,
  credentials, // () => the current { accessKeyId, secretAccessKey, sessionToken }
  now = Date.now,
  randomBytes = nodeRandomBytes,
  debug = () => {},
}) => {
  const encryption = encryptionOf(deploymentBucket)
  if (encryption.refused) return disabledSideChannel(encryption.refused)
  const stageScope = stagePrefix({ service, stage })
  const prefix = `${stageScope}${sessionId}/`
  const seal = createSealer({ key, randomBytes })
  const newKey = () => `${prefix}${randomBytes(16).toString('hex')}`
  const isSessionObject = (objectKey) =>
    typeof objectKey === 'string' &&
    objectKey.startsWith(prefix) &&
    OBJECT_NAME.test(objectKey.slice(prefix.length))

  // Presigning makes no request: a client of its own signs with the credentials current at that
  // moment (a new one when they were refreshed). It adds no checksum: a checksum signed into the
  // URL would be the empty body's, and the bridge's PUT would fail it.
  let signer = { credentials: undefined, client: undefined }
  const signingClient = () => {
    const current = credentials()
    if (signer.credentials !== current) {
      signer = {
        credentials: current,
        client: new S3Client({
          region,
          credentials: current,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        }),
      }
    }
    return signer.client
  }
  // The encryption headers stay signed headers the bridge sends (`unhoistableHeaders`), never query
  // parameters: S3 takes encryption settings and a bucket policy checks them only as headers.
  const presign = (command, signedHeaders = []) =>
    getSignedUrl(signingClient(), command, {
      expiresIn: URL_TTL_SECONDS,
      signingDate: new Date(now()),
      unhoistableHeaders: new Set(signedHeaders),
    })

  /** Puts one sealed object; its version id, or undefined in a bucket without versioning. */
  const put = async (objectKey, body) => {
    const sealed = seal(
      objectTopic(objectKey),
      { kind: KIND.PAYLOAD },
      Buffer.from(body),
    )
    const result = await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: sealed,
        ...encryption.params,
      }),
    )
    return result?.VersionId ?? undefined
  }

  /** Refuses a payload reference outside this session's prefix, or with a version id that is not one. */
  const checkPayload = (objectKey, versionId) => {
    if (!isSessionObject(objectKey)) {
      throw new Error("the payload is not in this session's prefix")
    }
    if (versionId !== undefined && typeof versionId !== 'string') {
      throw new Error('the payload has no valid version id')
    }
  }

  const deleteVersion = (objectKey, versionId) =>
    s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ...(versionId && { VersionId: versionId }),
      }),
    )

  /**
   * Reads one object (that version, when given), then deletes the version read, whether or not it
   * opens. A failed delete is left to the session's sweep.
   */
  const readAndDelete = async (objectKey, versionId) => {
    let readVersion = versionId
    let found = Boolean(versionId)
    try {
      const got = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ...(versionId && { VersionId: versionId }),
        }),
      )
      found = true
      readVersion = versionId ?? got.VersionId ?? undefined
      return Buffer.from(await got.Body.transformToByteArray())
    } finally {
      if (found) await deleteVersion(objectKey, readVersion).catch(() => {})
    }
  }

  /** Pages of the current objects under `scope`: `{ Key, LastModified }`, deleted by key. */
  const listCurrentPages = async function* (scope, abortSignal) {
    let token
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: scope,
          ...(token && { ContinuationToken: token }),
        }),
        { abortSignal },
      )
      yield (page?.Contents ?? []).map(({ Key, LastModified }) => ({
        Key,
        LastModified,
      }))
      token = page?.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
  }

  /**
   * Pages of every version and delete marker under `scope`; when listing versions is denied, of
   * the current objects instead (a bucket without versioning has nothing more).
   */
  const listPages = async function* (scope, abortSignal) {
    let markers = {}
    while (markers) {
      let page
      try {
        page = await s3.send(
          new ListObjectVersionsCommand({
            Bucket: bucket,
            Prefix: scope,
            ...markers,
          }),
          { abortSignal },
        )
      } catch (error) {
        if (!isDenied(error)) throw error
        yield* listCurrentPages(scope, abortSignal)
        return
      }
      yield [...(page?.Versions ?? []), ...(page?.DeleteMarkers ?? [])]
      markers =
        page?.IsTruncated && page.NextKeyMarker
          ? {
              KeyMarker: page.NextKeyMarker,
              VersionIdMarker: page.NextVersionIdMarker,
            }
          : undefined
    }
  }

  /** Deletes one batch of objects; the ones S3 refused. */
  const deleteBatch = async (batch, abortSignal) => {
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch, Quiet: true },
      }),
      { abortSignal },
    )
    return result?.Errors ?? []
  }

  /**
   * Deletes the objects, with their version ids when they have them, in batches. A batch whose
   * refused deletes are all denied deletes of "null" versions is retried once with those keys
   * alone: a bucket that was never versioned lists every object as a "null" version, and deleting
   * one by version id needs s3:DeleteObjectVersion, which a delete by key does not. (In a bucket
   * with versioning suspended, a delete by key leaves an empty "null" delete marker in its place.)
   */
  const deleteVersions = async (objects, abortSignal) => {
    let deleted = 0
    const errors = []
    for (let at = 0; at < objects.length; at += DELETE_BATCH) {
      const batch = objects.slice(at, at + DELETE_BATCH)
      let refused = await deleteBatch(batch, abortSignal)
      if (
        refused.length &&
        refused.every(
          ({ Code, VersionId }) =>
            Code === 'AccessDenied' && VersionId === 'null',
        )
      ) {
        debug(
          `Dev Mode is deleting ${refused.length} payload objects in ${bucket} by key: deleting them by version needs s3:DeleteObjectVersion`,
        )
        refused = await deleteBatch(
          refused.map(({ Key }) => ({ Key })),
          abortSignal,
        )
      }
      errors.push(...refused)
      deleted += batch.length - refused.length
    }
    return { deleted, errors }
  }

  return {
    enabled: true,
    prefix,
    /**
     * Puts, reads and deletes (with its version) one empty sealed object: whether the developer's
     * credentials, the bucket policy and its KMS key allow what the side channel does. A failure
     * carries `step`: what was refused.
     */
    async check() {
      const objectKey = newKey()
      let step = 'write to'
      let versionId
      try {
        versionId = await put(objectKey, Buffer.alloc(0))
        step = 'read from'
        const got = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            ...(versionId && { VersionId: versionId }),
          }),
        )
        await got?.Body?.transformToByteArray?.()
        step = 'delete from'
        await deleteVersion(objectKey, versionId)
      } catch (error) {
        // A check object that was written but could not be read is still deleted when it can be.
        if (step === 'read from') {
          await deleteVersion(objectKey, versionId).catch(() => {})
        }
        throw Object.assign(error instanceof Error ? error : new Error(error), {
          step,
        })
      }
    },
    /** Seals and uploads a result; the bridge reads it with `get` and deletes it with `delete`. */
    async upload(body) {
      const objectKey = newKey()
      try {
        const versionId = await put(objectKey, body)
        const version = versionId ? { VersionId: versionId } : {}
        const [get, del] = await Promise.all([
          presign(
            new GetObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              ...version,
            }),
          ),
          presign(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              ...version,
            }),
          ),
        ])
        return { key: objectKey, get, delete: del }
      } catch (error) {
        throw failure(
          'the payload could not be put in the deployment bucket',
          error,
        )
      }
    },
    /** A presigned PUT for one request payload the bridge uploads; it sends `headers` with it. */
    async uploadUrl() {
      const objectKey = newKey()
      const headers = { ...encryption.headers }
      try {
        const url = await presign(
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            ...encryption.params,
          }),
          Object.keys(headers),
        )
        return { url, headers, key: objectKey, ttlMs: URL_TTL_SECONDS * 1000 }
      } catch (error) {
        throw failure('an upload URL could not be signed', error)
      }
    },
    /** Downloads, deletes (with its version) and opens a payload the bridge uploaded. */
    async download({ key: objectKey, versionId } = {}) {
      checkPayload(objectKey, versionId)
      let data
      try {
        data = await readAndDelete(objectKey, versionId || undefined)
      } catch (error) {
        throw failure('the payload could not be read', error)
      }
      const opened = openRaw({
        key,
        topic: objectTopic(objectKey),
        message: data,
      })
      const frame = opened && decodeFrame(opened.plaintext)
      if (frame?.header.kind !== KIND.PAYLOAD) {
        throw new Error('the payload is not sealed for this session')
      }
      return frame.body
    },
    /**
     * Deletes (with its version) a payload the bridge uploaded for a request this machine did not
     * take, without reading it. A failed delete rejects; the session's sweep removes it later.
     */
    async discard({ key: objectKey, versionId } = {}) {
      checkPayload(objectKey, versionId)
      await deleteVersion(objectKey, versionId || undefined)
    },
    /**
     * Deletes every version and delete marker under `scope` older than `olderThanMs`: this
     * session's prefix (the default) or its stage's, never anything wider. Returns the count.
     * `abortSignal`, when it aborts, ends the S3 request under way and the sweep with it.
     */
    async sweep({ scope = prefix, olderThanMs = 0, abortSignal } = {}) {
      if (scope !== prefix && scope !== stageScope) {
        throw new Error('a sweep covers only this session or its stage')
      }
      // Only leftovers of other sessions are told apart by age; a session's own prefix is swept
      // whole, so a machine clock behind S3's never keeps an object.
      const cutoff = olderThanMs > 0 ? now() - olderThanMs : Infinity
      let deleted = 0
      let listed = 0
      const errors = []
      try {
        for await (const entries of listPages(scope, abortSignal)) {
          abortSignal?.throwIfAborted()
          const objects = entries
            .filter(
              (entry) =>
                entry.Key?.startsWith(scope) &&
                new Date(entry.LastModified).getTime() <= cutoff,
            )
            .map(({ Key, VersionId }) =>
              VersionId ? { Key, VersionId } : { Key },
            )
          listed += objects.length
          const result = await deleteVersions(objects, abortSignal)
          deleted += result.deleted
          errors.push(...result.errors)
        }
      } catch (error) {
        throw failure('the payload objects could not be swept', error)
      }
      if (errors.length) {
        throw new Error(
          `${errors.length} of ${listed} payload objects could not be deleted (${errors[0].Code})`,
        )
      }
      return deleted
    },
  }
}

/**
 * The session's side channel, or a disabled one with the reason: the stage's deployment bucket,
 * its encryption settings, and a check object (one tiny sealed object put, read and deleted with
 * its version, with the developer's credentials); then a sweep of this service and stage's
 * leftovers older than 15 minutes (a crashed session's), ended after sweepMs. Never throws.
 */
export const openSideChannel = async ({
  provider,
  serverless,
  sessionId,
  key,
  credentials,
  s3,
  logger,
  now = Date.now,
  randomBytes = nodeRandomBytes,
  timers = { setTimeout, clearTimeout },
  sweepMs = START_SWEEP_MS,
}) => {
  const debug = (text) => {
    try {
      logger?.debug?.(text)
    } catch {
      // Logging never fails the session.
    }
  }
  try {
    let bucket
    try {
      bucket = await provider.getServerlessDeploymentBucketName()
    } catch (error) {
      return disabledSideChannel(
        `Dev Mode could not find the deployment bucket (${describe(error)})`,
      )
    }
    const service = serverless.service.service
    const stage = provider.getStage()
    const channel = createSideChannel({
      s3,
      bucket,
      region: provider.getRegion(),
      service,
      stage,
      sessionId,
      key,
      deploymentBucket: serverless.service.provider?.deploymentBucketObject,
      credentials,
      now,
      randomBytes,
      debug,
    })
    if (!channel.enabled) return channel
    try {
      await channel.check()
    } catch (error) {
      return disabledSideChannel(
        isDenied(error)
          ? `your AWS credentials may not ${error.step} the deployment bucket ${bucket} under ${SIDE_CHANNEL_ROOT}/ (${describe(error)})`
          : `the deployment bucket ${bucket} could not be used (${describe(error)})`,
      )
    }
    const sweepCut = new AbortController()
    const sweepTimer = timers.setTimeout(() => sweepCut.abort(), sweepMs)
    try {
      const swept = await channel.sweep({
        scope: stagePrefix({ service, stage }),
        olderThanMs: SWEEP_OLDER_THAN_MS,
        abortSignal: sweepCut.signal,
      })
      if (swept) {
        debug(
          `Dev Mode removed ${swept} payload objects an earlier session left in ${bucket}`,
        )
      }
    } catch (error) {
      debug(
        sweepCut.signal.aborted
          ? `Dev Mode stopped sweeping earlier payload objects after ${sweepMs / 1000} s; a later session removes the rest`
          : `Dev Mode could not sweep earlier payload objects: ${describe(error)}`,
      )
    } finally {
      timers.clearTimeout(sweepTimer)
    }
    return channel
  } catch (error) {
    return disabledSideChannel(
      `Dev Mode could not set up the deployment bucket (${describe(error)})`,
    )
  }
}
