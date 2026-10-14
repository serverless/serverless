/**
 * Header values that carry credentials are replaced before an event or a response is written to a
 * file or printed: in `headers` and `multiValueHeaders` (API Gateway REST and HTTP APIs, function
 * URLs, Application Load Balancers, also behind their OIDC or Amazon Cognito authentication), in
 * an HTTP API's `cookies`, in a REST API event's
 * `requestContext.identity.apiKey` (the `x-api-key` value again), in a TOKEN authorizer's
 * `authorizationToken`, and in an HTTP API Lambda authorizer's `identitySource` (the identity
 * source values again: a list in payload format 2.0, one comma-joined string in 1.0). Names match
 * in any case. Query strings and bodies are kept as they are. The input is never changed; `paths`
 * lists what was replaced. Replay uses the event the session keeps in memory, which is not
 * redacted.
 */
export const REDACTED = '[redacted]'
export const REDACTED_HEADERS = Object.freeze([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-amz-security-token',
  // What an Application Load Balancer with OIDC or Amazon Cognito authentication forwards: the
  // identity provider's access token, the signed claims, and the user's identity.
  'x-amzn-oidc-accesstoken',
  'x-amzn-oidc-data',
  'x-amzn-oidc-identity',
])
const SECRET = new Set(REDACTED_HEADERS)

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * `headers` or `multiValueHeaders` with secret values replaced (a list value element by element).
 */
const redactHeaders = (headers, at, paths) => {
  if (!isPlainObject(headers)) return headers
  let copy = null
  for (const [name, value] of Object.entries(headers)) {
    if (!SECRET.has(name.toLowerCase())) continue
    copy ??= { ...headers }
    copy[name] = Array.isArray(value) ? value.map(() => REDACTED) : REDACTED
    paths.push(`${at}.${name}`)
  }
  return copy ?? headers
}

const redactCookies = (cookies, at, paths) => {
  if (!Array.isArray(cookies) || cookies.length === 0) return cookies
  paths.push(at)
  return cookies.map(() => REDACTED)
}

const redactHttpShape = (value, prefix) => {
  if (!isPlainObject(value)) return { value, paths: [] }
  const paths = []
  const result = { ...value }
  for (const key of ['headers', 'multiValueHeaders']) {
    if (key in value)
      result[key] = redactHeaders(value[key], `${prefix}${key}`, paths)
  }
  if ('cookies' in value) {
    result.cookies = redactCookies(value.cookies, `${prefix}cookies`, paths)
  }
  return { value: result, paths }
}

/**
 * `{ value, paths }`: the event with credential headers, cookies, the API key and an authorizer's
 * token and identity sources replaced.
 */
export const redactEvent = (event) => {
  const { value, paths } = redactHttpShape(event, '')
  const apiKey = value?.requestContext?.identity?.apiKey
  if (typeof apiKey === 'string' && apiKey) {
    value.requestContext = {
      ...value.requestContext,
      identity: { ...value.requestContext.identity, apiKey: REDACTED },
    }
    paths.push('requestContext.identity.apiKey')
  }
  if (
    typeof value?.authorizationToken === 'string' &&
    value.authorizationToken
  ) {
    value.authorizationToken = REDACTED
    paths.push('authorizationToken')
  }
  const identitySource = value?.identitySource
  if (Array.isArray(identitySource) && identitySource.length) {
    value.identitySource = identitySource.map(() => REDACTED)
    paths.push('identitySource')
  } else if (typeof identitySource === 'string' && identitySource) {
    value.identitySource = REDACTED
    paths.push('identitySource')
  }
  return { value, paths }
}

/** `{ value, paths }`: the response with credential headers and cookies replaced. */
export const redactResponse = (response) => redactHttpShape(response, '')
