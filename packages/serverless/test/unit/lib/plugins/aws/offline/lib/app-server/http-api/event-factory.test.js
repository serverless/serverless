import { buildHttpApiV2Event } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/http-api/event-factory.js'

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
 * Invoke buildHttpApiV2Event with safe defaults so individual tests can
 * concentrate on the field they care about.
 *
 * @param {object} [requestOverrides]
 * @param {object} [opts]
 * @returns {object}
 */
function build(requestOverrides = {}, opts = {}) {
  return buildHttpApiV2Event({
    request: makeRequest(requestOverrides),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
    ...opts,
  })
}

// ---------------------------------------------------------------------------
// 1. version
// ---------------------------------------------------------------------------

it('1. version is always "2.0"', () => {
  expect(build().version).toBe('2.0')
})

// ---------------------------------------------------------------------------
// 2. routeKey
// ---------------------------------------------------------------------------

it('2. routeKey is method + space + original APIGW path with placeholders', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ method: 'POST' }),
    route: { method: 'POST', path: '/users/{id}', functionName: 'createUser' },
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.routeKey).toBe('POST /users/{id}')
})

// ---------------------------------------------------------------------------
// 3. rawPath
// ---------------------------------------------------------------------------

it('3. rawPath is the actual request path without query string', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      path: '/users/42',
      url: new URL('http://localhost:3000/users/42?foo=bar'),
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.rawPath).toBe('/users/42')
})

// ---------------------------------------------------------------------------
// 4. rawQueryString
// ---------------------------------------------------------------------------

it('4. rawQueryString reflects the request query', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      url: new URL('http://localhost:3000/users/42?foo=bar&baz=qux'),
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.rawQueryString).toBe('foo=bar&baz=qux')
})

it('4b. rawQueryString is empty string when no query', () => {
  expect(build().rawQueryString).toBe('')
})

// ---------------------------------------------------------------------------
// 5. queryStringParameters is null when no query (matches AWS API Gateway)
// ---------------------------------------------------------------------------

it('5. queryStringParameters is null when the request has no query string', () => {
  const event = build()
  expect(event).toHaveProperty('queryStringParameters')
  expect(event.queryStringParameters).toBeNull()
})

// ---------------------------------------------------------------------------
// 6. queryStringParameters present when there IS a query
// ---------------------------------------------------------------------------

it('6. queryStringParameters field is PRESENT when there is a query', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      url: new URL('http://localhost:3000/users/42?foo=bar'),
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event).toHaveProperty('queryStringParameters')
  expect(event.queryStringParameters).not.toBeUndefined()
})

// ---------------------------------------------------------------------------
// 7. Multi-value query — values joined by ','
// ---------------------------------------------------------------------------

it('7. multi-value query: ?id=1&id=2 → queryStringParameters.id === "1,2"', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      url: new URL('http://localhost:3000/users?id=1&id=2'),
    }),
    route: { method: 'GET', path: '/users', functionName: 'listUsers' },
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.queryStringParameters.id).toBe('1,2')
})

// ---------------------------------------------------------------------------
// 8. cookies field
// ---------------------------------------------------------------------------

it('8a. cookies field is OMITTED when no cookie header', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { 'content-type': 'application/json' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event).not.toHaveProperty('cookies')
})

it('8b. cookies field is an array when cookie header is set', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { cookie: 'k=v; a=b' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(Array.isArray(event.cookies)).toBe(true)
})

// ---------------------------------------------------------------------------
// 9. cookies values
// ---------------------------------------------------------------------------

it('9. cookies: ["k=v", "a=b"] for cookie: "k=v; a=b"', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { cookie: 'k=v; a=b' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.cookies).toEqual(['k=v', 'a=b'])
})

it('9b. cookies are read from request.state when populated, preserving values verbatim', () => {
  // Hapi parses the Cookie header into request.state and decodes URL-encoded
  // values. The event factory should produce `name=value` strings from that
  // map.
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { cookie: 'session=abc; lang=en-US' },
      state: { session: 'abc', lang: 'en-US' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.cookies).toEqual(['session=abc', 'lang=en-US'])
})

it('9c. cookies handles a duplicate cookie name as multiple entries', () => {
  // When a client sends two cookies with the same name (e.g. duplicate
  // Set-Cookie roundtrips), Hapi surfaces the value as an array. The event
  // factory should emit one `name=value` entry per array element.
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { cookie: 'theme=light; theme=dark' },
      state: { theme: ['light', 'dark'] },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.cookies).toEqual(['theme=light', 'theme=dark'])
})

it('9d. cookies preserves percent-decoded values from request.state', () => {
  // Hapi URL-decodes the cookie value when parsing. The event factory should
  // pass the decoded value through; handlers see what Hapi handed back.
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { cookie: 'q=hello%20world' },
      state: { q: 'hello world' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.cookies).toEqual(['q=hello world'])
})

// ---------------------------------------------------------------------------
// 10. headers — lower-cased keys, cookie excluded
// ---------------------------------------------------------------------------

it('10a. headers keys are all lower-cased', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  const keys = Object.keys(event.headers)
  for (const key of keys) {
    expect(key).toBe(key.toLowerCase())
  }
})

it('10b. cookie header is excluded from headers', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { cookie: 'k=v', 'content-type': 'application/json' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.headers).not.toHaveProperty('cookie')
  expect(event.headers).toHaveProperty('content-type')
})

// ---------------------------------------------------------------------------
// 10c–10e. headers from raw socket array (request.raw.req.rawHeaders)
// ---------------------------------------------------------------------------

it('10c. when request.raw.req.rawHeaders is set, headers come from the raw array (not Hapi-collapsed)', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      // request.headers (Hapi collapsed) — incomplete on purpose
      headers: { 'x-forwarded-for': '10.0.0.1' },
      raw: {
        req: {
          rawHeaders: [
            'X-Forwarded-For',
            '10.0.0.1',
            'X-Forwarded-For',
            '10.0.0.2',
            'Host',
            'example.com',
          ],
        },
      },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  // Multi-value joined with comma; both entries preserved from rawHeaders.
  expect(event.headers['x-forwarded-for']).toBe('10.0.0.1,10.0.0.2')
  expect(event.headers['host']).toBe('example.com')
})

it('10d. raw headers path lower-cases header names', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      raw: {
        req: {
          rawHeaders: [
            'Content-Type',
            'application/json',
            'X-Custom-Id',
            'abc',
          ],
        },
      },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.headers['content-type']).toBe('application/json')
  expect(event.headers['x-custom-id']).toBe('abc')
  expect(event.headers).not.toHaveProperty('Content-Type')
})

it('10e. raw headers path excludes the cookie header', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      raw: {
        req: {
          rawHeaders: ['Cookie', 'k=v', 'Content-Type', 'text/plain'],
        },
      },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.headers).not.toHaveProperty('cookie')
  expect(event.headers['content-type']).toBe('text/plain')
})

// ---------------------------------------------------------------------------
// 11. Multi-value headers joined by ','
// ---------------------------------------------------------------------------

it('11. multi-value headers joined by ","', () => {
  // Hapi represents multi-value headers as arrays; we simulate that here.
  const event = buildHttpApiV2Event({
    request: makeRequest({
      headers: { accept: ['text/html', 'application/json'] },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.headers['accept']).toBe('text/html,application/json')
})

// ---------------------------------------------------------------------------
// 12. pathParameters omitted / present
// ---------------------------------------------------------------------------

it('12. pathParameters is null when the route has no placeholders', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ params: {} }),
    route: { method: 'GET', path: '/health', functionName: 'healthCheck' },
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event).toHaveProperty('pathParameters')
  expect(event.pathParameters).toBeNull()
})

it('12b. pathParameters is present when the route has placeholders', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ params: { id: '42' } }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event).toHaveProperty('pathParameters')
})

// ---------------------------------------------------------------------------
// 13. pathParameters values
// ---------------------------------------------------------------------------

it('13. pathParameters: { id: "42" } for route.path /users/{id} with params { id: "42" }', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ params: { id: '42' } }),
    route: { method: 'GET', path: '/users/{id}', functionName: 'getUser' },
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.pathParameters).toEqual({ id: '42' })
})

// ---------------------------------------------------------------------------
// 14. requestContext.stage
// ---------------------------------------------------------------------------

it('14. requestContext.stage matches the stage argument', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest(),
    route: defaultRoute,
    stage: 'production',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.stage).toBe('production')
})

// ---------------------------------------------------------------------------
// 15. requestContext.domainName
// ---------------------------------------------------------------------------

it('15. requestContext.domainName is the explicit domainName argument', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest(),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.domainName).toBe('localhost:3000')
})

// ---------------------------------------------------------------------------
// 16. requestContext.http.method
// ---------------------------------------------------------------------------

it('16. requestContext.http.method matches request method (uppercase)', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ method: 'post' }),
    route: { method: 'POST', path: '/users', functionName: 'createUser' },
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.http.method).toBe('POST')
})

// ---------------------------------------------------------------------------
// 17. requestContext.http.path
// ---------------------------------------------------------------------------

it('17. requestContext.http.path matches rawPath', () => {
  const event = build()
  expect(event.requestContext.http.path).toBe(event.rawPath)
})

// ---------------------------------------------------------------------------
// 18. requestContext.http.protocol
// ---------------------------------------------------------------------------

it('18. requestContext.http.protocol is "HTTP/1.1"', () => {
  expect(build().requestContext.http.protocol).toBe('HTTP/1.1')
})

// ---------------------------------------------------------------------------
// 19. requestContext.http.sourceIp
// ---------------------------------------------------------------------------

it('19a. requestContext.http.sourceIp from request.info.remoteAddress', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ info: { remoteAddress: '10.0.0.1' } }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.http.sourceIp).toBe('10.0.0.1')
})

it('19b. requestContext.http.sourceIp falls back to "127.0.0.1" when remoteAddress absent', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ info: {} }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.http.sourceIp).toBe('127.0.0.1')
})

// ---------------------------------------------------------------------------
// 20. requestContext.http.userAgent
// ---------------------------------------------------------------------------

it('20a. requestContext.http.userAgent from request.headers["user-agent"]', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ headers: { 'user-agent': 'TestAgent/1.0' } }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.http.userAgent).toBe('TestAgent/1.0')
})

it('20b. requestContext.http.userAgent falls back to "" when header absent', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ headers: { 'content-type': 'application/json' } }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.http.userAgent).toBe('')
})

// ---------------------------------------------------------------------------
// 21. requestContext.requestId is a UUID v4
// ---------------------------------------------------------------------------

it('21. requestContext.requestId is a UUID v4 string', () => {
  const event = build()
  expect(event.requestContext.requestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
})

// ---------------------------------------------------------------------------
// 22. requestContext.routeKey matches top-level routeKey
// ---------------------------------------------------------------------------

it('22. requestContext.routeKey matches top-level routeKey', () => {
  const event = build()
  expect(event.requestContext.routeKey).toBe(event.routeKey)
})

// ---------------------------------------------------------------------------
// 23. requestContext.time format
// ---------------------------------------------------------------------------

it('23. requestContext.time matches the expected strftime format dd/Mon/YYYY:HH:MM:SS +0000', () => {
  const event = build()
  expect(event.requestContext.time).toMatch(
    /^\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000$/,
  )
})

// ---------------------------------------------------------------------------
// 24. requestContext.timeEpoch
// ---------------------------------------------------------------------------

it('24. requestContext.timeEpoch is a number roughly equal to Date.now()', () => {
  const before = Date.now()
  const event = build()
  const after = Date.now()
  expect(typeof event.requestContext.timeEpoch).toBe('number')
  expect(event.requestContext.timeEpoch).toBeGreaterThanOrEqual(before)
  expect(event.requestContext.timeEpoch).toBeLessThanOrEqual(after + 100)
})

// ---------------------------------------------------------------------------
// 24b. timeEpoch reflects request-received time, not event-build time
// ---------------------------------------------------------------------------

it('24b. requestContext.timeEpoch is taken from request.info.received when set', () => {
  // Real Lambda timestamps the event at the request-received moment (the time
  // the HTTP framework picked up the first byte from the socket), not at the
  // moment the event JSON was built. Hapi exposes this as `request.info.received`.
  const receivedMs = 1_700_000_000_000
  const event = buildHttpApiV2Event({
    request: makeRequest({
      info: { remoteAddress: '127.0.0.1', received: receivedMs },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.timeEpoch).toBe(receivedMs)
  // The strftime-formatted `time` should also reflect that moment.
  // 1700000000000 ms = 2023-11-14T22:13:20.000Z → 14/Nov/2023:22:13:20 +0000
  expect(event.requestContext.time).toBe('14/Nov/2023:22:13:20 +0000')
})

// ---------------------------------------------------------------------------
// 25. body — string form for non-binary
// ---------------------------------------------------------------------------

it('25. body is the string form of request.payload for non-binary content types', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      payload: '{"hello":"world"}',
      headers: { 'content-type': 'application/json' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.body).toBe('{"hello":"world"}')
})

// ---------------------------------------------------------------------------
// 26. isBase64Encoded: false for non-binary
// ---------------------------------------------------------------------------

it('26. isBase64Encoded is false for non-binary content types', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      payload: 'hello',
      headers: { 'content-type': 'text/plain' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.isBase64Encoded).toBe(false)
})

// ---------------------------------------------------------------------------
// 27. isBase64Encoded: true + base64 body for binary content types
// ---------------------------------------------------------------------------

it('27a. image/png is NOT binary — body is a UTF-8 string, isBase64Encoded false', () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const event = buildHttpApiV2Event({
    request: makeRequest({
      payload: buf,
      headers: { 'content-type': 'image/png' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.isBase64Encoded).toBe(false)
  expect(typeof event.body).toBe('string')
})

it('27b. isBase64Encoded true + base64 body for application/octet-stream', () => {
  const buf = Buffer.from([0x00, 0x01, 0x02])
  const event = buildHttpApiV2Event({
    request: makeRequest({
      payload: buf,
      headers: { 'content-type': 'application/octet-stream' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.isBase64Encoded).toBe(true)
  expect(event.body).toBe(buf.toString('base64'))
})

it('27c. application/pdf is NOT binary — body is a UTF-8 string, isBase64Encoded false', () => {
  const buf = Buffer.from('%PDF-1.4')
  const event = buildHttpApiV2Event({
    request: makeRequest({
      payload: buf,
      headers: { 'content-type': 'application/pdf' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.isBase64Encoded).toBe(false)
  expect(typeof event.body).toBe('string')
})

it('27d. application/zip is NOT binary — body is a UTF-8 string, isBase64Encoded false', () => {
  const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  const event = buildHttpApiV2Event({
    request: makeRequest({
      payload: buf,
      headers: { 'content-type': 'application/zip' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.isBase64Encoded).toBe(false)
  expect(typeof event.body).toBe('string')
})

it('27e. multipart/form-data (with boundary) IS binary — isBase64Encoded true + base64 body', () => {
  const buf = Buffer.from(
    '--boundary\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n--boundary--',
  )
  const event = buildHttpApiV2Event({
    request: makeRequest({
      payload: buf,
      headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.isBase64Encoded).toBe(true)
  expect(event.body).toBe(buf.toString('base64'))
})

// ---------------------------------------------------------------------------
// 28. body: null and isBase64Encoded: false when payload is undefined
// ---------------------------------------------------------------------------

it('28. body is null and isBase64Encoded is false when payload is undefined', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({ payload: undefined }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.body).toBeNull()
  expect(event.isBase64Encoded).toBe(false)
})

// ---------------------------------------------------------------------------
// 28b. body is null when payload is an empty string (matches AWS)
// ---------------------------------------------------------------------------

it('28b. body is null when payload is the empty string', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest({
      method: 'POST',
      payload: '',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'TestAgent/1.0',
      },
    }),
    route: defaultRoute,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.body).toBeNull()
  expect(event.isBase64Encoded).toBe(false)
})

// ---------------------------------------------------------------------------
// 29. stageVariables is always present as null
// ---------------------------------------------------------------------------

it('29. stageVariables is always present and null', () => {
  const event = build()
  expect(event).toHaveProperty('stageVariables')
  expect(event.stageVariables).toBeNull()
})

// ---------------------------------------------------------------------------
// 30. requestContext.operationName
// ---------------------------------------------------------------------------

it('30a. requestContext.operationName is absent when the route does not declare one', () => {
  const event = build()
  expect(event.requestContext).not.toHaveProperty('operationName')
})

it('30b. requestContext.operationName reflects the value declared on the route', () => {
  const event = buildHttpApiV2Event({
    request: makeRequest(),
    route: { ...defaultRoute, operationName: 'GetUserById' },
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'localhost:3000',
  })
  expect(event.requestContext.operationName).toBe('GetUserById')
})
