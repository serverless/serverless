/**
 * Hapi route handler factory for the offline S3 emulator.
 *
 * Ties the wire layer together: it normalises the Hapi request into the
 * descriptor `parseS3Request` consumes, injects the raw request body, runs the
 * parsed operation against the bucket store via `runOp`, and maps the
 * `{ statusCode, headers, body }` result back onto a Hapi response — binary
 * object bodies pass through verbatim, XML payloads are typed
 * `application/xml`, and HEAD answers carry headers with an empty body.
 *
 * Presigned requests are admitted without signature verification (offline
 * credentials are placeholders), but an expired presigned URL is rejected with
 * the same `403 AccessDenied / Request has expired` envelope S3 returns. Any
 * `S3OpError` becomes its XML error envelope at the carried status; an
 * unexpected fault becomes a `500 InternalError` so the SDK surfaces a server
 * error rather than a parse failure.
 */

import { parseS3Request } from './request-parser.js'
import { runOp, S3OpError } from './ops.js'
import { serializeError } from './xml.js'
import { isPresigned, checkPresignedExpiry } from './presigned.js'

/** Content type for every XML response (success envelopes and errors). */
const XML_CONTENT_TYPE = 'application/xml'

/**
 * Send an S3 XML error envelope as a typed Hapi response.
 *
 * @param {object} h          - Hapi response toolkit.
 * @param {string} code       - AWS error code (e.g. `NoSuchKey`).
 * @param {number} statusCode - HTTP status to respond with.
 * @param {string} message    - Human-readable detail.
 * @param {string} [resource] - The request resource (path), echoed back.
 * @returns {object} Hapi response.
 */
function errorResponse(h, code, statusCode, message, resource) {
  return h
    .response(serializeError({ code, message, resource }))
    .code(statusCode)
    .type(XML_CONTENT_TYPE)
}

/**
 * Map a `runOp` result onto a Hapi response. The body discriminates the
 * content type: a Buffer is an object read (GetObject) and is returned verbatim
 * under the object's own `Content-Type`; a non-empty string is an XML document;
 * an empty body (writes / deletes / HEAD) carries no content type.
 *
 * @param {object} h - Hapi response toolkit.
 * @param {{ statusCode: number, headers: object, body: Buffer | string }} result
 * @returns {object} Hapi response.
 */
function toHapiResponse(h, { statusCode, headers, body }) {
  const isBuffer = Buffer.isBuffer(body)
  // Hapi must not re-encode a Buffer body — passing the Buffer through keeps
  // the bytes intact for binary object reads.
  const response = h.response(isBuffer ? body : (body ?? '')).code(statusCode)

  let contentType
  for (const [name, value] of Object.entries(headers || {})) {
    // The object's Content-Type is applied via `.type()` below so it wins over
    // Hapi's default; every other header is set as-is.
    if (name.toLowerCase() === 'content-type') {
      contentType = value
      continue
    }
    response.header(name, String(value))
  }

  if (contentType !== undefined) {
    // Object read / head: echo the stored Content-Type verbatim. `charset(false)`
    // stops Hapi appending `; charset=utf-8` to text types, matching S3 (which
    // returns the stored type unchanged) and leaving binary bytes untouched.
    response.type(contentType).charset(false)
  } else if (isBuffer) {
    response.type('binary/octet-stream').charset(false)
  } else if (typeof body === 'string' && body.length > 0) {
    // XML success envelope (lists / multipart / copy / delete / location).
    response.type(XML_CONTENT_TYPE)
  }

  return response
}

/**
 * Create the Hapi route handler that serves S3 requests over the bucket store.
 *
 * @param {{
 *   store: ReturnType<import('./bucket-store.js').createBucketStore>,
 *   now?: () => number,
 *   host?: string,
 * }} options - `host` is the offline endpoint host (default `localhost`); it is
 *   recognised, alongside `localhost`, as a virtual-hosted-style bucket suffix
 *   so the SDK works without `forcePathStyle`.
 * @returns {(request: object, h: object) => Promise<object>}
 *   A Hapi route handler `async (request, h) => response`.
 */
export function createS3Handlers({ store, now, host = 'localhost' }) {
  // De-dupe so a `localhost` host doesn't list itself twice.
  const hosts = [...new Set([host, 'localhost'])]
  return async function s3Handler(request, h) {
    const { query, path } = request

    // Reject an expired presigned URL up front with S3's 403 envelope. The
    // signature itself is never verified (offline credentials are placeholders).
    if (isPresigned(query) && checkPresignedExpiry(query, now?.()).expired) {
      return errorResponse(h, 'AccessDenied', 403, 'Request has expired', path)
    }

    try {
      const { operation, bucket, key, params } = parseS3Request({
        method: request.method.toUpperCase(),
        path,
        query,
        headers: request.headers,
      })

      // ops expects the wire layer to inject the raw request body (a Buffer);
      // ops `.toString()`s it where it needs text (DeleteObjects /
      // CompleteMultipartUpload), and uses the bytes directly elsewhere
      // (PutObject / UploadPart).
      params.bucket = bucket
      params.key = key
      params.body = request.payload

      const result = runOp(operation, params, { store, now })
      return toHapiResponse(h, result)
    } catch (error) {
      if (error instanceof S3OpError) {
        return errorResponse(
          h,
          error.awsCode,
          error.httpStatus,
          error.message,
          path,
        )
      }
      // An unexpected fault: surface a 500 in S3's error shape.
      return errorResponse(h, 'InternalError', 500, error.message, path)
    }
  }
}
