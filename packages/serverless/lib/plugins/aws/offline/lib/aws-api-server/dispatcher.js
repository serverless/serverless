/**
 * Service dispatcher for the offline AWS API server.
 *
 * Primary routing inspects the SigV4 Authorization header — specifically the
 * service segment within the Credential scope. No body inspection, no
 * X-Amz-Target header, and no signature verification are performed.
 *
 * Presigned S3 URLs are the one case with no Authorization header: they carry
 * the signature in the query string. So when the header does not resolve a
 * service, the dispatcher additionally routes to 's3' for a presigned request
 * whose credential scope names s3, or any presigned request against a
 * bucket-shaped path. This fallback is additive — it never overrides a
 * service the Authorization header already resolved.
 */

import { isPresigned } from './s3/presigned.js'

/**
 * The set of AWS service names that this offline implementation recognises.
 *
 * @type {Set<string>}
 */
const RECOGNISED_SERVICES = new Set(['lambda', 'sqs', 'sns', 's3', 'events'])

/**
 * Inspect an incoming Hapi request and return the AWS service name that the
 * request is targeting, based solely on the SigV4 Authorization header.
 *
 * SigV4 Authorization header format:
 * ```
 * AWS4-HMAC-SHA256 Credential=<AKID>/<date>/<region>/<service>/aws4_request,
 *   SignedHeaders=<headers>, Signature=<sig>
 * ```
 * The service is the 4th `/`-separated segment (zero-indexed: index 3) within
 * the Credential value, i.e. the string between the region and `aws4_request`.
 *
 * @param {{
 *   headers: Record<string, string>,
 *   query?: Record<string, string>,
 *   path?: string,
 * }} request
 *   A Hapi request object (or any object with a `headers` map).  Hapi
 *   lower-cases all header names; the function also checks the upper-case
 *   `Authorization` key for compatibility with raw Node.js objects. `query`
 *   and `path` are consulted only for the presigned-S3 fallback.
 *
 * @returns {'lambda' | 'sqs' | 'sns' | 's3' | 'events' | null}
 *   The recognised service name, the presigned-S3 fallback `'s3'`, or `null`
 *   when nothing matches.
 */
export function detectService(request) {
  const headerService = detectServiceFromAuthHeader(request)
  if (headerService) {
    return headerService
  }

  // No service from the Authorization header: a presigned S3 URL is the one
  // case that arrives without one, so fall back to the query-based signal.
  if (isPresignedS3Request(request)) {
    return 's3'
  }

  return null
}

/**
 * Resolve the target service from the SigV4 Authorization header alone.
 *
 * @param {{ headers: Record<string, string> }} request
 * @returns {'lambda' | 'sqs' | 'sns' | 's3' | 'events' | null}
 */
function detectServiceFromAuthHeader(request) {
  // Hapi normalises headers to lower-case; also accept the original casing.
  const authHeader =
    request.headers['authorization'] ?? request.headers['Authorization']

  if (!authHeader) {
    return null
  }

  // SigV4 Authorization headers begin with the algorithm designation.
  if (!authHeader.startsWith('AWS4-HMAC-SHA256 ')) {
    return null
  }

  // Extract the Credential=... portion.
  // Example: Credential=AKIAIOSFODNN7/20260522/us-east-1/sqs/aws4_request
  const credentialMatch = authHeader.match(/Credential=([^,\s]+)/)
  if (!credentialMatch) {
    return null
  }

  // The credential value is <AKID>/<date>/<region>/<service>/aws4_request.
  // Split on '/' to get all five segments.
  const parts = credentialMatch[1].split('/')
  if (parts.length < 5) {
    return null
  }

  // The service is at index 3 (zero-based).
  const service = parts[3]

  return RECOGNISED_SERVICES.has(service) ? service : null
}

/**
 * Whether a request without a resolvable Authorization header is a presigned
 * S3 request.
 *
 * A SigV4 presign carries its target service in the `X-Amz-Credential` scope,
 * so it routes to s3 ONLY when that scope names s3 (`/s3/`). A SigV4 presign
 * whose scope names a different service is left for that service's own
 * handling and is never claimed for s3 — the bucket-shaped fallback would
 * otherwise mis-route, say, an `/sqs/`-scoped presign against `/my-bucket/...`.
 *
 * The bucket-shaped fallback therefore applies only to legacy SigV2 presigns
 * (`AWSAccessKeyId` + `Signature`), which carry no service scope: such a
 * presign aimed at a bucket-shaped path is treated as s3.
 *
 * @param {{ query?: Record<string, string>, path?: string }} request
 * @returns {boolean}
 */
function isPresignedS3Request(request) {
  const query = request.query
  if (!query) {
    return false
  }

  // A SigV4 presign names its target service in the credential scope; it is
  // authoritative. Route to s3 only when the scope is s3, and never let the
  // bucket-shaped fallback claim a scoped (non-s3) presign.
  const credential = query['X-Amz-Credential']
  if (typeof credential === 'string') {
    return credential.includes('/s3/')
  }

  // No SigV4 service scope: a legacy SigV2 presign (AWSAccessKeyId + Signature)
  // aimed at a bucket-shaped path is treated as s3.
  return isPresigned(query) && isBucketShapedPath(request.path)
}

/**
 * Whether a path is bucket-shaped: it has a non-empty first segment
 * (`/<bucket>` or `/<bucket>/<key>`), as opposed to the service root (`/`).
 *
 * @param {string | undefined} path
 * @returns {boolean}
 */
function isBucketShapedPath(path) {
  const trimmed = String(path || '').replace(/^\/+/, '')
  const bucket = trimmed.split('/')[0]
  return bucket.length > 0
}
