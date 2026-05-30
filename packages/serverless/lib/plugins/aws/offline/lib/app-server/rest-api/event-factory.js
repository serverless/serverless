/**
 * APIGW REST API (v1) Lambda-proxy event factory for the offline REST server.
 *
 * Transforms an incoming Hapi request into the JSON payload that AWS Lambda
 * receives when a function is invoked via an API Gateway REST API with
 * Lambda-proxy integration. The shape differs in several ways from the HTTP
 * API v2 payload (different field names, multi-value header / query maps as
 * top-level fields, `path` includes the stage prefix, `pathParameters` is
 * `null` rather than absent when empty), so a fresh module mirrors the AWS
 * contract without trying to reuse the v2 sibling.
 *
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 */

import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import { FAKE_ACCOUNT_ID } from '../../constants.js'
import { parseJsonSafe } from '../shared/json-utils.js'
import { formatClfTime } from '../shared/clf-time.js'
import { buildRestIdentity } from '../shared/rest-identity.js'
import {
  PLACEHOLDER_API_ID,
  PLACEHOLDER_DOMAIN_PREFIX,
  PLACEHOLDER_RESOURCE_ID,
  PLACEHOLDER_PROTOCOL,
} from '../shared/rest-request-context.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Content-type prefixes / exact values treated as binary. A request carrying
 * one of these has its body base64-encoded with `isBase64Encoded: true`.
 *
 * @type {string[]}
 */
const BINARY_CONTENT_TYPES = ['application/octet-stream', 'multipart/form-data']

/**
 * @param {string} contentType
 * @returns {boolean}
 */
function isBinaryContentType(contentType) {
  if (!contentType) return false
  const ct = contentType.toLowerCase()
  return BINARY_CONTENT_TYPES.some((prefix) => ct.startsWith(prefix))
}

/**
 * Strip the mount decoration the local server prepends (an optional prefix,
 * then the stage) from the wire path, recovering the API-relative path AWS
 * exposes as `event.path`. The route is mounted `/<stage>/<prefix>/...` (stage
 * outermost), so the decoration is stripped in that same outer-to-inner order:
 * the stage first (unless `--noPrependStageInUrl`), then the prefix.
 *
 * @param {string} rawPath
 * @param {{ stage: string, prefix?: string, noPrependStageInUrl?: boolean }} opts
 * @returns {string}
 */
function stripMountDecoration(rawPath, { stage, prefix, noPrependStageInUrl }) {
  let p = rawPath
  const strip = (segment) => {
    if (!segment) return
    const lead = `/${segment}`
    if (p === lead) p = '/'
    else if (p.startsWith(`${lead}/`)) p = p.slice(lead.length)
  }
  if (!noPrependStageInUrl) strip(stage)
  strip(prefix)
  return p
}

/**
 * Resolve the `requestContext.authorizer` value for the downstream Lambda
 * event, applying the documented precedence:
 *
 *   1. `sls-offline-authorizer-override` request header (per-request).
 *   2. `process.env.AUTHORIZER` (process-wide override a user may set).
 *   3. `noAuth` mode default — an empty authorizer object `{}` so handlers
 *      that read `requestContext.authorizer` still see a value when
 *      authorizers are disabled.
 *   4. `request.auth.credentials.authorizer` (from the executed authorizer
 *      Hapi scheme).
 *
 * Returns `undefined` when none apply — the event omits the field, matching
 * AWS API Gateway when no authorizer is attached to the route.
 *
 * @param {object} request
 * @param {boolean} [noAuth=false]
 * @returns {object | undefined}
 */
function resolveAuthorizer(request, noAuth = false) {
  const fromHeader = parseJsonSafe(
    request?.headers?.['sls-offline-authorizer-override'],
  )
  if (fromHeader) return fromHeader

  const fromEnv = parseJsonSafe(process.env.AUTHORIZER)
  if (fromEnv) return fromEnv

  if (noAuth) return {}

  const fromCredentials = request?.auth?.credentials?.authorizer
  if (fromCredentials && typeof fromCredentials === 'object') {
    return fromCredentials
  }

  return undefined
}

/**
 * Bucket request headers into a `Map<string, string[]>` keyed by the header
 * name as it arrived on the wire. AWS API Gateway REST APIs surface request
 * header names with their original casing preserved (e.g. `Content-Type`,
 * `User-Agent`), so the map key is the verbatim received name rather than a
 * lower-cased form. Prefers Node's flat `rawHeaders` array (preserves both the
 * casing and duplicates pre-fold); falls back to Hapi's collapsed
 * `request.headers` map for in-process callers that don't carry the raw socket
 * data (that map is already lower-cased and is used as-is).
 *
 * The cookie header is included in REST v1 (unlike v2, where it's surfaced
 * separately on event.cookies).
 *
 * @param {object} request
 * @returns {Map<string, string[]>}
 */
function bucketHeaders(request) {
  const rawHeaders = request.raw?.req?.rawHeaders
  const acc = new Map()
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      const name = rawHeaders[i]
      const list = acc.get(name)
      if (list) list.push(rawHeaders[i + 1])
      else acc.set(name, [rawHeaders[i + 1]])
    }
    return acc
  }
  for (const [k, v] of Object.entries(request.headers ?? {})) {
    acc.set(k, Array.isArray(v) ? [...v] : [v])
  }
  return acc
}

/**
 * Build the event `headers` map. Names keep their original wire casing; for a
 * header sent more than once the single-value map keeps the last value (the
 * full list lives in `multiValueHeaders`), matching API Gateway. Unlike the
 * HTTP API v2 factory, `cookie` is included — REST v1 carries cookies via
 * headers, not a separate field.
 *
 * @param {object} request
 * @returns {Record<string, string>}
 */
function buildHeaders(request) {
  const buckets = bucketHeaders(request)
  const out = {}
  for (const [k, vs] of buckets.entries()) out[k] = vs[vs.length - 1]
  return out
}

/**
 * Multi-value variant — one array per header name, keyed by the original wire
 * casing. Cookies are preserved (no special-casing).
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
 * the LAST occurrence (the multi-value field captures all of them).
 * Returns `null` when the request had no query string at all.
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
 * content types.
 *
 * @param {object} request  Hapi request.
 * @returns {{ body: string | null, isBase64Encoded: boolean }}
 */
function buildBody(request) {
  // "No body" covers an absent payload, an empty string, and the zero-length
  // Buffer Hapi hands us for a body-allowed method (POST/PUT/PATCH) sent with
  // no body (payload parsing disabled for proxy routes). APIGW emits `null` for
  // all of these and injects no Content-Length/Content-Type.
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
  // (payload parsing disabled for proxy routes) is decoded as UTF-8 so
  // insignificant JSON whitespace survives; a string passes through unchanged;
  // an object (from direct callers) is JSON-stringified. A body whose
  // Content-Encoding is gzip but whose content-type is non-binary is passed
  // through as UTF-8, matching real API Gateway, which only base64-encodes
  // configured binary media types.
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
 * Compute the `Content-Length` / default `Content-Type` entries AWS API
 * Gateway injects into the event header maps when the client did not supply
 * them. Injected keys use the canonical capitalized form; an entry is only
 * produced when the header is absent (case-insensitive) from the names the
 * client already sent, so a client-supplied header in any casing suppresses
 * the default.
 *
 * - `Content-Length` is the request body's byte length, produced only when a
 *   body is present. Base64-encoded bodies are measured in decoded form.
 * - `Content-Type` defaults to `application/json`, produced only when a body is
 *   present. A bodyless request (e.g. a plain GET) carries no content-type in
 *   the event headers, matching real API Gateway.
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
    defaults['Content-Length'] = String(
      isBase64Encoded
        ? Buffer.byteLength(body, 'base64')
        : Buffer.byteLength(body),
    )
  }
  if (!has('content-type')) {
    defaults['Content-Type'] = 'application/json'
  }
  return defaults
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an APIGW REST API (v1) Lambda-proxy event from a Hapi request.
 *
 * @param {object} opts
 * @param {object} opts.request
 *   The Hapi request object. The following fields are used:
 *   - `request.method` {string} — HTTP method (any case; uppercased internally).
 *   - `request.path` {string} — Full wire path including any stage prefix.
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
 * @param {string} opts.route.apigwPath
 *   The APIGW route template with placeholders intact (e.g. `'/users/{id}'`).
 * @param {string} opts.route.functionName
 *   Lambda function name backing the route.
 *
 * @param {string} opts.stage
 *   API Gateway stage name (e.g. `'dev'`).
 *
 * @param {string} [opts.accountId]
 *   12-digit AWS account ID. Defaults to `FAKE_ACCOUNT_ID`.
 *
 * @param {boolean} [opts.noAuth]
 *   When `true` (the `--noAuth` flag), authorizers are skipped and
 *   `requestContext.authorizer` defaults to an empty object so handlers that
 *   read it still observe a value.
 *
 * @returns {object} APIGW REST API v1 Lambda-proxy event.
 */
export function buildRestApiEvent({
  request,
  route,
  stage,
  prefix,
  noPrependStageInUrl = false,
  accountId = FAKE_ACCOUNT_ID,
  noAuth = false,
}) {
  const httpMethod = request.method.toUpperCase()
  // `requestContext.path` carries the full wire path (stage + optional
  // prefix); `event.path` is the API-relative path with that mount decoration
  // stripped, matching real API Gateway.
  const path = request.path
  const eventPath = stripMountDecoration(request.path, {
    stage,
    prefix,
    noPrependStageInUrl,
  })

  // Headers — read from Node's flat `rawHeaders` array when available so that
  // duplicate header lines are preserved verbatim. Fall back to Hapi's
  // pre-collapsed map for in-process callers (unit tests, simulated
  // requests) that don't carry the raw socket data.
  const headers = buildHeaders(request)
  const multiValueHeaders = buildMultiValueHeaders(request)

  const { searchParams } = request.url
  const queryStringParameters = buildQueryStringParameters(searchParams)
  const multiValueQueryStringParameters =
    buildMultiValueQueryStringParameters(searchParams)

  // Path parameters — APIGW emits `null` when the route has no placeholders.
  const pathParameters =
    request.params && Object.keys(request.params).length > 0
      ? { ...request.params }
      : null

  // Timestamps. Prefer Hapi's `request.info.received` (ms epoch the socket
  // received the first byte); fall back to "now" if absent.
  const receivedMs = request.info?.received ?? Date.now()
  const requestTime = formatClfTime(new Date(receivedMs))
  const requestTimeEpoch = receivedMs

  const { body, isBase64Encoded } = buildBody(request)

  // AWS API Gateway injects a Content-Length (when a body is present) and a
  // default Content-Type when the client sent none. The injected keys use the
  // canonical capitalized form and are written to both the single-value and
  // multi-value header maps so they stay mirrored; a header the client already
  // supplied (in any casing) suppresses the corresponding default.
  const defaults = headerDefaults(Object.keys(headers), body, isBase64Encoded)
  for (const [name, value] of Object.entries(defaults)) {
    headers[name] = value
    multiValueHeaders[name] = [value]
  }

  const userAgent = request.headers?.['user-agent'] ?? ''
  const sourceIp = request.info?.remoteAddress ?? '127.0.0.1'
  const domainName = request.headers?.host ?? 'localhost'

  const authorizer = resolveAuthorizer(request, noAuth)

  return {
    body,
    headers,
    httpMethod,
    isBase64Encoded,
    multiValueHeaders,
    multiValueQueryStringParameters,
    path: eventPath,
    pathParameters,
    queryStringParameters,
    requestContext: {
      accountId,
      apiId: PLACEHOLDER_API_ID,
      ...(authorizer ? { authorizer } : {}),
      domainName,
      domainPrefix: PLACEHOLDER_DOMAIN_PREFIX,
      extendedRequestId: crypto.randomUUID(),
      httpMethod,
      identity: buildRestIdentity({ sourceIp, userAgent }),
      path,
      protocol: PLACEHOLDER_PROTOCOL,
      requestId: crypto.randomUUID(),
      requestTime,
      requestTimeEpoch,
      resourceId: PLACEHOLDER_RESOURCE_ID,
      resourcePath: route.apigwPath,
      stage,
    },
    resource: route.apigwPath,
    stageVariables: null,
  }
}
