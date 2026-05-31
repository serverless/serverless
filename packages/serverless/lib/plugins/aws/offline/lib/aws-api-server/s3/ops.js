/**
 * S3 operation set over the in-memory bucket store, for sls offline.
 *
 * `runOp(operation, params, { store, now })` is the seam between the wire layer
 * (request-parser + xml) and the data plane (bucket-store). It maps a parsed
 * operation to the matching store call, shapes the result into
 * `{ statusCode, headers, body }`, and translates the store's tagged
 * `S3StoreError` into an `S3OpError` carrying the HTTP status the wire layer
 * should answer with.
 *
 * Bodies follow S3's wire conventions: GetObject returns the raw `Buffer`
 * (sliced + 206 for a Range request); list / multipart / copy / delete return
 * XML strings; PutObject / UploadPart / DeleteObject / bucket lifecycle return
 * an empty body and carry their result in headers / status code.
 *
 * `params` is the parser's `{ bucket, key, ...params }` augmented by the wire
 * layer with the raw request `body` (a Buffer) for the operations that need it
 * (PutObject, UploadPart, DeleteObjects, CompleteMultipartUpload).
 */

import {
  serializeListAllMyBuckets,
  serializeListBucketResultV2,
  serializeListBucketResultV1,
  serializeInitiateMultipartUpload,
  serializeCompleteMultipartUpload,
  serializeCopyObjectResult,
  serializeCopyPartResult,
  serializeListMultipartUploads,
  serializeListParts,
  serializeDeleteResult,
  serializeLocationConstraint,
  serializeError,
  parseDeleteRequest,
  parseCompleteMultipartUpload,
} from './xml.js'

/** Default cap on keys returned by a single list call, matching S3. */
const DEFAULT_MAX_KEYS = 1000

/** Region reported by GetBucketLocation (D20). */
const REGION = 'us-east-1'

/**
 * Map a store error `code` to the HTTP status the wire layer responds with.
 * Anything unmapped is treated as a 400 sender fault.
 */
const STATUS_BY_CODE = {
  NoSuchBucket: 404,
  NoSuchKey: 404,
  NoSuchUpload: 404,
  InvalidPart: 400,
  InvalidPartOrder: 400,
  BucketNotEmpty: 409,
}

/**
 * A tagged operation error. Carries the AWS error code, the HTTP status the
 * wire layer should respond with, and a human-readable message.
 */
export class S3OpError extends Error {
  /**
   * @param {string} awsCode    - AWS error code (e.g. `'NoSuchKey'`).
   * @param {number} httpStatus - HTTP status to respond with.
   * @param {string} message    - Human-readable detail.
   */
  constructor(awsCode, httpStatus, message) {
    super(message)
    this.name = 'S3OpError'
    this.awsCode = awsCode
    this.httpStatus = httpStatus
  }
}

/**
 * Run a store call, translating any `S3StoreError` it throws into the matching
 * `S3OpError`. Non-store errors propagate unchanged.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function viaStore(fn) {
  try {
    return fn()
  } catch (error) {
    if (error && error.name === 'S3StoreError') {
      const httpStatus = STATUS_BY_CODE[error.code] ?? 400
      throw new S3OpError(error.code, httpStatus, error.message)
    }
    throw error
  }
}

/**
 * Throw `NoSuchKey` (the store returns `null` for a missing object rather than
 * throwing, so the op layer raises it).
 *
 * @returns {never}
 */
function throwNoSuchKey() {
  throw new S3OpError('NoSuchKey', 404, 'The specified key does not exist.')
}

/**
 * Build the response header set common to GetObject and HeadObject, including
 * any `x-amz-meta-*` user metadata.
 *
 * @param {object} object - a store get/head record.
 * @returns {Record<string, string | number>}
 */
function objectHeaders(object) {
  const headers = {
    ETag: object.etag,
    'Content-Type': object.contentType,
    'Content-Length': object.size,
    'Last-Modified': new Date(object.lastModified).toUTCString(),
    'Accept-Ranges': 'bytes',
  }
  for (const [key, value] of Object.entries(object.metadata || {})) {
    headers[key] = value
  }
  return headers
}

/**
 * Resolve a list call's effective `maxKeys`, defaulting to the S3 cap.
 *
 * @param {object} params
 * @returns {number}
 */
function effectiveMaxKeys(params) {
  return params.maxKeys === undefined ? DEFAULT_MAX_KEYS : params.maxKeys
}

/**
 * Execute an S3 operation against the store.
 *
 * @param {string} operation - the operation name from the request parser.
 * @param {object} params    - `{ bucket, key, ...parsed, body? }`.
 * @param {{ store: object, now?: () => number }} ctx
 * @returns {{ statusCode: number, headers: object, body: Buffer | string }}
 * @throws {S3OpError}
 */
export function runOp(operation, params, { store }) {
  const { bucket, key } = params

  switch (operation) {
    // --- Bucket lifecycle --------------------------------------------------
    case 'CreateBucket': {
      viaStore(() => store.createBucket(bucket))
      return { statusCode: 200, headers: { Location: `/${bucket}` }, body: '' }
    }

    case 'DeleteBucket': {
      viaStore(() => store.deleteBucket(bucket))
      return { statusCode: 204, headers: {}, body: '' }
    }

    case 'ListBuckets': {
      const body = serializeListAllMyBuckets(store.listBuckets())
      return { statusCode: 200, headers: {}, body }
    }

    case 'GetBucketLocation': {
      // Touch the bucket so an unknown bucket still 404s.
      viaStore(() => {
        if (!store.hasBucket(bucket)) {
          throwNoSuchBucket()
        }
      })
      return {
        statusCode: 200,
        headers: {},
        body: serializeLocationConstraint(REGION),
      }
    }

    // --- Object writes -----------------------------------------------------
    case 'PutObject': {
      const { etag } = viaStore(() =>
        store.putObject(bucket, key, {
          body: params.body || Buffer.alloc(0),
          contentType: params.contentType,
          metadata: params.metadata,
        }),
      )
      return { statusCode: 200, headers: { ETag: etag }, body: '' }
    }

    case 'CopyObject': {
      const result = viaStore(() =>
        store.copyObject({
          srcBucket: params.copySource.bucket,
          srcKey: params.copySource.key,
          dstBucket: bucket,
          dstKey: key,
          metadataDirective: params.metadataDirective,
          contentType: params.contentType,
          metadata: params.metadata,
        }),
      )
      return {
        statusCode: 200,
        headers: {},
        body: serializeCopyObjectResult(result),
      }
    }

    // --- Object reads ------------------------------------------------------
    case 'GetObject': {
      const object = store.getObject(bucket, key, { range: params.range })
      if (!object) throwNoSuchKey()
      // An unsatisfiable Range is answered with 416 + `Content-Range: bytes
      // */<size>` and the S3 InvalidRange error envelope, matching real S3.
      if (object.invalidRange) {
        return {
          statusCode: 416,
          headers: { 'Content-Range': `bytes */${object.size}` },
          body: serializeError({
            code: 'InvalidRange',
            message: 'The requested range is not satisfiable',
          }),
        }
      }
      const headers = objectHeaders(object)
      // The body may be a slice; report its actual length.
      headers['Content-Length'] = object.body.length
      if (object.contentRange) {
        headers['Content-Range'] = object.contentRange
        return { statusCode: 206, headers, body: object.body }
      }
      return { statusCode: 200, headers, body: object.body }
    }

    case 'HeadObject': {
      const object = store.headObject(bucket, key)
      if (!object) throwNoSuchKey()
      return { statusCode: 200, headers: objectHeaders(object), body: '' }
    }

    // --- Object deletes ----------------------------------------------------
    case 'DeleteObject': {
      viaStore(() => store.deleteObject(bucket, key))
      return { statusCode: 204, headers: {}, body: '' }
    }

    case 'DeleteObjects': {
      const { keys, quiet } = parseDeleteRequest(
        params.body ? params.body.toString() : '',
      )
      const { deleted, errors } = viaStore(() =>
        store.deleteObjects(bucket, keys),
      )
      return {
        statusCode: 200,
        headers: {},
        body: serializeDeleteResult({ deleted, errors, quiet }),
      }
    }

    // --- Listings ----------------------------------------------------------
    case 'ListObjectsV2': {
      const maxKeys = effectiveMaxKeys(params)
      const result = viaStore(() =>
        store.listObjectsV2(bucket, {
          prefix: params.prefix,
          delimiter: params.delimiter,
          maxKeys,
          continuationToken: params.continuationToken,
          startAfter: params.startAfter,
        }),
      )
      const body = serializeListBucketResultV2({
        name: bucket,
        prefix: params.prefix,
        delimiter: params.delimiter,
        maxKeys,
        keyCount: result.keyCount,
        isTruncated: result.isTruncated,
        continuationToken: params.continuationToken,
        nextContinuationToken: result.nextContinuationToken,
        startAfter: params.startAfter,
        contents: result.contents,
        commonPrefixes: result.commonPrefixes,
      })
      return { statusCode: 200, headers: {}, body }
    }

    case 'ListObjects': {
      const maxKeys = effectiveMaxKeys(params)
      const result = viaStore(() =>
        store.listObjects(bucket, {
          prefix: params.prefix,
          delimiter: params.delimiter,
          marker: params.marker,
          maxKeys,
        }),
      )
      const body = serializeListBucketResultV1({
        name: bucket,
        prefix: params.prefix,
        delimiter: params.delimiter,
        maxKeys,
        marker: params.marker,
        nextMarker: result.nextMarker,
        isTruncated: result.isTruncated,
        contents: result.contents,
        commonPrefixes: result.commonPrefixes,
      })
      return { statusCode: 200, headers: {}, body }
    }

    // --- Multipart ---------------------------------------------------------
    case 'CreateMultipartUpload': {
      const uploadId = viaStore(() =>
        store.createMultipartUpload(bucket, key, {
          contentType: params.contentType,
          metadata: params.metadata,
        }),
      )
      return {
        statusCode: 200,
        headers: {},
        body: serializeInitiateMultipartUpload({ bucket, key, uploadId }),
      }
    }

    case 'UploadPart': {
      const { etag } = viaStore(() =>
        store.uploadPart(
          bucket,
          key,
          params.uploadId,
          params.partNumber,
          params.body || Buffer.alloc(0),
        ),
      )
      return { statusCode: 200, headers: { ETag: etag }, body: '' }
    }

    case 'UploadPartCopy': {
      const result = viaStore(() =>
        store.uploadPartCopy(bucket, key, params.uploadId, params.partNumber, {
          srcBucket: params.copySource.bucket,
          srcKey: params.copySource.key,
          range: params.copySourceRange,
        }),
      )
      return {
        statusCode: 200,
        headers: {},
        body: serializeCopyPartResult(result),
      }
    }

    case 'CompleteMultipartUpload': {
      const parts = parseCompleteMultipartUpload(
        params.body ? params.body.toString() : '',
      )
      const { etag } = viaStore(() =>
        store.completeMultipartUpload(bucket, key, params.uploadId, parts),
      )
      return {
        statusCode: 200,
        headers: {},
        body: serializeCompleteMultipartUpload({
          location: `http://localhost/${bucket}/${key}`,
          bucket,
          key,
          etag,
        }),
      }
    }

    case 'AbortMultipartUpload': {
      viaStore(() => store.abortMultipartUpload(bucket, key, params.uploadId))
      return { statusCode: 204, headers: {}, body: '' }
    }

    case 'ListMultipartUploads': {
      const uploads = viaStore(() => store.listMultipartUploads(bucket))
      return {
        statusCode: 200,
        headers: {},
        body: serializeListMultipartUploads({ bucket, uploads }),
      }
    }

    case 'ListParts': {
      const { parts } = viaStore(() =>
        store.listParts(bucket, key, params.uploadId),
      )
      return {
        statusCode: 200,
        headers: {},
        body: serializeListParts({
          bucket,
          key,
          uploadId: params.uploadId,
          parts,
        }),
      }
    }

    default:
      throw new S3OpError(
        'NotImplemented',
        501,
        `The operation ${operation} is not implemented.`,
      )
  }
}

/**
 * Throw `NoSuchBucket`.
 *
 * @returns {never}
 */
function throwNoSuchBucket() {
  throw new S3OpError(
    'NoSuchBucket',
    404,
    'The specified bucket does not exist.',
  )
}
