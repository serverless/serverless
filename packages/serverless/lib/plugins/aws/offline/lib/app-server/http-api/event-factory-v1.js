/**
 * APIGW HTTP API payload format version 1.0 event factory for the offline
 * HTTP API server.
 *
 * HTTP APIs can be configured (per function or provider, via `httpApi.payload`)
 * to invoke their Lambda integration with the 1.0 payload format instead of the
 * default 2.0. The 1.0 shape mirrors the REST API (v1) Lambda-proxy event —
 * single- and multi-value header / query maps, `resource` / `httpMethod`, a
 * `null` (not absent) `pathParameters` when empty, and a REST-style flat
 * `requestContext` (`httpMethod` / `path` / `protocol` / `identity` /
 * `requestTime` / …) — plus a top-level `version: '1.0'`, and always deploys to
 * the auto-created `$default` stage.
 *
 * Unlike REST APIs, HTTP APIs (both 1.0 and 2.0 payload formats) lower-case all
 * request header names, so the `headers` / `multiValueHeaders` maps here are
 * keyed by the lower-cased name. The `cookie` header stays in those maps (1.0
 * has no separate `cookies` field), lower-cased like every other name.
 *
 * The body and binary-content handling is byte-for-byte identical to the v2
 * factory so a body delivered to a 1.0 function matches what a 2.0 function
 * would have received.
 *
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
 */

import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import { FAKE_ACCOUNT_ID } from '../../constants.js'
import { parseJsonSafe } from '../shared/json-utils.js'
import { formatClfTime } from '../shared/clf-time.js'
import { buildRestIdentity } from '../shared/rest-identity.js'
import { resolveRawPath } from '../shared/raw-path.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Content-type prefixes / exact values that are treated as binary. When a
 * request carries one of these types the body is base64-encoded and
 * `isBase64Encoded` is set to `true`. Mirrors the v2 factory.
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
 * Resolve the `requestContext.authorizer` value for the downstream Lambda
 * event, applying the documented precedence:
 *
 *   1. `sls-offline-authorizer-override` request header (per-request).
 *   2. `process.env.AUTHORIZER` (process-wide).
 *   3. `request.auth.credentials.authorizer` (from the executed authorizer
 *      Hapi scheme).
 *
 * Returns `undefined` when none apply — the event omits the field, matching
 * AWS API Gateway when no authorizer is attached to the route.
 *
 * @param {object} request
 * @returns {object | undefined}
 */
function resolveAuthorizer(request) {
  const fromHeader = parseJsonSafe(
    request?.headers?.['sls-offline-authorizer-override'],
  )
  if (fromHeader) return fromHeader

  const fromEnv = parseJsonSafe(process.env.AUTHORIZER)
  if (fromEnv) return fromEnv

  const fromCredentials = request?.auth?.credentials?.authorizer
  if (fromCredentials && typeof fromCredentials === 'object') {
    return fromCredentials
  }

  return undefined
}

/**
 * Bucket request headers into a `Map<string, string[]>` keyed by the
 * lower-cased header name. HTTP APIs (unlike REST APIs) report all request
 * header names lower-cased, regardless of how the client sent them. Prefers
 * Node's flat `rawHeaders` array (preserves duplicate header lines pre-fold);
 * falls back to Hapi's collapsed `request.headers` map for in-process callers
 * that don't carry the raw socket data (that map is already lower-cased).
 *
 * The `cookie` header is included — 1.0 has no separate `cookies` field, so
 * cookies flow through the header maps like any other (lower-cased) name.
 *
 * @param {object} request
 * @returns {Map<string, string[]>}
 */
function bucketHeaders(request) {
  const rawHeaders = request.raw?.req?.rawHeaders
  const acc = new Map()
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      const name = rawHeaders[i].toLowerCase()
      const list = acc.get(name)
      if (list) list.push(rawHeaders[i + 1])
      else acc.set(name, [rawHeaders[i + 1]])
    }
    return acc
  }
  for (const [k, v] of Object.entries(request.headers ?? {})) {
    acc.set(k.toLowerCase(), Array.isArray(v) ? [...v] : [v])
  }
  return acc
}

/**
 * Build the event `headers` map. Names are lower-cased; multiple values for the
 * same name are joined with `,`.
 *
 * @param {object} request
 * @returns {Record<string, string>}
 */
function buildHeaders(request) {
  const buckets = bucketHeaders(request)
  const out = {}
  for (const [k, vs] of buckets.entries()) out[k] = vs.join(',')
  return out
}

/**
 * Multi-value variant — one array per header name, keyed by the lower-cased
 * name.
 *
 * @param {object} request
 * @returns {Record<string, string[]>}
 */
function buildMultiValueHeaders(request) {
  const buckets = bucketHeaders(request)
  const out = {}
  for (const [k, vs] of buckets.entries()) out[k] = vs
  return out
}

/**
 * Single-value query map. When a key appears more than once APIGW v1 keeps
 * the LAST occurrence (the multi-value field captures all of them). Returns
 * `null` when the request had no query string at all.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Record<string, string> | null}
 */
function buildQueryStringParameters(searchParams) {
  const result = {}
  let saw = false
  for (const [key, value] of searchParams.entries()) {
    result[key] = value
    saw = true
  }
  return saw ? result : null
}

/**
 * Multi-value query map. Returns `null` when the request had no query string.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Record<string, string[]> | null}
 */
function buildMultiValueQueryStringParameters(searchParams) {
  const map = new Map()
  for (const [key, value] of searchParams.entries()) {
    const list = map.get(key)
    if (list) {
      list.push(value)
    } else {
      map.set(key, [value])
    }
  }
  if (map.size === 0) return null
  const result = {}
  for (const [key, values] of map.entries()) {
    result[key] = values
  }
  return result
}

/**
 * Compute `{ body, isBase64Encoded }`. APIGW emits `null` for both
 * "no body sent" and "empty-string body" cases, and base64-encodes binary
 * content types. Byte-for-byte identical to the v2 factory.
 *
 * @param {object} request  Hapi request.
 * @returns {{ body: string | null, isBase64Encoded: boolean }}
 */
function buildBody(request) {
  const noBody =
    request.payload === undefined ||
    request.payload === '' ||
    (Buffer.isBuffer(request.payload) && request.payload.length === 0)
  if (noBody) {
    return { body: null, isBase64Encoded: false }
  }
  const contentType = request.headers?.['content-type'] ?? ''
  if (isBinaryContentType(contentType)) {
    const buf = Buffer.isBuffer(request.payload)
      ? request.payload
      : Buffer.from(request.payload)
    return { body: buf.toString('base64'), isBase64Encoded: true }
  }
  // A non-binary body is delivered byte-for-byte. The raw Buffer Hapi hands us
  // (payload parsing disabled) is decoded as UTF-8 so insignificant JSON
  // whitespace survives; a string passes through unchanged; an object (from
  // direct callers) is JSON-stringified.
  let body
  if (Buffer.isBuffer(request.payload)) {
    body = request.payload.toString('utf8')
  } else if (typeof request.payload === 'string') {
    body = request.payload
  } else {
    body = JSON.stringify(request.payload)
  }
  return { body, isBase64Encoded: false }
}

/**
 * Compute the `content-length` / default `content-type` entries AWS API
 * Gateway injects into the event header maps when the client did not supply
 * them. HTTP APIs report header names lower-cased, so the injected keys are
 * lower-cased too; an entry is only produced when the header is absent
 * (case-insensitive) from the names the client already sent.
 *
 * @param {string[]} existingNames  Header names the client already sent (any casing).
 * @param {string | null} body
 * @param {boolean} isBase64Encoded
 * @returns {Record<string, string>}
 */
function headerDefaults(existingNames, body, isBase64Encoded) {
  const present = new Set(existingNames.map((name) => name.toLowerCase()))
  const has = (name) => present.has(name.toLowerCase())
  const defaults = {}
  if (body === null || body === undefined) {
    return defaults
  }
  if (!has('content-length')) {
    defaults['content-length'] = String(
      isBase64Encoded
        ? Buffer.byteLength(body, 'base64')
        : Buffer.byteLength(body),
    )
  }
  if (!has('content-type')) {
    defaults['content-type'] = 'application/json'
  }
  return defaults
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an APIGW HTTP API payload format version 1.0 event from a Hapi request.
 *
 * @param {object} opts
 * @param {object} opts.request
 *   The Hapi request object. The following fields are used:
 *   - `request.method` {string} — HTTP method (any case; uppercased internally).
 *   - `request.path` {string} — Decoded request path, query string stripped.
 *   - `request.url` {URL} — Full request URL (used for `searchParams`).
 *   - `request.headers` {Record<string, string | string[]>} — Hapi-collapsed
 *     headers; used as fallback when Node's flat `rawHeaders` is unavailable.
 *   - `request.raw.req.rawHeaders` {string[]} — Node's flat
 *     `[name, value, name, value, ...]` array (preferred).
 *   - `request.payload` {string | Buffer | object | undefined} — Parsed body.
 *   - `request.params` {Record<string, string>} — Hapi-matched path params.
 *   - `request.info.remoteAddress` {string} — Remote IP.
 *   - `request.info.received` {number} — Receipt timestamp in ms epoch.
 *
 * @param {object} opts.route
 * @param {string} opts.route.method
 *   HTTP method in uppercase (e.g. `'GET'`).
 * @param {string} opts.route.path
 *   The original APIGW-shaped path template (e.g. `'/users/{id}'`). Surfaced as
 *   `resource` and used to build `requestContext.routeKey`.
 * @param {string} opts.route.functionName
 *   Lambda function name backing the route.
 * @param {boolean} [opts.route.isDefault]
 *   `true` for the catch-all route. Reports `routeKey: '$default'` and
 *   `pathParameters: null`, mirroring the v2 factory.
 *
 * @param {string} [opts.accountId]
 *   12-digit AWS account ID. Defaults to `FAKE_ACCOUNT_ID` (`'000000000000'`).
 *
 * @param {string} opts.domainName
 *   The host and port string to populate `requestContext.domainName` and
 *   `requestContext.domainPrefix` (e.g. `'localhost:3000'`).
 *
 * @returns {object} APIGW HTTP API payload format 1.0 event object.
 */
export function buildHttpApiV1Event({
  request,
  route,
  accountId = FAKE_ACCOUNT_ID,
  domainName,
}) {
  const httpMethod = request.method.toUpperCase()
  // path is reported verbatim: a trailing slash is preserved and
  // percent-encoding is not decoded. Sourced from the original wire path rather
  // than Hapi's trailing-slash-stripped, percent-decoded request.path.
  const path = resolveRawPath(request)
  // The catch-all route reports the `$default` route key; every other route
  // reports `METHOD /original/apigw/path`.
  const routeKey = route.isDefault
    ? '$default'
    : `${route.method.toUpperCase()} ${route.path}`

  const headers = buildHeaders(request)
  const multiValueHeaders = buildMultiValueHeaders(request)

  const { searchParams } = request.url
  const queryStringParameters = buildQueryStringParameters(searchParams)
  const multiValueQueryStringParameters =
    buildMultiValueQueryStringParameters(searchParams)

  // Path parameters — APIGW emits `null` when the route has no placeholders.
  // The catch-all route reports no path parameters even though Hapi captures
  // the matched remainder.
  const pathParameters =
    !route.isDefault && request.params && Object.keys(request.params).length > 0
      ? { ...request.params }
      : null

  // Timestamps. Prefer Hapi's `request.info.received` (ms epoch the socket
  // received the first byte); fall back to "now" if absent. REST-style 1.0
  // reports these as `requestTime` (CLF string) / `requestTimeEpoch` (ms).
  const receivedMs = request.info?.received ?? Date.now()
  const requestTime = formatClfTime(new Date(receivedMs))
  const requestTimeEpoch = receivedMs

  const { body, isBase64Encoded } = buildBody(request)

  // AWS API Gateway injects a Content-Length (when a body is present) and a
  // default Content-Type when the client sent none. Written to both the
  // single-value and multi-value header maps so they stay mirrored; a header
  // the client already supplied (in any casing) suppresses the default.
  const defaults = headerDefaults(Object.keys(headers), body, isBase64Encoded)
  for (const [name, value] of Object.entries(defaults)) {
    headers[name] = value
    multiValueHeaders[name] = [value]
  }

  const userAgent = request.headers?.['user-agent'] ?? ''
  const sourceIp = request.info?.remoteAddress ?? '127.0.0.1'

  const authorizer = resolveAuthorizer(request)

  return {
    version: '1.0',
    resource: route.path,
    path,
    httpMethod,
    headers,
    multiValueHeaders,
    queryStringParameters,
    multiValueQueryStringParameters,
    pathParameters,
    stageVariables: null,
    requestContext: {
      accountId,
      apiId: 'offline',
      ...(authorizer ? { authorizer } : {}),
      domainName,
      domainPrefix: 'offline',
      extendedRequestId: crypto.randomUUID(),
      httpMethod,
      identity: buildRestIdentity({ sourceIp, userAgent }),
      ...(route.operationName !== undefined
        ? { operationName: route.operationName }
        : {}),
      // HTTP APIs have no stage prefix in the path, so `path` equals the request
      // path (`request.path`).
      path,
      protocol: 'HTTP/1.1',
      requestId: crypto.randomUUID(),
      requestTime,
      requestTimeEpoch,
      resourceId: 'offline',
      // The original APIGW path template (e.g. `/users/{id}`).
      resourcePath: route.path,
      routeKey,
      // HTTP APIs deploy to the auto-created `$default` stage; the event always
      // reports that, independent of the local `--stage`.
      stage: '$default',
    },
    body,
    isBase64Encoded,
  }
}
