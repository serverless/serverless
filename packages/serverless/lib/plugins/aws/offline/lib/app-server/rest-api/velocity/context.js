import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { jsonPath } from './json-path.js'

/**
 * Parse a Node raw-headers array (flat [name, value, name, value, ...]) into
 * a plain object keyed by lowercased header name. Returns an empty object if
 * the input is falsy or not an array.
 */
function parseRawHeaders(rawHeaders) {
  const result = {}
  if (!Array.isArray(rawHeaders)) return result
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i]
    const value = rawHeaders[i + 1]
    if (typeof name !== 'string') continue
    result[name.toLowerCase()] = value
  }
  return result
}

/**
 * Return a headers object keyed by lowercased name. Prefer the raw socket
 * header array when present (preserves real wire data); otherwise fall back
 * to the framework-parsed `request.headers`, lowercasing keys defensively.
 */
function readHeaders(request) {
  const raw = request?.raw?.req?.rawHeaders
  if (Array.isArray(raw) && raw.length > 0) return parseRawHeaders(raw)
  const headers = request?.headers ?? {}
  const result = {}
  for (const key of Object.keys(headers)) {
    result[key.toLowerCase()] = headers[key]
  }
  return result
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
 * @returns {{ context: object, input: object, util: object }}
 */
export function buildVelocityContext({
  request,
  stage,
  payload,
  resourcePath,
}) {
  const headers = readHeaders(request)
  const path = (expr) => jsonPath(payload, expr)

  const authCredentials = request?.auth?.credentials
  const authorizer = {
    ...(authCredentials?.authorizer ?? {}),
    principalId:
      authCredentials?.principalId ?? 'offlineContext_authorizer_principalId',
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
          header: { ...headers },
          path: { ...(request.params ?? {}) },
          querystring: { ...(request.query ?? {}) },
        }
      }
      return request.params?.[name] ?? request.query?.[name] ?? headers[name]
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

  return { context, input, util }
}
