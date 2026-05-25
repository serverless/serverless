/**
 * Corpus tests for the HTTP API v2 event factory.
 *
 * Pinned input → expected output checks across every field of the AWS API
 * Gateway HTTP API payload format 2.0 shape. The unit tests in
 * `event-factory.test.js` cover field-by-field behavior; this file covers
 * fully-formed events end-to-end so the JSON shape handlers actually receive
 * is locked against the AWS specification.
 *
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.proxy-format
 */

import { describe, it, expect } from '@jest/globals'
import { buildHttpApiV2Event } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/http-api/event-factory.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a plausible Hapi request object with the fields the event factory
 * reads, overridable per case.
 */
function makeRequest(overrides = {}) {
  const url = overrides.url ?? new URL('http://localhost:3000/items')
  return {
    method: 'GET',
    path: url.pathname,
    url,
    headers: {
      'user-agent': 'TestAgent/1.0',
      host: 'localhost:3000',
    },
    payload: undefined,
    params: {},
    info: { remoteAddress: '127.0.0.1' },
    ...overrides,
  }
}

/**
 * Default arguments passed to the factory; individual cases override.
 */
function build(opts = {}) {
  const {
    request = makeRequest(),
    route = { method: 'GET', path: '/items', functionName: 'listItems' },
    stage = 'dev',
    domainName = 'localhost:3000',
    accountId = '000000000000',
  } = opts
  return buildHttpApiV2Event({ request, route, stage, domainName, accountId })
}

// ---------------------------------------------------------------------------
// Skeleton — every event has these fields
// ---------------------------------------------------------------------------

describe('HTTP API v2 event skeleton', () => {
  it('contains every top-level field defined by the v2 payload format', () => {
    const event = build()
    const required = [
      'version',
      'routeKey',
      'rawPath',
      'rawQueryString',
      'headers',
      'queryStringParameters',
      'pathParameters',
      'requestContext',
      'stageVariables',
      'body',
      'isBase64Encoded',
    ]
    for (const field of required) {
      expect(event).toHaveProperty(field)
    }
  })

  it('requestContext contains every nested field defined by the v2 payload format', () => {
    const event = build()
    const required = [
      'accountId',
      'apiId',
      'domainName',
      'domainPrefix',
      'http',
      'requestId',
      'routeKey',
      'stage',
      'time',
      'timeEpoch',
    ]
    for (const field of required) {
      expect(event.requestContext).toHaveProperty(field)
    }
    const httpRequired = ['method', 'path', 'protocol', 'sourceIp', 'userAgent']
    for (const field of httpRequired) {
      expect(event.requestContext.http).toHaveProperty(field)
    }
  })
})

// ---------------------------------------------------------------------------
// Path parameters
// ---------------------------------------------------------------------------

describe('pathParameters', () => {
  it('is null when the route has no placeholders', () => {
    expect(build().pathParameters).toBeNull()
  })

  it('exposes a single placeholder value', () => {
    const event = build({
      request: makeRequest({
        url: new URL('http://localhost:3000/users/42'),
        params: { id: '42' },
      }),
      route: { method: 'GET', path: '/users/{id}', functionName: 'getUser' },
    })
    expect(event.pathParameters).toEqual({ id: '42' })
  })

  it('exposes multiple placeholder values', () => {
    const event = build({
      request: makeRequest({
        url: new URL('http://localhost:3000/orgs/serverless/users/42'),
        params: { org: 'serverless', id: '42' },
      }),
      route: {
        method: 'GET',
        path: '/orgs/{org}/users/{id}',
        functionName: 'getUserInOrg',
      },
    })
    expect(event.pathParameters).toEqual({ org: 'serverless', id: '42' })
  })
})

// ---------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------

describe('queryStringParameters and rawQueryString', () => {
  it('returns null and empty rawQueryString when the request has no query', () => {
    const event = build()
    expect(event.queryStringParameters).toBeNull()
    expect(event.rawQueryString).toBe('')
  })

  it('joins multi-value parameters with a comma', () => {
    const event = build({
      request: makeRequest({
        url: new URL('http://localhost:3000/items?tag=a&tag=b&tag=c'),
      }),
    })
    expect(event.queryStringParameters).toEqual({ tag: 'a,b,c' })
  })

  it('preserves the ordering of distinct keys', () => {
    const event = build({
      request: makeRequest({
        url: new URL('http://localhost:3000/items?limit=10&offset=20&q=hi'),
      }),
    })
    expect(event.queryStringParameters).toEqual({
      limit: '10',
      offset: '20',
      q: 'hi',
    })
  })

  it('rawQueryString re-encodes via URLSearchParams (no leading "?")', () => {
    const event = build({
      request: makeRequest({
        url: new URL('http://localhost:3000/items?q=hello%20world'),
      }),
    })
    expect(event.rawQueryString.startsWith('?')).toBe(false)
    expect(event.rawQueryString).toBe('q=hello+world')
  })
})

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

describe('headers', () => {
  it('lower-cases all header names', () => {
    const event = build({
      request: makeRequest({
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'abc-123',
        },
      }),
    })
    expect(Object.keys(event.headers).sort()).toEqual(
      Object.keys(event.headers)
        .map((k) => k.toLowerCase())
        .sort(),
    )
    expect(event.headers['content-type']).toBe('application/json')
    expect(event.headers['x-request-id']).toBe('abc-123')
  })

  it('joins multi-value headers with a comma', () => {
    const event = build({
      request: makeRequest({
        headers: { accept: ['text/html', 'application/json'] },
      }),
    })
    expect(event.headers.accept).toBe('text/html,application/json')
  })

  it('excludes the cookie header from headers', () => {
    const event = build({
      request: makeRequest({
        headers: { cookie: 'k=v; a=b', 'content-type': 'text/plain' },
      }),
    })
    expect(event.headers).not.toHaveProperty('cookie')
    expect(event.headers['content-type']).toBe('text/plain')
  })
})

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

describe('cookies', () => {
  it('is absent from the event when the request had no cookie header', () => {
    const event = build({
      request: makeRequest({ headers: { 'content-type': 'text/plain' } }),
    })
    expect(event).not.toHaveProperty('cookies')
  })

  it('is an array with one entry per cookie split on "; "', () => {
    const event = build({
      request: makeRequest({
        headers: { cookie: 'session=abc; csrf=xyz; lang=en' },
      }),
    })
    expect(event.cookies).toEqual(['session=abc', 'csrf=xyz', 'lang=en'])
  })
})

// ---------------------------------------------------------------------------
// Body and isBase64Encoded
// ---------------------------------------------------------------------------

describe('body and isBase64Encoded', () => {
  it('emits body:null + isBase64Encoded:false when the request has no payload', () => {
    const event = build()
    expect(event.body).toBeNull()
    expect(event.isBase64Encoded).toBe(false)
  })

  it('passes a JSON string body through verbatim', () => {
    const event = build({
      request: makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'TestAgent/1.0',
        },
        payload: '{"hello":"world"}',
      }),
    })
    expect(event.body).toBe('{"hello":"world"}')
    expect(event.isBase64Encoded).toBe(false)
  })

  it('base64-encodes application/octet-stream payloads', () => {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef])
    const event = build({
      request: makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'user-agent': 'TestAgent/1.0',
        },
        payload: bytes,
      }),
    })
    expect(event.isBase64Encoded).toBe(true)
    expect(event.body).toBe(bytes.toString('base64'))
  })

  it('base64-encodes multipart/form-data payloads', () => {
    const payload = Buffer.from(
      '--bnd\r\nContent-Disposition: form-data; name="x"\r\n\r\n1\r\n--bnd--',
    )
    const event = build({
      request: makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data; boundary=bnd',
          'user-agent': 'TestAgent/1.0',
        },
        payload,
      }),
    })
    expect(event.isBase64Encoded).toBe(true)
    expect(event.body).toBe(payload.toString('base64'))
  })

  it('does NOT base64-encode image/* payloads (passed as utf-8 string)', () => {
    const event = build({
      request: makeRequest({
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'user-agent': 'TestAgent/1.0',
        },
        payload: 'binary-bytes-as-string',
      }),
    })
    expect(event.isBase64Encoded).toBe(false)
    expect(event.body).toBe('binary-bytes-as-string')
  })
})

// ---------------------------------------------------------------------------
// requestContext
// ---------------------------------------------------------------------------

describe('requestContext', () => {
  it('http.method mirrors request.method in uppercase', () => {
    const event = build({
      request: makeRequest({ method: 'post' }),
      route: { method: 'POST', path: '/items', functionName: 'createItem' },
    })
    expect(event.requestContext.http.method).toBe('POST')
  })

  it('http.path mirrors rawPath', () => {
    const event = build({
      request: makeRequest({ url: new URL('http://localhost:3000/users/42') }),
    })
    expect(event.requestContext.http.path).toBe('/users/42')
    expect(event.rawPath).toBe('/users/42')
  })

  it('http.userAgent reflects the user-agent request header', () => {
    const event = build({
      request: makeRequest({
        headers: { 'user-agent': 'Mozilla/5.0 (X11)' },
      }),
    })
    expect(event.requestContext.http.userAgent).toBe('Mozilla/5.0 (X11)')
  })

  it('http.userAgent falls back to "" when the request omits the header', () => {
    const event = build({
      request: makeRequest({
        headers: { 'content-type': 'text/plain' },
      }),
    })
    expect(event.requestContext.http.userAgent).toBe('')
  })

  it('http.sourceIp uses request.info.remoteAddress', () => {
    const event = build({
      request: makeRequest({ info: { remoteAddress: '10.0.0.42' } }),
    })
    expect(event.requestContext.http.sourceIp).toBe('10.0.0.42')
  })

  it('http.sourceIp falls back to 127.0.0.1 when remoteAddress is missing', () => {
    const event = build({ request: makeRequest({ info: undefined }) })
    expect(event.requestContext.http.sourceIp).toBe('127.0.0.1')
  })

  it('requestId is a unique UUID per invocation', () => {
    const a = build().requestContext.requestId
    const b = build().requestContext.requestId
    expect(a).not.toBe(b)
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('stage matches the value passed to the factory', () => {
    const event = build({ stage: 'prod' })
    expect(event.requestContext.stage).toBe('prod')
  })

  it('domainName matches the value passed to the factory', () => {
    const event = build({ domainName: 'api.example.com' })
    expect(event.requestContext.domainName).toBe('api.example.com')
  })

  it('time is a strftime-formatted UTC string and timeEpoch is its ms value', () => {
    const event = build()
    expect(event.requestContext.time).toMatch(
      /^\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000$/,
    )
    expect(typeof event.requestContext.timeEpoch).toBe('number')
    expect(event.requestContext.timeEpoch).toBeGreaterThan(0)
  })

  it('operationName is absent when the route does not declare one', () => {
    expect(build().requestContext).not.toHaveProperty('operationName')
  })

  it('operationName is set when the route declares one', () => {
    const event = build({
      route: {
        method: 'GET',
        path: '/items',
        functionName: 'listItems',
        operationName: 'ListItems',
      },
    })
    expect(event.requestContext.operationName).toBe('ListItems')
  })
})

// ---------------------------------------------------------------------------
// stageVariables and version
// ---------------------------------------------------------------------------

describe('stageVariables and version', () => {
  it('stageVariables is always present and null', () => {
    expect(build().stageVariables).toBeNull()
  })

  it('version is always exactly "2.0"', () => {
    expect(build().version).toBe('2.0')
  })
})

// ---------------------------------------------------------------------------
// routeKey
// ---------------------------------------------------------------------------

describe('routeKey', () => {
  it('uses the original AWS path template with placeholders, not the matched path', () => {
    const event = build({
      request: makeRequest({
        url: new URL('http://localhost:3000/users/42'),
        params: { id: '42' },
      }),
      route: { method: 'GET', path: '/users/{id}', functionName: 'getUser' },
    })
    expect(event.routeKey).toBe('GET /users/{id}')
    expect(event.requestContext.routeKey).toBe('GET /users/{id}')
  })

  it('uppercases the HTTP method', () => {
    const event = build({
      request: makeRequest({ method: 'patch' }),
      route: { method: 'PATCH', path: '/items', functionName: 'patchItem' },
    })
    expect(event.routeKey).toBe('PATCH /items')
  })
})
