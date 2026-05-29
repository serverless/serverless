/**
 * APIGW HTTP API v2.0 event factory for the offline HTTP API server.
 *
 * Transforms an incoming Hapi request into the JSON payload that AWS Lambda
 * receives when a function is invoked via an API Gateway HTTP API (payload
 * format version 2.0).
 *
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
 */

import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import { FAKE_ACCOUNT_ID } from '../../constants.js'
import { parseJsonSafe } from '../shared/json-utils.js'
import { formatClfTime } from '../shared/clf-time.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the `requestContext.authorizer` value for the downstream Lambda
 * event, applying the documented precedence:
 *
 *   1. `sls-offline-authorizer-override` request header (per-request).
 *   2. `process.env.AUTHORIZER` (process-wide).
 *   3. `request.auth.credentials.authorizer` (from the executed authorizer
 *      Hapi scheme).
 *
 * Header / env JSON values are emitted VERBATIM — no `.jwt` / `.lambda`
 * namespacing is applied. The credentials value is also passed through
 * verbatim because the auth scheme is responsible for building the
 * v2-namespaced shape (`{ jwt: { claims, scopes } }` or `{ lambda: <ctx> }`).
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
 * Content-type prefixes / exact values that are treated as binary.  When a
 * request carries one of these types the body is base64-encoded and
 * `isBase64Encoded` is set to `true`.
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
 * Lower-case all header keys and join multi-value arrays with `,`.
 * Excludes the `cookie` header (surfaced separately in the `cookies` field).
 *
 * @param {Record<string, string | string[]>} rawHeaders
 * @returns {Record<string, string>}
 */
function normaliseHeaders(rawHeaders) {
  const result = {}
  for (const [key, value] of Object.entries(rawHeaders)) {
    const lk = key.toLowerCase()
    if (lk === 'cookie') continue
    result[lk] = Array.isArray(value) ? value.join(',') : value
  }
  return result
}

/**
 * Build the event `headers` map from Node's flat `rawHeaders` array
 * (`request.raw.req.rawHeaders`). The array is `[name1, value1, name2,
 * value2, …]` exactly as Node received it off the socket, before Hapi folds
 * duplicates or normalizes casing.
 *
 * Multiple header lines with the same name are joined with `,` to match the
 * AWS API Gateway behavior for event.headers. The `cookie` header is excluded
 * (it flows separately through event.cookies).
 *
 * @param {string[]} rawHeaders  Flat alternating name/value array.
 * @returns {Record<string, string>}
 */
function normaliseRawHeaders(rawHeaders) {
  /** @type {Map<string, string[]>} */
  const acc = new Map()
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const lk = rawHeaders[i].toLowerCase()
    if (lk === 'cookie') continue
    const list = acc.get(lk)
    if (list) {
      list.push(rawHeaders[i + 1])
    } else {
      acc.set(lk, [rawHeaders[i + 1]])
    }
  }
  /** @type {Record<string, string>} */
  const result = {}
  for (const [key, values] of acc.entries()) {
    result[key] = values.join(',')
  }
  return result
}

/**
 * Inject the `content-length` and default `content-type` entries AWS API
 * Gateway adds to the event `headers` map.
 *
 * - `content-length` is set to the request body's byte length whenever a body
 *   is present and the client did not already send a content-length (any
 *   casing). Base64-encoded bodies are measured in their decoded form.
 * - `content-type` defaults to `application/json` only when a body is present
 *   and the client did not send one (any casing). A bodyless request carries no
 *   content-type in the event headers, matching real API Gateway.
 *
 * Injected keys are lower-cased and existing entries are never overwritten.
 *
 * @param {Record<string, string>} headers  Mutated in place.
 * @param {string | null} body
 * @param {boolean} isBase64Encoded
 * @returns {void}
 */
function injectHeaderDefaults(headers, body, isBase64Encoded) {
  if (body === null || body === undefined) {
    return
  }
  const has = (name) =>
    Object.keys(headers).some((k) => k.toLowerCase() === name)
  if (!has('content-length')) {
    headers['content-length'] = String(
      isBase64Encoded
        ? Buffer.byteLength(body, 'base64')
        : Buffer.byteLength(body),
    )
  }
  if (!has('content-type')) {
    headers['content-type'] = 'application/json'
  }
}

/**
 * Parse query-string parameters from a `URLSearchParams` instance.
 * Multi-value keys (e.g. `?id=1&id=2`) are joined by `,` to match APIGW
 * behaviour.
 *
 * Returns `null` when there are no parameters at all — APIGW emits `null`,
 * not an absent field, when the request had no query string.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Record<string, string> | null}
 */
function parseQueryStringParameters(searchParams) {
  /** @type {Map<string, string[]>} */
  const map = new Map()

  for (const [key, value] of searchParams.entries()) {
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key).push(value)
  }

  if (map.size === 0) return null

  /** @type {Record<string, string>} */
  const result = {}
  for (const [key, values] of map.entries()) {
    result[key] = values.join(',')
  }
  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an APIGW HTTP API v2.0 event from a Hapi request.
 *
 * @param {object} opts
 * @param {object} opts.request
 *   The Hapi request object.  The following fields are used:
 *   - `request.method` {string} — HTTP method (any case; uppercased internally).
 *   - `request.path` {string} — Decoded path, query string stripped.
 *   - `request.url` {URL} — Full request URL (used for `search`/`searchParams`).
 *   - `request.headers` {Record<string, string | string[]>} — Request headers.
 *     Hapi lower-cases all header names; multi-value headers may be arrays.
 *   - `request.payload` {string | Buffer | object | undefined} — Parsed body.
 *     `undefined` means no body was sent.
 *   - `request.params` {Record<string, string>} — Path parameters extracted by
 *     Hapi's router (e.g. `{ id: '42' }`).
 *   - `request.info.remoteAddress` {string} — Remote IP address.
 *
 * @param {object} opts.route
 *   Metadata about the matched route.
 * @param {string} opts.route.method
 *   HTTP method in uppercase (e.g. `'GET'`).
 * @param {string} opts.route.path
 *   The original APIGW-shaped path template (e.g. `'/users/{id}'`).  This is
 *   NOT the Hapi-translated path (`/users/:id`).
 * @param {string} opts.route.functionName
 *   The name of the Lambda function handling this route.
 * @param {string} [opts.route.operationName]
 *   Optional operation name declared on the `httpApi` event (e.g. via the
 *   `httpApi: { operationName: 'GetUsers' }` form).  When set, surfaced in
 *   `requestContext.operationName` exactly as AWS API Gateway does.
 *
 * @param {string} [opts.accountId]
 *   12-digit AWS account ID.  Defaults to `FAKE_ACCOUNT_ID` (`'000000000000'`).
 *
 * @param {string} opts.domainName
 *   The host and port string to populate `requestContext.domainName` and
 *   `requestContext.domainPrefix` (e.g. `'localhost:3000'`).  The route loader
 *   / app-server computes this from `host` + `appPort` and passes it in.
 *
 * @returns {object} APIGW HTTP API payload format 2.0 event object.
 */
export function buildHttpApiV2Event({
  request,
  route,
  accountId = FAKE_ACCOUNT_ID,
  domainName,
}) {
  const method = request.method.toUpperCase()
  // The catch-all route reports the `$default` route key; every other route
  // reports `METHOD /original/apigw/path`.
  const routeKey = route.isDefault
    ? '$default'
    : `${route.method.toUpperCase()} ${route.path}`
  const rawPath = request.path

  // Query string — re-encode via URLSearchParams for consistent normalization
  // (+ vs %20, percent-encoding). Returns '' when no query params, matching
  // the APIGW spec requirement. Reference: LambdaProxyIntegrationEventV2.js:165
  const rawQueryString = request.url.searchParams.toString()

  const queryStringParameters = parseQueryStringParameters(
    request.url.searchParams,
  )

  // Headers — read from Node's flat `rawHeaders` array when available so that
  // duplicate header lines (e.g. two `X-Forwarded-For` from a proxy chain) are
  // preserved and joined with `,` exactly the way real APIGW does. Falls back
  // to Hapi's pre-folded `request.headers` for in-process callers (unit tests,
  // simulated requests) that don't carry the raw socket data.
  const rawHeaders = request.raw?.req?.rawHeaders
  const headers =
    Array.isArray(rawHeaders) && rawHeaders.length > 0
      ? normaliseRawHeaders(rawHeaders)
      : normaliseHeaders(request.headers)

  // Cookies — read from Hapi's parsed `request.state` map so values with
  // spaces, percent-encoding, or quoted segments are handled the same way
  // Hapi itself handles them. Each entry becomes a `name=value` string;
  // duplicate cookie names (which Hapi surfaces as an array) become multiple
  // entries. Field omitted entirely if no cookies are present.
  let cookies
  if (request.state && Object.keys(request.state).length > 0) {
    cookies = Object.entries(request.state).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((v) => `${key}=${v}`)
        : `${key}=${value}`,
    )
  } else {
    // Fallback: when Hapi has not populated request.state (e.g. the route
    // didn't enable state parsing, or the cookie header was malformed),
    // pass through the raw header tokens so downstream handlers still see
    // *something*. Matches the previous behavior for plain "k=v; a=b" inputs.
    const cookieHeader = request.headers['cookie'] ?? request.headers['Cookie']
    cookies = cookieHeader
      ? cookieHeader
          .split(';')
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined
  }

  // Path parameters — APIGW emits `null` when the route has no placeholders.
  // The catch-all route reports no path parameters even though Hapi captures
  // the matched remainder.
  const pathParameters =
    !route.isDefault && request.params && Object.keys(request.params).length > 0
      ? request.params
      : null

  // Timestamps. Prefer the actual request-received time the HTTP framework
  // captured (Hapi sets `request.info.received` to the ms epoch when the TCP
  // socket received the first byte); fall back to "now" if absent.
  const receivedMs = request.info?.received ?? Date.now()
  const now = new Date(receivedMs)
  const timeEpoch = receivedMs
  const time = formatClfTime(now)

  // Body + isBase64Encoded.
  // Always emit both fields: AWS always includes body (null when absent) and
  // isBase64Encoded (false when body is null or non-binary). An empty-string
  // request body is also surfaced as `null` — matching real APIGW, which
  // treats "no body" and "empty body" as equivalent for the v2 payload. A
  // body-allowed method (POST/PUT/PATCH) sent with no body arrives as a
  // zero-length Buffer (payload parsing disabled), which is also "no body".
  let body = null
  let isBase64Encoded = false
  const noBody =
    request.payload === undefined ||
    request.payload === '' ||
    (Buffer.isBuffer(request.payload) && request.payload.length === 0)
  if (!noBody) {
    const contentType = request.headers['content-type'] ?? ''
    if (isBinaryContentType(contentType)) {
      const buf = Buffer.isBuffer(request.payload)
        ? request.payload
        : Buffer.from(request.payload)
      body = buf.toString('base64')
      isBase64Encoded = true
    } else {
      // A non-binary body is delivered byte-for-byte. The raw Buffer Hapi
      // hands us (payload parsing disabled) is decoded as UTF-8 so insignificant
      // JSON whitespace survives; a string passes through unchanged; an object
      // (from direct callers) is JSON-stringified. A body whose Content-Encoding
      // is gzip but whose content-type is non-binary is passed through as UTF-8,
      // matching real API Gateway, which only base64-encodes configured binary
      // media types.
      if (Buffer.isBuffer(request.payload)) {
        body = request.payload.toString('utf8')
      } else if (typeof request.payload === 'string') {
        body = request.payload
      } else {
        body = JSON.stringify(request.payload)
      }
      isBase64Encoded = false
    }
  }

  injectHeaderDefaults(headers, body, isBase64Encoded)

  const authorizer = resolveAuthorizer(request)

  /** @type {object} */
  const event = {
    version: '2.0',
    routeKey,
    rawPath,
    rawQueryString,
    ...(cookies !== undefined ? { cookies } : {}),
    headers,
    queryStringParameters,
    pathParameters,
    requestContext: {
      accountId,
      apiId: 'offline',
      ...(authorizer ? { authorizer } : {}),
      domainName,
      domainPrefix: 'offline',
      http: {
        method,
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: request.info?.remoteAddress ?? '127.0.0.1',
        userAgent: request.headers['user-agent'] ?? '',
      },
      ...(route.operationName !== undefined
        ? { operationName: route.operationName }
        : {}),
      requestId: crypto.randomUUID(),
      routeKey,
      // HTTP APIs deploy to the auto-created `$default` stage; the event always
      // reports that, independent of the local `--stage`.
      stage: '$default',
      time,
      timeEpoch,
    },
    stageVariables: null,
    body,
    isBase64Encoded,
  }

  return event
}
