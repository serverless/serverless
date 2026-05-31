/**
 * In-memory S3 bucket, object and multipart store for sls offline.
 *
 * Models the core S3 data plane: buckets holding keyed objects, plus the
 * multipart-upload state machine (initiate → upload parts → complete/abort).
 * Object bodies are kept as Buffers. ETags are quoted hex md5 digests of the
 * body; a completed multipart object carries the S3 composite ETag
 * (`"<md5-of-concatenated-part-digests>-<partCount>"`).
 *
 * After every successful mutating operation the store invokes `onMutation`
 * with `{ bucket, key, eventName, size, etag, sequencer, origin }` so a notifier
 * can derive S3 events. `sequencer` is a monotonically increasing hex counter;
 * `origin` is an optional tag a caller passes through (e.g. `'drop-folder'`) so
 * a downstream consumer can tell SDK-originated writes apart from filesystem
 * ones and avoid mirroring a change back to its source.
 *
 * All time reads go through an injectable `now()` so `lastModified` /
 * `initiated` timestamps are deterministic under test.
 */

import { createHash, randomUUID } from 'node:crypto'

/** Content-Type assigned to objects stored without an explicit type. */
const DEFAULT_CONTENT_TYPE = 'binary/octet-stream'

/** Default cap on keys returned by a single list call, matching S3. */
const DEFAULT_MAX_KEYS = 1000

/**
 * A tagged error carrying an AWS error `code`; callers map it to an HTTP
 * status + XML envelope.
 */
export class S3StoreError extends Error {
  /**
   * @param {string} code - the AWS error code (e.g. `NoSuchBucket`).
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'S3StoreError'
    this.code = code
  }
}

/**
 * Quoted hex md5 ETag of a buffer, e.g. `"acbd18db4cc2f85cedef654fccc4a4d8"`.
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
function quotedEtag(buffer) {
  return '"' + createHash('md5').update(buffer).digest('hex') + '"'
}

/**
 * Raw 16-byte md5 digest of a buffer (the building block of the composite
 * ETag).
 *
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function md5DigestBuffer(buffer) {
  return createHash('md5').update(buffer).digest()
}

/**
 * Parse an HTTP `bytes=start-end` Range against an object of `size` bytes.
 * Supports closed ranges (`bytes=2-5`), open-ended ranges (`bytes=4-`) and
 * suffix ranges (`bytes=-512`).
 *
 * Returns `null` when the header is absent or not a byte range (the caller then
 * serves the full body). Returns `{ invalid: true }` for an unsatisfiable range
 * — a start at or past the object size, a reversed range (`start > end`), or a
 * zero-length suffix (`bytes=-0`) — which S3 answers with 416. A range whose end
 * lies past the last byte is CLAMPED to `size - 1` and is satisfiable (206).
 *
 * @param {string | undefined} range
 * @param {number} size
 * @returns {{ start: number, end: number } | { invalid: true } | null}
 */
function parseRange(range, size) {
  if (!range) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match

  if (rawStart === '' && rawEnd === '') return null

  if (rawStart === '') {
    // Suffix range: the last `rawEnd` bytes. A zero-length suffix (`bytes=-0`)
    // requests no bytes and is unsatisfiable.
    const suffix = Number(rawEnd)
    if (suffix <= 0) return { invalid: true }
    const start = Math.max(0, size - suffix)
    return { start, end: size - 1 }
  }

  const start = Number(rawStart)
  // A start at or past the size cannot be served.
  if (start >= size) return { invalid: true }
  // An end past the last byte is clamped; a reversed range is unsatisfiable.
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (start > end) return { invalid: true }
  return { start, end }
}

/**
 * Creates and returns a fresh, empty in-memory bucket store.
 *
 * @param {{
 *   onMutation?: (event: {
 *     bucket: string,
 *     key: string,
 *     eventName: string,
 *     size: number,
 *     etag: string,
 *     sequencer: string,
 *   }) => void,
 *   now?: () => number,
 * }} [options]
 * @returns {object} The store API (see method JSDoc below).
 */
export function createBucketStore({ onMutation, now = () => Date.now() } = {}) {
  /**
   * Map<bucketName, {
   *   createdAt: number,
   *   objects: Map<key, StoredObject>,
   *   uploads: Map<uploadId, StoredUpload>,
   * }>
   *
   * StoredObject = { body, contentType, metadata, size, etag, lastModified }
   * StoredUpload = { key, contentType, metadata, initiated, parts: Map }
   */
  const buckets = new Map()

  /** Monotonic counter feeding the mutation `sequencer`. */
  let sequence = 0

  /**
   * Resolve the next sequencer value as an upper-cased, zero-padded hex string
   * (the shape S3 emits in event notifications).
   *
   * @returns {string}
   */
  function nextSequencer() {
    sequence += 1
    return sequence.toString(16).toUpperCase().padStart(16, '0')
  }

  /**
   * Notify the mutation hook (if any) of a successful mutating op.
   *
   * @param {string} bucket
   * @param {string} key
   * @param {string} eventName
   * @param {number} size
   * @param {string} etag
   * @param {string} [origin] - optional caller-supplied origin tag, passed
   *   through verbatim so a consumer can tell SDK writes from filesystem writes.
   */
  function emitMutation(bucket, key, eventName, size, etag, origin) {
    if (!onMutation) return
    onMutation({
      bucket,
      key,
      eventName,
      size,
      etag,
      sequencer: nextSequencer(),
      origin,
    })
  }

  /**
   * Return a bucket record or throw `NoSuchBucket`.
   *
   * @param {string} name
   * @returns {object}
   */
  function requireBucket(name) {
    const bucket = buckets.get(name)
    if (!bucket) {
      throw new S3StoreError(
        'NoSuchBucket',
        'The specified bucket does not exist.',
      )
    }
    return bucket
  }

  /**
   * Ensure a bucket exists, creating an empty one if missing. Idempotent.
   *
   * @param {string} name
   * @returns {void}
   */
  function ensureBucket(name) {
    if (buckets.has(name)) return
    buckets.set(name, {
      createdAt: now(),
      objects: new Map(),
      uploads: new Map(),
    })
  }

  /**
   * Create a bucket. Idempotent-ish: re-creating an existing bucket keeps its
   * objects and uploads untouched (first create wins).
   *
   * @param {string} name
   * @returns {void}
   */
  function createBucket(name) {
    ensureBucket(name)
  }

  /**
   * Whether a bucket exists.
   *
   * @param {string} name
   * @returns {boolean}
   */
  function hasBucket(name) {
    return buckets.has(name)
  }

  /**
   * List buckets with their creation time.
   *
   * @returns {{ name: string, createdAt: number }[]}
   */
  function listBuckets() {
    return [...buckets.entries()].map(([name, bucket]) => ({
      name,
      createdAt: bucket.createdAt,
    }))
  }

  /**
   * Delete a bucket. Throws `BucketNotEmpty` if it still holds objects.
   *
   * @param {string} name
   * @returns {void}
   */
  function deleteBucket(name) {
    const bucket = requireBucket(name)
    if (bucket.objects.size > 0) {
      throw new S3StoreError(
        'BucketNotEmpty',
        'The bucket you tried to delete is not empty.',
      )
    }
    buckets.delete(name)
  }

  /**
   * Store an object, overwriting any existing key.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {{ body: Buffer, contentType?: string, metadata?: object }} input
   * @param {{ origin?: string }} [options] - an optional origin tag forwarded
   *   verbatim to `onMutation` (e.g. `'drop-folder'`).
   * @returns {{ etag: string }}
   */
  function putObject(
    bucketName,
    key,
    { body, contentType, metadata } = {},
    { origin } = {},
  ) {
    const bucket = requireBucket(bucketName)
    const etag = quotedEtag(body)
    bucket.objects.set(key, {
      body,
      contentType: contentType || DEFAULT_CONTENT_TYPE,
      metadata: metadata || {},
      size: body.length,
      etag,
      lastModified: now(),
    })
    emitMutation(
      bucketName,
      key,
      'ObjectCreated:Put',
      body.length,
      etag,
      origin,
    )
    return { etag }
  }

  /**
   * Retrieve an object, optionally slicing it to a byte range.
   *
   * An unsatisfiable range (start at/past size, reversed, or `bytes=-0`) yields
   * `{ invalidRange: true, size }` with no body, which the op layer maps to 416.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {{ range?: string }} [options]
   * @returns {{
   *   body: Buffer,
   *   etag: string,
   *   contentType: string,
   *   metadata: object,
   *   lastModified: number,
   *   size: number,
   *   contentRange?: string,
   * } | { invalidRange: true, size: number } | null}
   */
  function getObject(bucketName, key, { range } = {}) {
    const bucket = buckets.get(bucketName)
    if (!bucket) return null
    const object = bucket.objects.get(key)
    if (!object) return null

    const parsed = parseRange(range, object.size)
    if (parsed && parsed.invalid) {
      return { invalidRange: true, size: object.size }
    }

    const base = {
      etag: object.etag,
      contentType: object.contentType,
      metadata: object.metadata,
      lastModified: object.lastModified,
      size: object.size,
    }

    if (parsed) {
      return {
        ...base,
        body: object.body.subarray(parsed.start, parsed.end + 1),
        contentRange: `bytes ${parsed.start}-${parsed.end}/${object.size}`,
      }
    }

    return { ...base, body: object.body }
  }

  /**
   * Retrieve an object's metadata without its body.
   *
   * @param {string} bucketName
   * @param {string} key
   * @returns {{
   *   etag: string,
   *   contentType: string,
   *   metadata: object,
   *   lastModified: number,
   *   size: number,
   * } | null}
   */
  function headObject(bucketName, key) {
    const bucket = buckets.get(bucketName)
    if (!bucket) return null
    const object = bucket.objects.get(key)
    if (!object) return null
    return {
      etag: object.etag,
      contentType: object.contentType,
      metadata: object.metadata,
      lastModified: object.lastModified,
      size: object.size,
    }
  }

  /**
   * Delete an object. Idempotent: deleting a missing key is a no-op and does
   * not fire `onMutation`.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {{ origin?: string }} [options] - an optional origin tag forwarded
   *   verbatim to `onMutation` (e.g. `'drop-folder'`).
   * @returns {void}
   */
  function deleteObject(bucketName, key, { origin } = {}) {
    const bucket = buckets.get(bucketName)
    if (!bucket) return
    if (!bucket.objects.has(key)) return
    bucket.objects.delete(key)
    emitMutation(bucketName, key, 'ObjectRemoved:Delete', 0, '', origin)
  }

  /**
   * Delete a batch of keys. Missing keys are reported as deleted (matching S3,
   * which treats DeleteObjects as idempotent). `onMutation` fires only for keys
   * that actually existed.
   *
   * @param {string} bucketName
   * @param {string[]} keys
   * @returns {{
   *   deleted: { key: string }[],
   *   errors: { key: string, code: string, message: string }[],
   * }}
   */
  function deleteObjects(bucketName, keys) {
    const bucket = requireBucket(bucketName)
    const deleted = []
    const errors = []
    for (const key of keys) {
      const existed = bucket.objects.has(key)
      bucket.objects.delete(key)
      if (existed) {
        emitMutation(bucketName, key, 'ObjectRemoved:Delete', 0, '')
      }
      deleted.push({ key })
    }
    return { deleted, errors }
  }

  /**
   * Copy an object. With `metadataDirective === 'REPLACE'` the destination
   * takes the supplied `contentType`/`metadata`; otherwise it inherits the
   * source's.
   *
   * @param {{
   *   srcBucket: string,
   *   srcKey: string,
   *   dstBucket: string,
   *   dstKey: string,
   *   metadata?: object,
   *   contentType?: string,
   *   metadataDirective?: 'COPY' | 'REPLACE',
   * }} input
   * @returns {{ etag: string, lastModified: number }}
   */
  function copyObject({
    srcBucket,
    srcKey,
    dstBucket,
    dstKey,
    metadata,
    contentType,
    metadataDirective,
  }) {
    const source = buckets.get(srcBucket)
    const sourceObject = source && source.objects.get(srcKey)
    if (!sourceObject) {
      throw new S3StoreError('NoSuchKey', 'The specified key does not exist.')
    }
    const destination = requireBucket(dstBucket)

    const replace = metadataDirective === 'REPLACE'
    const lastModified = now()
    destination.objects.set(dstKey, {
      body: sourceObject.body,
      contentType: replace
        ? contentType || DEFAULT_CONTENT_TYPE
        : sourceObject.contentType,
      metadata: replace ? metadata || {} : sourceObject.metadata,
      size: sourceObject.size,
      etag: sourceObject.etag,
      lastModified,
    })

    emitMutation(
      dstBucket,
      dstKey,
      'ObjectCreated:Copy',
      sourceObject.size,
      sourceObject.etag,
    )
    return { etag: sourceObject.etag, lastModified }
  }

  /**
   * Build the lexicographically-sorted, prefix-filtered key list shared by the
   * v1 and v2 listing implementations.
   *
   * @param {object} bucket
   * @param {string} [prefix]
   * @returns {string[]}
   */
  function sortedKeys(bucket, prefix) {
    let keys = [...bucket.objects.keys()]
    if (prefix) keys = keys.filter((k) => k.startsWith(prefix))
    return keys.sort()
  }

  /**
   * Project a stored object into a list-entry record.
   *
   * @param {object} bucket
   * @param {string} key
   * @returns {{ key: string, size: number, etag: string, lastModified: number }}
   */
  function listEntry(bucket, key) {
    const object = bucket.objects.get(key)
    return {
      key,
      size: object.size,
      etag: object.etag,
      lastModified: object.lastModified,
    }
  }

  /**
   * Walk a sorted, prefix-filtered key set and assemble one page of the listing
   * shared by the v1 and v2 implementations.
   *
   * Keys are visited in lexical order. With a `delimiter`, a key whose remainder
   * after `prefix` contains the delimiter is rolled up into a CommonPrefix
   * (emitted once); every other key becomes a Contents entry. Both Contents
   * entries and freshly-opened CommonPrefixes count one slot each against the
   * effective page size, which is clamped to {@link DEFAULT_MAX_KEYS}.
   *
   * The continuation cursor is the last RAW underlying key consumed on the page
   * — whether it was emitted as Contents or folded into a CommonPrefix. Resuming
   * with `key > cursor` therefore skips the entire already-emitted prefix group
   * (its members all sort at or below that raw key), so each CommonPrefix is
   * emitted exactly once and pagination always makes forward progress.
   *
   * @param {object} bucket
   * @param {string[]} keys - sorted, prefix-filtered, post-cursor keys.
   * @param {string} prefix
   * @param {string} [delimiter]
   * @param {number} maxKeys - the client's requested page size (may exceed the
   *   cap; the effective size is clamped to {@link DEFAULT_MAX_KEYS}).
   * @returns {{
   *   contents: object[],
   *   commonPrefixes: string[],
   *   isTruncated: boolean,
   *   keyCount: number,
   *   nextToken?: string,
   * }}
   */
  function buildListPage(bucket, keys, prefix, delimiter, maxKeys) {
    const effectiveMax = Math.min(maxKeys, DEFAULT_MAX_KEYS)

    // A maxKeys of 0 is a valid existence probe: an empty, non-truncated list
    // with no continuation cursor (S3 answers a 200 empty ListBucketResult).
    if (effectiveMax <= 0) {
      return {
        contents: [],
        commonPrefixes: [],
        isTruncated: false,
        keyCount: 0,
      }
    }

    const contents = []
    const commonPrefixes = []
    let slots = 0
    let lastRawKey
    let consumed = 0

    let index = 0
    while (index < keys.length) {
      if (slots >= effectiveMax) break
      const key = keys[index]

      let commonPrefix
      if (delimiter) {
        const rest = key.slice(prefix.length)
        const idx = rest.indexOf(delimiter)
        if (idx !== -1) {
          commonPrefix = prefix + rest.slice(0, idx + delimiter.length)
        }
      }

      if (commonPrefix !== undefined) {
        // Open the prefix group and absorb every contiguous member (the keys
        // are sorted, so a group is a run). The cursor advances to the LAST
        // member so resuming with `key > cursor` skips the whole group — the
        // prefix is emitted exactly once even when a page boundary lands inside
        // the group.
        commonPrefixes.push(commonPrefix)
        while (index < keys.length && keys[index].startsWith(commonPrefix)) {
          lastRawKey = keys[index]
          consumed += 1
          index += 1
        }
      } else {
        contents.push(listEntry(bucket, key))
        lastRawKey = key
        consumed += 1
        index += 1
      }

      slots += 1
    }

    const isTruncated = consumed < keys.length
    const result = {
      contents,
      commonPrefixes,
      isTruncated,
      keyCount: contents.length + commonPrefixes.length,
    }
    if (isTruncated && lastRawKey !== undefined) {
      result.nextToken = lastRawKey
    }
    return result
  }

  /**
   * List objects (V2). Keys are sorted lexicographically; `delimiter` rolls
   * keys up into `commonPrefixes`; `maxKeys` (clamped to 1000) truncates the
   * result and emits a `nextContinuationToken` (the last raw key consumed, used
   * opaquely). A `maxKeys` of 0 is a valid existence probe and returns an empty
   * list with no token.
   *
   * @param {string} bucketName
   * @param {{
   *   prefix?: string,
   *   delimiter?: string,
   *   maxKeys?: number,
   *   continuationToken?: string,
   *   startAfter?: string,
   * }} [options]
   * @returns {{
   *   contents: object[],
   *   commonPrefixes: string[],
   *   isTruncated: boolean,
   *   nextContinuationToken?: string,
   *   keyCount: number,
   * }}
   */
  function listObjectsV2(
    bucketName,
    {
      prefix = '',
      delimiter,
      maxKeys = DEFAULT_MAX_KEYS,
      continuationToken,
      startAfter,
    } = {},
  ) {
    const bucket = requireBucket(bucketName)
    let keys = sortedKeys(bucket, prefix)

    // continuationToken takes precedence over startAfter, both being exclusive
    // lower bounds (the token is the last raw key consumed by the previous page).
    const after = continuationToken || startAfter
    if (after) keys = keys.filter((k) => k > after)

    const page = buildListPage(bucket, keys, prefix, delimiter, maxKeys)
    const result = {
      contents: page.contents,
      commonPrefixes: page.commonPrefixes,
      isTruncated: page.isTruncated,
      keyCount: page.keyCount,
    }
    if (page.nextToken !== undefined) {
      result.nextContinuationToken = page.nextToken
    }
    return result
  }

  /**
   * List objects (V1, marker-based). Mirrors {@link listObjectsV2} with the v1
   * response shape: `marker` is the exclusive lower bound and `nextMarker` the
   * continuation cursor (the last raw key consumed by the page).
   *
   * @param {string} bucketName
   * @param {{
   *   prefix?: string,
   *   delimiter?: string,
   *   marker?: string,
   *   maxKeys?: number,
   * }} [options]
   * @returns {{
   *   contents: object[],
   *   commonPrefixes: string[],
   *   isTruncated: boolean,
   *   nextMarker?: string,
   * }}
   */
  function listObjects(
    bucketName,
    { prefix = '', delimiter, marker, maxKeys = DEFAULT_MAX_KEYS } = {},
  ) {
    const bucket = requireBucket(bucketName)
    let keys = sortedKeys(bucket, prefix)
    if (marker) keys = keys.filter((k) => k > marker)

    const page = buildListPage(bucket, keys, prefix, delimiter, maxKeys)
    const result = {
      contents: page.contents,
      commonPrefixes: page.commonPrefixes,
      isTruncated: page.isTruncated,
    }
    if (page.nextToken !== undefined) {
      result.nextMarker = page.nextToken
    }
    return result
  }

  /**
   * Initiate a multipart upload, returning its id.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {{ contentType?: string, metadata?: object }} [input]
   * @returns {string} the uploadId.
   */
  function createMultipartUpload(
    bucketName,
    key,
    { contentType, metadata } = {},
  ) {
    const bucket = requireBucket(bucketName)
    const uploadId = randomUUID()
    bucket.uploads.set(uploadId, {
      key,
      contentType: contentType || DEFAULT_CONTENT_TYPE,
      metadata: metadata || {},
      initiated: now(),
      parts: new Map(),
    })
    return uploadId
  }

  /**
   * Resolve an in-progress upload or throw `NoSuchUpload`.
   *
   * @param {object} bucket
   * @param {string} uploadId
   * @returns {object}
   */
  function requireUpload(bucket, uploadId) {
    const upload = bucket.uploads.get(uploadId)
    if (!upload) {
      throw new S3StoreError(
        'NoSuchUpload',
        'The specified upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed.',
      )
    }
    return upload
  }

  /**
   * Upload (or overwrite) a part of an in-progress multipart upload.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {string} uploadId
   * @param {number} partNumber
   * @param {Buffer} body
   * @returns {{ etag: string }}
   */
  function uploadPart(bucketName, key, uploadId, partNumber, body) {
    const bucket = requireBucket(bucketName)
    const upload = requireUpload(bucket, uploadId)
    const etag = quotedEtag(body)
    upload.parts.set(Number(partNumber), {
      body,
      etag,
      size: body.length,
      lastModified: now(),
    })
    return { etag }
  }

  /**
   * Upload a part sourced from an existing object (optionally a byte range of
   * it).
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {string} uploadId
   * @param {number} partNumber
   * @param {{ srcBucket: string, srcKey: string, range?: string }} source
   * @returns {{ etag: string, lastModified: number }}
   */
  function uploadPartCopy(
    bucketName,
    key,
    uploadId,
    partNumber,
    { srcBucket, srcKey, range },
  ) {
    const bucket = requireBucket(bucketName)
    const upload = requireUpload(bucket, uploadId)
    const sourceBucket = buckets.get(srcBucket)
    const sourceObject = sourceBucket && sourceBucket.objects.get(srcKey)
    if (!sourceObject) {
      throw new S3StoreError('NoSuchKey', 'The specified key does not exist.')
    }

    const parsed = parseRange(range, sourceObject.size)
    const body =
      parsed && !parsed.invalid
        ? sourceObject.body.subarray(parsed.start, parsed.end + 1)
        : sourceObject.body
    const etag = quotedEtag(body)
    const lastModified = now()
    upload.parts.set(Number(partNumber), {
      body,
      etag,
      size: body.length,
      lastModified,
    })
    return { etag, lastModified }
  }

  /**
   * Complete a multipart upload. Validates that every referenced part exists
   * with a matching ETag and that part numbers are strictly ascending, then
   * concatenates the part bodies (in part-number order) into the object body
   * and assigns the S3 composite ETag.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {string} uploadId
   * @param {{ partNumber: number, etag: string }[]} parts
   * @returns {{ etag: string }}
   */
  function completeMultipartUpload(bucketName, key, uploadId, parts) {
    const bucket = requireBucket(bucketName)
    const upload = requireUpload(bucket, uploadId)

    if (!parts || parts.length === 0) {
      throw new S3StoreError(
        'InvalidPart',
        'You must specify at least one part.',
      )
    }

    let previous = 0
    const resolved = []
    for (const requested of parts) {
      const partNumber = Number(requested.partNumber)
      if (partNumber <= previous) {
        throw new S3StoreError(
          'InvalidPartOrder',
          'The list of parts was not in ascending order. Parts must be ordered by part number.',
        )
      }
      previous = partNumber

      const stored = upload.parts.get(partNumber)
      if (!stored || stored.etag !== requested.etag) {
        throw new S3StoreError(
          'InvalidPart',
          "One or more of the specified parts could not be found. The part may not have been uploaded, or the specified entity tag may not match the part's entity tag.",
        )
      }
      resolved.push(stored)
    }

    const body = Buffer.concat(resolved.map((part) => part.body))
    const compositeEtag =
      '"' +
      createHash('md5')
        .update(
          Buffer.concat(resolved.map((part) => md5DigestBuffer(part.body))),
        )
        .digest('hex') +
      '-' +
      resolved.length +
      '"'

    bucket.objects.set(key, {
      body,
      contentType: upload.contentType,
      metadata: upload.metadata,
      size: body.length,
      etag: compositeEtag,
      lastModified: now(),
    })
    bucket.uploads.delete(uploadId)

    emitMutation(
      bucketName,
      key,
      'ObjectCreated:CompleteMultipartUpload',
      body.length,
      compositeEtag,
    )
    return { etag: compositeEtag }
  }

  /**
   * Abort (discard) an in-progress multipart upload.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {string} uploadId
   * @returns {void}
   */
  function abortMultipartUpload(bucketName, key, uploadId) {
    const bucket = requireBucket(bucketName)
    requireUpload(bucket, uploadId)
    bucket.uploads.delete(uploadId)
  }

  /**
   * List in-progress multipart uploads for a bucket.
   *
   * @param {string} bucketName
   * @returns {{ key: string, uploadId: string, initiated: number }[]}
   */
  function listMultipartUploads(bucketName) {
    const bucket = requireBucket(bucketName)
    return [...bucket.uploads.entries()].map(([uploadId, upload]) => ({
      key: upload.key,
      uploadId,
      initiated: upload.initiated,
    }))
  }

  /**
   * List the uploaded parts of an in-progress multipart upload, ordered by part
   * number.
   *
   * @param {string} bucketName
   * @param {string} key
   * @param {string} uploadId
   * @returns {{ parts: { partNumber: number, etag: string, size: number, lastModified: number }[] }}
   */
  function listParts(bucketName, key, uploadId) {
    const bucket = requireBucket(bucketName)
    const upload = requireUpload(bucket, uploadId)
    const parts = [...upload.parts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([partNumber, part]) => ({
        partNumber,
        etag: part.etag,
        size: part.size,
        lastModified: part.lastModified,
      }))
    return { parts }
  }

  return {
    ensureBucket,
    createBucket,
    hasBucket,
    listBuckets,
    deleteBucket,
    putObject,
    getObject,
    headObject,
    deleteObject,
    deleteObjects,
    copyObject,
    listObjectsV2,
    listObjects,
    createMultipartUpload,
    uploadPart,
    uploadPartCopy,
    completeMultipartUpload,
    abortMultipartUpload,
    listMultipartUploads,
    listParts,
  }
}
