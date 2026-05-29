/**
 * ALB (Application Load Balancer) Lambda-target event factory for offline.
 *
 * Transforms an incoming Hapi request into the JSON payload that AWS Lambda
 * receives when a function is invoked via an ALB target group. The shape
 * differs from APIGW:
 *  - `requestContext.elb.targetGroupArn` instead of `requestContext.apiId`.
 *  - No `pathParameters` (ALB matches literal paths; no template support).
 *  - `body` is always present (empty string for no body).
 *  - Both single-value AND multi-value header / query variants are emitted
 *    (real AWS emits only one set based on the target group's
 *    `multi_value_headers.enabled` flag; we accept this documented
 *    simplification).
 *
 * @see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html
 */

/**
 * @param {object} args
 * @param {object} args.request           Hapi request.
 * @param {string} args.targetGroupArn    Synthesized ALB target-group ARN.
 * @returns {object}                       ALB Lambda-target event JSON.
 */
export function buildAlbEvent({ request, targetGroupArn }) {
  const httpMethod = request.method.toUpperCase()
  const { headers, multiValueHeaders } = readHeaders(request)
  const { queryStringParameters, multiValueQueryStringParameters } =
    readQuery(request)
  const { body, isBase64Encoded } = readBody(request)

  return {
    body,
    headers,
    httpMethod,
    isBase64Encoded,
    multiValueHeaders,
    multiValueQueryStringParameters,
    path: request.path,
    queryStringParameters,
    requestContext: {
      elb: { targetGroupArn },
    },
  }
}

/**
 * Read headers from Node's raw socket array (preserves duplicates) and
 * collapse to both single-value (last-write-wins per key, lowercased) and
 * multi-value (array of all values, lowercased keys) shapes.
 */
function readHeaders(request) {
  const rawHeaders = request?.raw?.req?.rawHeaders
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    const single = {}
    const multi = {}
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      const name = rawHeaders[i].toLowerCase()
      const value = rawHeaders[i + 1]
      single[name] = value
      if (multi[name]) multi[name].push(value)
      else multi[name] = [value]
    }
    return { headers: single, multiValueHeaders: multi }
  }
  // Fallback for in-process tests without raw socket.
  const single = {}
  const multi = {}
  for (const [k, v] of Object.entries(request?.headers ?? {})) {
    const name = k.toLowerCase()
    if (Array.isArray(v)) {
      single[name] = v.join(',')
      multi[name] = [...v]
    } else {
      single[name] = v
      multi[name] = [v]
    }
  }
  return { headers: single, multiValueHeaders: multi }
}

/**
 * Read query parameters from `request.url.searchParams` (a WHATWG URL). Both
 * the single-value (last-write-wins per key) and multi-value (array of all
 * values) maps are produced. Returns `null` for both fields when no query
 * is present (matches real ALB).
 */
function readQuery(request) {
  const url = request?.url
  if (!url || !url.search) {
    return {
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
    }
  }
  const single = {}
  const multi = {}
  for (const [k, v] of url.searchParams.entries()) {
    single[k] = v
    if (multi[k]) multi[k].push(v)
    else multi[k] = [v]
  }
  return {
    queryStringParameters: single,
    multiValueQueryStringParameters: multi,
  }
}

/**
 * Content-type prefixes / exact values that are treated as binary. A body with
 * one of these types is base64-encoded and `isBase64Encoded` is set to `true`.
 *
 * @type {string[]}
 */
const BINARY_CONTENT_TYPES = ['application/octet-stream', 'multipart/form-data']

/**
 * Return `true` when the given content-type string is considered binary.
 *
 * @param {string} contentType
 * @returns {boolean}
 */
function isBinaryContentType(contentType) {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  return BINARY_CONTENT_TYPES.some((prefix) => ct.startsWith(prefix))
}

/**
 * Read the request body. Always returns a string body (empty when absent —
 * an ALB-specific quirk; ALB sends `""` rather than `null` for a bodyless
 * request).
 *
 * A binary content-type base64-encodes the body and sets
 * `isBase64Encoded: true`. Otherwise the body is delivered byte-for-byte: a
 * raw Buffer (payload parsing disabled) is decoded as UTF-8 so insignificant
 * JSON whitespace survives, a string passes through unchanged, and an object
 * (from direct callers) is JSON-stringified.
 */
function readBody(request) {
  const payload = request?.payload
  // "No body" covers an absent payload, an empty string, and the zero-length
  // Buffer Hapi hands us for a body-allowed method (POST/PUT/PATCH) sent with
  // no body (payload parsing disabled). ALB surfaces `""` (not null) for all of
  // these.
  const noBody =
    payload === undefined ||
    payload === null ||
    payload === '' ||
    (Buffer.isBuffer(payload) && payload.length === 0)
  if (noBody) {
    return { body: '', isBase64Encoded: false }
  }
  const contentType = request.headers?.['content-type'] ?? ''
  if (isBinaryContentType(contentType)) {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
    return { body: buf.toString('base64'), isBase64Encoded: true }
  }
  // A body whose Content-Encoding is gzip but whose content-type is non-binary
  // is passed through as UTF-8, matching real API Gateway, which only
  // base64-encodes configured binary media types.
  if (Buffer.isBuffer(payload)) {
    return { body: payload.toString('utf8'), isBase64Encoded: false }
  }
  if (typeof payload === 'string') {
    return { body: payload, isBase64Encoded: false }
  }
  return { body: JSON.stringify(payload), isBase64Encoded: false }
}
