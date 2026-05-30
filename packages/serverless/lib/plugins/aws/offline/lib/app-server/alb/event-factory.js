/**
 * ALB (Application Load Balancer) Lambda-target event factory for offline.
 *
 * Transforms an incoming Hapi request into the JSON payload that AWS Lambda
 * receives when a function is invoked via an ALB target group. The shape
 * differs from APIGW:
 *  - `requestContext.elb.targetGroupArn` instead of `requestContext.apiId`.
 *  - No `pathParameters` (ALB matches literal paths; no template support).
 *  - `body` is always present (empty string for no body).
 *  - Exactly ONE of the single-value or multi-value header / query variants is
 *    emitted, governed by the target group's `multi_value_headers.enabled`
 *    flag. When disabled (the default), the event carries `headers` and
 *    `queryStringParameters` and omits the multi-value keys entirely; when
 *    enabled, it carries `multiValueHeaders` and
 *    `multiValueQueryStringParameters` and omits the single-value keys.
 *
 * @see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html
 */

import { randomBytes } from 'node:crypto'

/**
 * @param {object} args
 * @param {object} args.request           Hapi request.
 * @param {string} args.targetGroupArn    Synthesized ALB target-group ARN.
 * @param {boolean} [args.multiValueHeaders=false]  Target group's
 *   `lambda.multi_value_headers.enabled` flag. Selects which header / query
 *   variant the event carries.
 * @returns {object}                       ALB Lambda-target event JSON.
 */
export function buildAlbEvent({
  request,
  targetGroupArn,
  multiValueHeaders = false,
}) {
  const httpMethod = request.method.toUpperCase()
  const { body, isBase64Encoded } = readBody(request)

  const event = {
    body,
    httpMethod,
    isBase64Encoded,
    path: request.path,
    requestContext: {
      elb: { targetGroupArn },
    },
  }

  if (multiValueHeaders) {
    const { multiValueHeaders: multi } = readHeaders(request)
    addForwardingHeaders(request, multi, true)
    event.multiValueHeaders = multi
    event.multiValueQueryStringParameters =
      readQuery(request).multiValueQueryStringParameters
  } else {
    const { headers: single } = readHeaders(request)
    addForwardingHeaders(request, single, false)
    event.headers = single
    event.queryStringParameters = readQuery(request).queryStringParameters
  }

  return event
}

/**
 * Inject the forwarding and trace headers that a load balancer adds to every
 * request before it reaches the target: `x-forwarded-for` (the client
 * address), `x-forwarded-port` (the listener port), `x-forwarded-proto` (the
 * listener scheme), and `x-amzn-trace-id` (an X-Ray trace identifier). A
 * client-supplied value — at any casing, since the map is keyed lowercase —
 * suppresses the synthesized default. Mutates the passed map, which is the
 * single active variant: when `multi` is true each synthesized value is wrapped
 * in a one-element array to match the multi-value shape, otherwise it is stored
 * as a scalar.
 */
function addForwardingHeaders(request, map, multi) {
  const defaults = {
    'x-forwarded-for': forwardedFor(request),
    'x-forwarded-port': forwardedPort(request),
    'x-forwarded-proto': forwardedProto(request),
    'x-amzn-trace-id': synthesizeTraceId(),
  }
  for (const [name, value] of Object.entries(defaults)) {
    if (value == null || name in map) continue
    map[name] = multi ? [value] : value
  }
}

function forwardedFor(request) {
  return (
    request?.info?.remoteAddress ??
    request?.raw?.req?.socket?.remoteAddress ??
    null
  )
}

function forwardedPort(request) {
  const port =
    request?.raw?.req?.socket?.localPort ??
    request?.server?.info?.port ??
    request?.url?.port
  return port != null && port !== '' ? String(port) : null
}

function forwardedProto(request) {
  if (request?.raw?.req?.socket?.encrypted) return 'https'
  return request?.server?.info?.protocol === 'https' ? 'https' : 'http'
}

/**
 * Synthesize an X-Ray trace header value of the form `Root=1-<8 hex>-<24 hex>`
 * (8 hex = a 4-byte timestamp slot, 24 hex = a 12-byte random identifier).
 */
function synthesizeTraceId() {
  return `Root=1-${randomBytes(4).toString('hex')}-${randomBytes(12).toString('hex')}`
}

/**
 * Read headers from Node's raw socket array (preserves duplicates) and produce
 * both the single-value (last-write-wins per key, lowercased) and multi-value
 * (array of all values, lowercased keys) shapes; the caller emits whichever one
 * the target group's `multi_value_headers.enabled` flag selects.
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
 * Read query parameters from the raw query string, keeping every key and value
 * percent-encoded verbatim. Unlike API Gateway, a load balancer does NOT decode
 * query parameters: `?q=a%20b` reaches the target as `q: 'a%20b'`, not
 * `q: 'a b'`. Decoding via `request.url.searchParams` (WHATWG) would turn
 * `%20`/`+` into spaces, so the raw string (`request.url.search`, falling back
 * to the path of `request.raw.req.url`) is split manually instead: on `&`
 * between pairs, then on the first `=` within each pair. A pair with no `=`
 * yields an empty-string value. Both the single-value (last-write-wins per key)
 * and multi-value (array of all values) maps are produced; the caller emits
 * whichever one the target group's `multi_value_headers.enabled` flag selects.
 * Returns `null` for both fields when no query is present (matches real ALB).
 */
function readQuery(request) {
  const search = readRawSearch(request)
  if (!search) {
    return {
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
    }
  }
  const single = {}
  const multi = {}
  for (const pair of search.split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    const key = eq === -1 ? pair : pair.slice(0, eq)
    const value = eq === -1 ? '' : pair.slice(eq + 1)
    single[key] = value
    if (multi[key]) multi[key].push(value)
    else multi[key] = [value]
  }
  return {
    queryStringParameters: single,
    multiValueQueryStringParameters: multi,
  }
}

/**
 * Return the raw query string (without the leading `?`) preserving percent
 * encoding, or `''` when the request carries no query. Prefers the WHATWG URL's
 * `search` (already raw), falling back to the query portion of the Node raw
 * request URL when no parsed URL is available.
 */
function readRawSearch(request) {
  const search = request?.url?.search
  if (search) return search.startsWith('?') ? search.slice(1) : search
  const rawUrl = request?.raw?.req?.url
  if (typeof rawUrl === 'string') {
    const eq = rawUrl.indexOf('?')
    if (eq !== -1) return rawUrl.slice(eq + 1)
  }
  return ''
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
