/**
 * v2 Lambda authorizer REQUEST event factory for HTTP API authorizers.
 *
 * AWS HTTP API v2 only supports REQUEST-type Lambda authorizers (no TOKEN);
 * shape per https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html
 */

import { resolveRawPath } from '../shared/raw-path.js'

/**
 * @param {object} args
 * @param {object} args.request                Hapi request.
 * @param {string} args.routeArn               Synthesized v2 routeArn.
 * @param {string} args.routeKey               e.g. `GET /items/{id}`.
 * @param {string | null} args.authorizationToken  Pre-resolved identity value.
 * @param {string} args.stage
 * @param {string} args.accountId
 * @param {string} args.domainName
 * @param {string} args.requestId
 * @returns {object}
 */
export function buildV2RequestEvent({
  request,
  routeArn,
  routeKey,
  authorizationToken,
  stage,
  accountId,
  domainName,
  requestId,
}) {
  const headers = readHeadersLowercase(request)
  const query = request.query ?? {}
  const params = request.params ?? {}
  const hasQuery = Object.keys(query).length > 0
  const hasParams = Object.keys(params).length > 0

  // rawPath is reported verbatim: a trailing slash is preserved and
  // percent-encoding is not decoded. Sourced from the original wire path rather
  // than Hapi's trailing-slash-stripped, percent-decoded request.path.
  const rawPath = resolveRawPath(request)
  const rawQueryString = readRawQueryString(request, query)
  const cookies = readCookies(request, headers)

  return {
    version: '2.0',
    type: 'REQUEST',
    routeArn,
    routeKey,
    identitySource:
      typeof authorizationToken === 'string' && authorizationToken.length > 0
        ? [authorizationToken]
        : [],
    rawPath,
    rawQueryString,
    cookies,
    headers,
    queryStringParameters: hasQuery ? { ...query } : null,
    pathParameters: hasParams ? { ...params } : null,
    stageVariables: null,
    requestContext: {
      accountId,
      apiId: 'offline',
      domainName,
      domainPrefix: 'offline',
      http: {
        method: request.method.toUpperCase(),
        path: request.path,
        protocol: 'HTTP/1.1',
        sourceIp: request.info?.remoteAddress ?? '127.0.0.1',
        userAgent: headers['user-agent'] ?? '',
      },
      requestId,
      routeKey,
      stage,
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  }
}

/**
 * Read headers from the raw socket array (preserves casing) and lowercase
 * the keys. Falls back to `request.headers` for in-process tests.
 *
 * v2 represents headers as `{ name: stringValue }` — multi-value entries
 * are comma-joined per AWS. We preserve the rawHeaders order so duplicates
 * are joined left-to-right.
 */
function readHeadersLowercase(request) {
  const rawHeaders = request?.raw?.req?.rawHeaders
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    const out = {}
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      const name = rawHeaders[i].toLowerCase()
      const value = rawHeaders[i + 1]
      out[name] = out[name] === undefined ? value : `${out[name]},${value}`
    }
    return out
  }
  const out = {}
  for (const [k, v] of Object.entries(request?.headers ?? {})) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v
  }
  return out
}

/**
 * Build the raw query string (no leading `?`) the way AWS HTTP API reports it.
 * Prefers the WHATWG `request.url.searchParams` so encoding is normalized
 * identically to the v2 proxy event; falls back to re-encoding Hapi's parsed
 * `request.query` for in-process callers that don't carry a URL object.
 */
function readRawQueryString(request, query) {
  const searchParams = request?.url?.searchParams
  if (searchParams) return searchParams.toString()

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v)
    } else {
      params.append(key, value)
    }
  }
  return params.toString()
}

/**
 * Build the `cookies` array of raw `name=value` strings the way AWS HTTP API
 * reports it. Prefers Hapi's parsed `request.state` map (handles quoting,
 * percent-decoding, and duplicate cookie names surfaced as arrays); falls back
 * to splitting the raw `Cookie` header for in-process callers that don't carry
 * parsed state. Returns an empty array when no cookies are present.
 */
function readCookies(request, headers) {
  if (request?.state && Object.keys(request.state).length > 0) {
    return Object.entries(request.state).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((v) => `${key}=${v}`)
        : `${key}=${value}`,
    )
  }
  const cookieHeader = headers?.cookie
  if (!cookieHeader) return []
  return cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
}
