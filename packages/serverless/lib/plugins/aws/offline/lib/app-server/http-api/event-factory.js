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
import { FAKE_ACCOUNT_ID } from '../../constants.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
 * Format a `Date` as the APIGW access-log timestamp:
 * `dd/Mon/YYYY:HH:MM:SS +0000`
 *
 * This is the strftime pattern `%d/%b/%Y:%H:%M:%S %z` with UTC offset.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatApigwTime(date) {
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
 * Parse query-string parameters from a `URLSearchParams` instance.
 * Multi-value keys (e.g. `?id=1&id=2`) are joined by `,` to match APIGW
 * behaviour.
 *
 * Returns `undefined` when there are no parameters at all.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Record<string, string> | undefined}
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

  if (map.size === 0) return undefined

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
 *
 * @param {string} opts.stage
 *   API Gateway stage name (e.g. `'dev'`).  Used in `requestContext.stage`.
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
  stage,
  accountId = FAKE_ACCOUNT_ID,
  domainName,
}) {
  const method = request.method.toUpperCase()
  const routeKey = `${method} ${route.path}`
  const rawPath = request.path

  // Query string — empty string when absent (APIGW spec requirement).
  const rawQueryString = request.url.search
    ? request.url.search.slice(1) // strip leading '?'
    : ''

  const queryStringParameters = parseQueryStringParameters(
    request.url.searchParams,
  )

  // Headers — lower-cased, multi-value joined, cookie excluded.
  const headers = normaliseHeaders(request.headers)

  // Cookies — parsed from the cookie header; field omitted if absent.
  const cookieHeader = request.headers['cookie'] ?? request.headers['Cookie']
  const cookies = cookieHeader
    ? cookieHeader
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined

  // Path parameters — omit field when empty.
  const pathParameters =
    request.params && Object.keys(request.params).length > 0
      ? request.params
      : undefined

  // Timestamps.
  const now = new Date()
  const timeEpoch = now.getTime()
  const time = formatApigwTime(now)

  // Body + isBase64Encoded.
  // Always emit both fields: AWS always includes body (null when absent) and
  // isBase64Encoded (false when body is null or non-binary).
  let body = null
  let isBase64Encoded = false
  if (request.payload !== undefined) {
    const contentType = request.headers['content-type'] ?? ''
    if (isBinaryContentType(contentType)) {
      const buf = Buffer.isBuffer(request.payload)
        ? request.payload
        : Buffer.from(request.payload)
      body = buf.toString('base64')
      isBase64Encoded = true
    } else {
      body =
        typeof request.payload === 'string'
          ? request.payload
          : JSON.stringify(request.payload)
      isBase64Encoded = false
    }
  }

  /** @type {object} */
  const event = {
    version: '2.0',
    routeKey,
    rawPath,
    rawQueryString,
    ...(cookies !== undefined ? { cookies } : {}),
    headers,
    ...(queryStringParameters !== undefined ? { queryStringParameters } : {}),
    ...(pathParameters !== undefined ? { pathParameters } : {}),
    requestContext: {
      accountId,
      apiId: 'offline',
      domainName,
      domainPrefix: 'offline',
      http: {
        method,
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: request.info?.remoteAddress ?? '127.0.0.1',
        userAgent: request.headers['user-agent'] ?? 'curl/8.x',
      },
      requestId: crypto.randomUUID(),
      routeKey,
      stage,
      time,
      timeEpoch,
    },
    body,
    isBase64Encoded,
  }

  return event
}
