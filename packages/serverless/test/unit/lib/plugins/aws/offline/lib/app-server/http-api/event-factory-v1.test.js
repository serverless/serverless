import { Buffer } from 'node:buffer'
import { buildHttpApiV1Event } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/http-api/event-factory-v1.js'

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/**
 * Build a plausible Hapi request object with sensible defaults that any test
 * can override via the `overrides` map.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function makeRequest(overrides = {}) {
  return {
    method: 'GET',
    path: '/users/42',
    url: new URL('http://localhost:3000/users/42'),
    headers: {
      'content-type': 'application/json',
      'user-agent': 'curl/8.x',
      host: 'localhost:3000',
    },
    payload: undefined,
    params: {},
    info: {
      remoteAddress: '127.0.0.1',
    },
    ...overrides,
  }
}

/**
 * Default route descriptor for most tests.
 *
 * @type {{ method: string, path: string, functionName: string }}
 */
const defaultRoute = {
  method: 'GET',
  path: '/users/{id}',
  functionName: 'getUser',
}

/**
 * Invoke buildHttpApiV1Event with safe defaults so individual tests can
 * concentrate on the field they care about.
 *
 * @param {object} [requestOverrides]
 * @param {object} [opts]
 * @returns {object}
 */
function build(requestOverrides = {}, opts = {}) {
  return buildHttpApiV1Event({
    request: makeRequest(requestOverrides),
    route: defaultRoute,
    accountId: '000000000000',
    domainName: 'localhost:3000',
    ...opts,
  })
}

// ---------------------------------------------------------------------------
// Core shape
// ---------------------------------------------------------------------------

it('reports version "1.0"', () => {
  expect(build().version).toBe('1.0')
})

it('carries the v1 proxy fields (httpMethod, multiValue maps, resource)', () => {
  const event = build({ method: 'POST' })
  expect(event.httpMethod).toBe('POST')
  expect(event).toHaveProperty('multiValueHeaders')
  expect(event).toHaveProperty('multiValueQueryStringParameters')
  expect(event.resource).toBe('/users/{id}')
})

it('reports stage "$default" in requestContext', () => {
  expect(build().requestContext.stage).toBe('$default')
})

it('uses the flat REST-style requestContext fields (no http block)', () => {
  const event = build({ method: 'GET' })
  const ctx = event.requestContext
  expect(ctx.http).toBeUndefined()
  expect(ctx.httpMethod).toBe('GET')
  expect(ctx.path).toBe('/users/42')
  expect(ctx.protocol).toBe('HTTP/1.1')
  expect(ctx.resourcePath).toBe('/users/{id}')
  expect(ctx.resourceId).toBe('offline')
})

it('preserves a trailing slash and percent-encoding in path / requestContext.path from the wire path', () => {
  // AWS API Gateway HTTP API delivers the path verbatim — a trailing slash is
  // preserved and percent-encoding is not decoded. The app server strips the
  // trailing slash for slash-insensitive route matching and Hapi decodes
  // request.path, so the raw path must come from the original wire path.
  const slashEvent = build({
    path: '/items',
    url: new URL('http://localhost:3000/items/'),
    raw: { req: { url: '/items/' } },
  })
  expect(slashEvent.path).toBe('/items/')
  expect(slashEvent.requestContext.path).toBe('/items/')

  const encodedEvent = build({
    path: '/a/b',
    url: new URL('http://localhost:3000/a%2Fb'),
    raw: { req: { url: '/a%2Fb' } },
  })
  expect(encodedEvent.path).toBe('/a%2Fb')
  expect(encodedEvent.requestContext.path).toBe('/a%2Fb')
})

it('reports apiId, domainName and domainPrefix in requestContext', () => {
  const ctx = build().requestContext
  expect(ctx.apiId).toBe('offline')
  expect(ctx.domainName).toBe('localhost:3000')
  expect(ctx.domainPrefix).toBe('offline')
})

it('carries the full REST v1 identity object with null fallbacks', () => {
  const id = build().requestContext.identity
  expect(id.sourceIp).toBe('127.0.0.1')
  expect(id.userAgent).toBe('curl/8.x')
  expect(id.accessKey).toBeNull()
  expect(id.accountId).toBeNull()
  expect(id.caller).toBeNull()
  expect(id.cognitoAuthenticationProvider).toBeNull()
  expect(id.cognitoAuthenticationType).toBeNull()
  expect(id.cognitoIdentityId).toBeNull()
  expect(id.cognitoIdentityPoolId).toBeNull()
  expect(id.principalOrgId).toBeNull()
  expect(id.user).toBeNull()
  expect(id.userArn).toBeNull()
})

it('reports requestTime as a CLF string and requestTimeEpoch as ms epoch', () => {
  const event = build({}, {})
  const ctx = buildHttpApiV1Event({
    request: makeRequest({ info: { remoteAddress: '127.0.0.1', received: 0 } }),
    route: defaultRoute,
    accountId: '000000000000',
    domainName: 'localhost:3000',
  }).requestContext
  expect(event.requestContext.time).toBeUndefined()
  expect(event.requestContext.timeEpoch).toBeUndefined()
  expect(ctx.requestTimeEpoch).toBe(0)
  expect(ctx.requestTime).toBe('01/Jan/1970:00:00:00 +0000')
})

it('synthesizes a distinct extendedRequestId and requestId (both UUID v4)', () => {
  const ctx = build().requestContext
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  expect(ctx.requestId).toMatch(uuid)
  expect(ctx.extendedRequestId).toMatch(uuid)
  expect(ctx.extendedRequestId).not.toBe(ctx.requestId)
})

it('binds Hapi path parameters into pathParameters', () => {
  const event = build({ params: { id: '42' } })
  expect(event.pathParameters).toEqual({ id: '42' })
})

it('reports routeKey as METHOD + space + APIGW path', () => {
  const event = buildHttpApiV1Event({
    request: makeRequest({ method: 'POST' }),
    route: { method: 'POST', path: '/users/{id}', functionName: 'createUser' },
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.routeKey).toBe('POST /users/{id}')
})

// ---------------------------------------------------------------------------
// Header casing — HTTP APIs (1.0 and 2.0) lowercase all header names
// ---------------------------------------------------------------------------

it('lowercases mixed-case raw header names in headers and multiValueHeaders', () => {
  const event = build({
    raw: {
      req: {
        rawHeaders: [
          'Content-Type',
          'application/json',
          'X-Custom-Header',
          'one',
          'X-Custom-Header',
          'two',
          'Cookie',
          'a=1',
        ],
      },
    },
  })
  expect(event.headers).toHaveProperty('content-type', 'application/json')
  expect(event.headers).toHaveProperty('x-custom-header', 'one,two')
  expect(event.headers).not.toHaveProperty('X-Custom-Header')
  expect(event.multiValueHeaders).toHaveProperty('x-custom-header', [
    'one',
    'two',
  ])
  // 1.0 has no separate cookies field: cookie stays in the header maps, lowercased.
  expect(event.headers).toHaveProperty('cookie', 'a=1')
  expect(event.multiValueHeaders).toHaveProperty('cookie', ['a=1'])
  expect(event).not.toHaveProperty('cookies')
})

it('injects content-length/content-type defaults using lowercase keys', () => {
  const event = build({
    method: 'POST',
    payload: Buffer.from('hi', 'utf8'),
    headers: {},
    raw: { req: { rawHeaders: [] } },
  })
  expect(event.headers['content-length']).toBe('2')
  expect(event.headers['content-type']).toBe('application/json')
  expect(event.headers).not.toHaveProperty('Content-Length')
  expect(event.headers).not.toHaveProperty('Content-Type')
  expect(event.multiValueHeaders['content-length']).toEqual(['2'])
  expect(event.multiValueHeaders['content-type']).toEqual(['application/json'])
})

// ---------------------------------------------------------------------------
// Body handling
// ---------------------------------------------------------------------------

it('passes a non-canonical JSON body through byte-for-byte', () => {
  const payload = '{ "a":  1 ,  "b": 2 }'
  const event = build({
    method: 'POST',
    payload: Buffer.from(payload, 'utf8'),
    headers: { 'content-type': 'application/json' },
  })
  expect(event.isBase64Encoded).toBe(false)
  expect(event.body).toBe(payload)
})

it('base64-encodes binary content types', () => {
  const bytes = Buffer.from([0x01, 0x02, 0x03, 0xff, 0x00])
  const event = build({
    method: 'POST',
    payload: bytes,
    headers: { 'content-type': 'application/octet-stream' },
  })
  expect(event.isBase64Encoded).toBe(true)
  expect(Buffer.from(event.body, 'base64')).toEqual(bytes)
})

it('emits body:null when no body was sent', () => {
  const event = build({ payload: undefined })
  expect(event.body).toBeNull()
  expect(event.isBase64Encoded).toBe(false)
})

// ---------------------------------------------------------------------------
// Catch-all route
// ---------------------------------------------------------------------------

it('reports routeKey $default and null pathParameters for the catch-all route', () => {
  const event = buildHttpApiV1Event({
    request: makeRequest({ params: { proxy: 'anything/here' } }),
    route: {
      method: 'GET',
      path: '*',
      functionName: 'catchAll',
      isDefault: true,
    },
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.routeKey).toBe('$default')
  expect(event.pathParameters).toBeNull()
})

// ---------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------

it('returns null query maps when there is no query string', () => {
  const event = build()
  expect(event.queryStringParameters).toBeNull()
  expect(event.multiValueQueryStringParameters).toBeNull()
})

it('keeps the last single value and all multi values per query key', () => {
  const event = build({
    url: new URL('http://localhost:3000/users/42?t=a&t=b&page=2'),
  })
  expect(event.queryStringParameters).toEqual({ t: 'b', page: '2' })
  expect(event.multiValueQueryStringParameters).toEqual({
    t: ['a', 'b'],
    page: ['2'],
  })
})

// ---------------------------------------------------------------------------
// requestContext.authorizer
// ---------------------------------------------------------------------------

describe('buildHttpApiV1Event — requestContext.authorizer', () => {
  afterEach(() => {
    delete process.env.AUTHORIZER
  })

  it('omits authorizer when no credentials', () => {
    const event = build({ auth: { credentials: {} } })
    expect(event.requestContext.authorizer).toBeUndefined()
  })

  it('surfaces credentials.authorizer verbatim (built-in scheme)', () => {
    const event = build({
      auth: { credentials: { authorizer: { principalId: 'u-1', a: 'b' } } },
    })
    expect(event.requestContext.authorizer).toEqual({
      principalId: 'u-1',
      a: 'b',
    })
  })

  it('maps plugin-shape credentials { principalId, context } (context spread + principalId)', () => {
    const event = build({
      auth: {
        credentials: {
          principalId: 'user-123',
          context: { source: 'custom-provider', count: 7 },
        },
      },
    })
    expect(event.requestContext.authorizer).toEqual({
      source: 'custom-provider',
      count: 7,
      principalId: 'user-123',
    })
  })

  it('plugin-shape principalId falls back to the placeholder when absent', () => {
    const event = build({
      auth: { credentials: { context: { a: 1 } } },
    })
    expect(event.requestContext.authorizer).toEqual({
      a: 1,
      principalId: 'offlineContext_authorizer_principalId',
    })
  })
})
