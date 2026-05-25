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
import { FAKE_ACCOUNT_ID } from '../../constants.js'

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
 * Month abbreviations indexed by `Date#getUTCMonth()` (0-based).
 *
 * @type {string[]}
 */
const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Format a `Date` as the APIGW Common Log Format timestamp used for
 * `requestContext.requestTime`: `dd/Mon/YYYY:HH:MM:SS +0000`.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatClfTime(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const dd = pad(date.getUTCDate())
  const mon = MONTH_ABBR[date.getUTCMonth()]
  const yyyy = date.getUTCFullYear()
  const hh = pad(date.getUTCHours())
  const mm = pad(date.getUTCMinutes())
  const ss = pad(date.getUTCSeconds())
  return `${dd}/${mon}/${yyyy}:${hh}:${mm}:${ss} +0000`
}

/**
 * Build the event `headers` map from Node's flat `rawHeaders` array
 * (`[name, value, name, value, ...]`). Names are lower-cased, duplicates for
 * the same name are joined with `,`. Unlike the HTTP API v2 factory, `cookie`
 * is included — REST v1 carries cookies via headers, not a separate field.
 *
 * @param {string[]} rawHeaders
 * @returns {Record<string, string>}
 */
function buildHeadersFromRaw(rawHeaders) {
  const acc = new Map()
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const lk = rawHeaders[i].toLowerCase()
    const list = acc.get(lk)
    if (list) {
      list.push(rawHeaders[i + 1])
    } else {
      acc.set(lk, [rawHeaders[i + 1]])
    }
  }
  const result = {}
  for (const [key, values] of acc.entries()) {
    result[key] = values.join(',')
  }
  return result
}

/**
 * Fallback header builder for in-process callers (unit tests, simulated
 * requests) where Node's `rawHeaders` is not available. Folds Hapi's
 * pre-collapsed map down to lower-cased single-value entries.
 *
 * @param {Record<string, string | string[]>} headers
 * @returns {Record<string, string>}
 */
function buildHeadersFromHapi(headers) {
  const result = {}
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value
  }
  return result
}

/**
 * Multi-value variant — one array per (lower-cased) header name. Cookies are
 * preserved (no special-casing).
 *
 * @param {string[]} rawHeaders
 * @returns {Record<string, string[]>}
 */
function buildMultiValueHeadersFromRaw(rawHeaders) {
  const acc = new Map()
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const lk = rawHeaders[i].toLowerCase()
    const list = acc.get(lk)
    if (list) {
      list.push(rawHeaders[i + 1])
    } else {
      acc.set(lk, [rawHeaders[i + 1]])
    }
  }
  const result = {}
  for (const [key, values] of acc.entries()) {
    result[key] = values
  }
  return result
}

/**
 * @param {Record<string, string | string[]>} headers
 * @returns {Record<string, string[]>}
 */
function buildMultiValueHeadersFromHapi(headers) {
  const result = {}
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value : [value]
  }
  return result
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
  if (request.payload === undefined || request.payload === '') {
    return { body: null, isBase64Encoded: false }
  }
  const contentType = request.headers?.['content-type'] ?? ''
  if (isBinaryContentType(contentType)) {
    const buf = Buffer.isBuffer(request.payload)
      ? request.payload
      : Buffer.from(request.payload)
    return { body: buf.toString('base64'), isBase64Encoded: true }
  }
  const body =
    typeof request.payload === 'string'
      ? request.payload
      : JSON.stringify(request.payload)
  return { body, isBase64Encoded: false }
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
 * @returns {object} APIGW REST API v1 Lambda-proxy event.
 */
export function buildRestApiEvent({
  request,
  route,
  stage,
  accountId = FAKE_ACCOUNT_ID,
}) {
  const httpMethod = request.method.toUpperCase()
  const path = request.path

  // Headers — read from Node's flat `rawHeaders` array when available so that
  // duplicate header lines are preserved verbatim. Fall back to Hapi's
  // pre-collapsed map for in-process callers (unit tests, simulated
  // requests) that don't carry the raw socket data.
  const rawHeaders = request.raw?.req?.rawHeaders
  const useRaw = Array.isArray(rawHeaders) && rawHeaders.length > 0
  const headers = useRaw
    ? buildHeadersFromRaw(rawHeaders)
    : buildHeadersFromHapi(request.headers ?? {})
  const multiValueHeaders = useRaw
    ? buildMultiValueHeadersFromRaw(rawHeaders)
    : buildMultiValueHeadersFromHapi(request.headers ?? {})

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

  const userAgent = request.headers?.['user-agent'] ?? ''
  const sourceIp = request.info?.remoteAddress ?? '127.0.0.1'
  const domainName = request.headers?.host ?? 'localhost'

  return {
    body,
    headers,
    httpMethod,
    isBase64Encoded,
    multiValueHeaders,
    multiValueQueryStringParameters,
    path,
    pathParameters,
    queryStringParameters,
    requestContext: {
      accountId,
      apiId: 'offline',
      domainName,
      domainPrefix: 'offline',
      extendedRequestId: crypto.randomUUID(),
      httpMethod,
      identity: {
        accessKey: null,
        accountId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp,
        user: null,
        userAgent,
        userArn: null,
      },
      path,
      protocol: 'HTTP/1.1',
      requestId: crypto.randomUUID(),
      requestTime,
      requestTimeEpoch,
      resourceId: 'offline',
      resourcePath: route.apigwPath,
      stage,
    },
    resource: route.apigwPath,
    stageVariables: null,
  }
}
