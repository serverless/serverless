import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { decodeJwt } from 'jose'
import { jsonPath } from './json-path.js'

/**
 * Build two views of the request headers from a Node raw-headers array (flat
 * [name, value, name, value, ...]) or, failing that, the framework-parsed
 * `request.headers`:
 *
 *  - `lower` — keyed by lowercased name, for internal case-insensitive reads
 *    (user-agent, authorization, identity).
 *  - `wire`  — keyed by the original first-seen header casing, surfaced to
 *    mapping templates via `$input.params().header` to match API Gateway,
 *    which preserves the casing the client sent.
 *
 * For a repeated header (case-insensitive), the first-seen key casing is kept
 * and the latest value wins, mirroring the lowercased map.
 */
function readHeaderMaps(request) {
  const lower = {}
  const wire = {}
  const raw = request?.raw?.req?.rawHeaders
  if (Array.isArray(raw) && raw.length > 0) {
    for (let i = 0; i < raw.length; i += 2) {
      const name = raw[i]
      const value = raw[i + 1]
      if (typeof name !== 'string') continue
      const lc = name.toLowerCase()
      lower[lc] = value
      const existingKey = Object.keys(wire).find((k) => k.toLowerCase() === lc)
      wire[existingKey ?? name] = value
    }
    return { lower, wire }
  }
  const headers = request?.headers ?? {}
  for (const key of Object.keys(headers)) {
    lower[key.toLowerCase()] = headers[key]
    wire[key] = headers[key]
  }
  return { lower, wire }
}

// Unicode line/paragraph separators. Built via fromCharCode so the literal
// code points never appear in source (they are invalid in some parsers).
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)
const JS_ESCAPE_PATTERN = new RegExp(
  `["'\\\\\\n\\r]|${LINE_SEPARATOR}|${PARAGRAPH_SEPARATOR}`,
  'g',
)

/**
 * Escape a string for safe embedding in JavaScript/JSON. Port of the
 * MIT-licensed `js-string-escape` algorithm (Copyright Joshua Holbrook),
 * inlined to avoid a runtime dependency.
 */
function jsEscapeString(string) {
  return String(string).replace(JS_ESCAPE_PATTERN, (character) => {
    switch (character) {
      case '"':
      case "'":
      case '\\':
        return `\\${character}`
      case '\n':
        return '\\n'
      case '\r':
        return '\\r'
      case LINE_SEPARATOR:
        return '\\u2028'
      case PARAGRAPH_SEPARATOR:
        return '\\u2029'
      default:
        return character
    }
  })
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Mirrors API Gateway's `$util.escapeJavaScript`: strings are escaped (with
 * newlines kept literal, as API Gateway renders them); plain objects are
 * stringified with each value escaped; everything else coerces via toString.
 */
function escapeJavaScript(x) {
  if (typeof x === 'string') {
    return jsEscapeString(x).replaceAll('\\n', '\n')
  }
  if (isPlainObject(x)) {
    const escaped = {}
    for (const [key, value] of Object.entries(x)) {
      escaped[key] = jsEscapeString(value)
    }
    return JSON.stringify(escaped)
  }
  if (x != null && typeof x.toString === 'function') {
    return escapeJavaScript(x.toString())
  }
  return x
}

/**
 * Build the `{ context, input, util }` triple used as the variable scope for
 * REST API velocity mapping templates. Models the AWS API Gateway mapping
 * template reference; placeholders prefixed `offlineContext_` mark fields the
 * local app server does not (yet) populate.
 *
 * @param {object} args
 * @param {object} args.request      - Hapi-shaped request object.
 * @param {string} args.stage        - The deployment stage (e.g. "dev").
 * @param {unknown} args.payload     - The parsed request body.
 * @param {string} args.resourcePath - The API Gateway resource path.
 * @returns {{ context: object, input: object, util: object, stageVariables: object }}
 */
export function buildVelocityContext({
  request,
  stage,
  payload,
  resourcePath,
}) {
  const { lower: headers, wire: wireHeaders } = readHeaderMaps(request)
  const path = (expr) => jsonPath(payload, expr)

  const authCredentials = request?.auth?.credentials
  const authorizer = {
    ...(authCredentials?.authorizer ?? {}),
    principalId:
      authCredentials?.principalId ??
      process.env.PRINCIPAL_ID ??
      'offlineContext_authorizer_principalId',
  }

  // Surface JWT claims on $context.authorizer.claims, matching API Gateway
  // (e.g. for Cognito user-pool authorizers). Strip a leading "Bearer " and
  // decode without verifying the signature; a non-JWT token leaves claims unset.
  let token = headers.authorization ?? headers.Authorization
  if (typeof token === 'string' && token.split(' ')[0] === 'Bearer') {
    token = token.split(' ')[1]
  }
  if (token) {
    try {
      authorizer.claims = decodeJwt(token)
    } catch {
      // Non-JWT bearer token: leave claims unset.
    }
  }

  const context = {
    apiId: 'offlineContext_apiId',
    authorizer,
    httpMethod: request.method.toUpperCase(),
    identity: {
      accountId: 'offlineContext_accountId',
      apiKey: 'offlineContext_apiKey',
      apiKeyId: 'offlineContext_apiKeyId',
      caller: 'offlineContext_caller',
      cognitoAuthenticationProvider:
        'offlineContext_cognitoAuthenticationProvider',
      cognitoAuthenticationType: 'offlineContext_cognitoAuthenticationType',
      sourceIp: request?.info?.remoteAddress ?? '127.0.0.1',
      user: 'offlineContext_user',
      userAgent: headers['user-agent'] ?? '',
      userArn: 'offlineContext_userArn',
    },
    requestId: crypto.randomUUID(),
    resourceId: 'offlineContext_resourceId',
    resourcePath,
    stage,
  }

  const input = {
    body: payload,
    json: (expr) => JSON.stringify(path(expr)),
    params: (name) => {
      if (name === undefined) {
        return {
          header: { ...wireHeaders },
          path: { ...(request.params ?? {}) },
          querystring: { ...(request.query ?? {}) },
        }
      }
      return (
        request.params?.[name] ??
        request.query?.[name] ??
        headers[String(name).toLowerCase()]
      )
    },
    path,
  }

  const util = {
    base64Decode: (x) => Buffer.from(String(x), 'base64').toString('binary'),
    base64Encode: (x) => Buffer.from(String(x), 'binary').toString('base64'),
    escapeJavaScript,
    parseJson: JSON.parse,
    urlDecode: (x) => decodeURIComponent(String(x).replaceAll('+', ' ')),
    urlEncode: encodeURI,
  }

  return { context, input, util, stageVariables: {} }
}
