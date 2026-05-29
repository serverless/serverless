import { buildRestApiEvent } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/event-factory.js'

function makeRequest(overrides = {}) {
  const url = overrides.url ?? new URL('http://localhost:3000/dev/users/42')
  return {
    method: 'GET',
    path: url.pathname,
    url,
    headers: {
      'user-agent': 'TestAgent/1.0',
      host: 'localhost:3000',
    },
    payload: undefined,
    params: { id: '42' },
    info: { remoteAddress: '127.0.0.1', received: 1_700_000_000_000 },
    raw: {
      req: {
        rawHeaders: ['User-Agent', 'TestAgent/1.0', 'Host', 'localhost:3000'],
      },
    },
    ...overrides,
  }
}

function build(overrides = {}) {
  return buildRestApiEvent({
    request: makeRequest(overrides.request),
    route: overrides.route ?? {
      method: 'GET',
      apigwPath: '/users/{id}',
      functionName: 'getUser',
    },
    stage: overrides.stage ?? 'dev',
    accountId: overrides.accountId ?? '000000000000',
  })
}

describe('REST API event skeleton', () => {
  it('contains every top-level field defined by the APIGW v1 proxy spec', () => {
    const event = build()
    const required = [
      'body',
      'headers',
      'httpMethod',
      'isBase64Encoded',
      'multiValueHeaders',
      'multiValueQueryStringParameters',
      'path',
      'pathParameters',
      'queryStringParameters',
      'requestContext',
      'resource',
      'stageVariables',
    ]
    for (const field of required) {
      expect(event).toHaveProperty(field)
    }
  })

  it('httpMethod is the uppercased request method', () => {
    expect(build({ request: { method: 'post' } }).httpMethod).toBe('POST')
  })

  it('path is the wire path including the stage prefix', () => {
    const event = build({
      request: { url: new URL('http://localhost:3000/dev/users/42') },
    })
    expect(event.path).toBe('/dev/users/42')
  })

  it('resource is the APIGW route template (placeholders intact)', () => {
    expect(build().resource).toBe('/users/{id}')
  })

  it('pathParameters reflects the matched placeholders', () => {
    expect(build().pathParameters).toEqual({ id: '42' })
  })

  it('pathParameters is null when the route has no placeholders', () => {
    const event = build({
      request: { params: {} },
      route: { method: 'GET', apigwPath: '/health', functionName: 'health' },
    })
    expect(event.pathParameters).toBeNull()
  })

  it('queryStringParameters is null when the request has no query', () => {
    expect(build().queryStringParameters).toBeNull()
  })

  it('queryStringParameters returns LAST value when a key repeats (matches APIGW v1)', () => {
    const event = build({
      request: {
        url: new URL('http://localhost:3000/dev/items?tag=a&tag=b'),
      },
    })
    expect(event.queryStringParameters).toEqual({ tag: 'b' })
  })

  it('multiValueQueryStringParameters keeps every occurrence as an array', () => {
    const event = build({
      request: {
        url: new URL('http://localhost:3000/dev/items?tag=a&tag=b&page=1'),
      },
    })
    expect(event.multiValueQueryStringParameters).toEqual({
      tag: ['a', 'b'],
      page: ['1'],
    })
  })

  it('multiValueQueryStringParameters is null when the request has no query', () => {
    expect(build().multiValueQueryStringParameters).toBeNull()
  })

  it('headers keep their wire casing and cookie is included (unlike v2)', () => {
    const event = build({
      request: {
        headers: { 'Content-Type': 'application/json', Cookie: 'k=v' },
        raw: {
          req: {
            rawHeaders: ['Content-Type', 'application/json', 'Cookie', 'k=v'],
          },
        },
      },
    })
    expect(event.headers['Content-Type']).toBe('application/json')
    expect(event.headers['Cookie']).toBe('k=v')
  })

  it('multiValueHeaders contains each header as an array', () => {
    const event = build({
      request: {
        headers: { 'x-trace': 'abc' },
        raw: {
          req: { rawHeaders: ['X-Trace', 'abc', 'X-Trace', 'def'] },
        },
      },
    })
    expect(event.multiValueHeaders['X-Trace']).toEqual(['abc', 'def'])
  })

  it('preserves the original wire casing of request header names (matches APIGW REST)', () => {
    const event = build({
      request: {
        headers: { 'content-type': 'application/json', 'x-custom-header': 'v' },
        raw: {
          req: {
            rawHeaders: [
              'Content-Type',
              'application/json',
              'X-Custom-Header',
              'v',
            ],
          },
        },
      },
    })
    expect(event.headers['Content-Type']).toBe('application/json')
    expect(event.headers['X-Custom-Header']).toBe('v')
    expect(event.multiValueHeaders['Content-Type']).toEqual([
      'application/json',
    ])
    expect(event.multiValueHeaders['X-Custom-Header']).toEqual(['v'])
  })

  it('body is null when no payload', () => {
    expect(build().body).toBeNull()
    expect(build().isBase64Encoded).toBe(false)
  })

  it('body is null for empty-string payload (matches APIGW)', () => {
    expect(
      build({
        request: {
          method: 'POST',
          payload: '',
          headers: { 'content-type': 'application/json' },
        },
      }).body,
    ).toBeNull()
  })

  it('body is the verbatim string for JSON payload', () => {
    expect(
      build({
        request: {
          method: 'POST',
          payload: '{"x":1}',
          headers: { 'content-type': 'application/json' },
        },
      }).body,
    ).toBe('{"x":1}')
  })

  it('body is base64-encoded for application/octet-stream', () => {
    const bytes = Buffer.from([1, 2, 3])
    const event = build({
      request: {
        method: 'POST',
        payload: bytes,
        headers: { 'content-type': 'application/octet-stream' },
      },
    })
    expect(event.isBase64Encoded).toBe(true)
    expect(event.body).toBe(bytes.toString('base64'))
  })

  it('stageVariables is always null', () => {
    expect(build().stageVariables).toBeNull()
  })
})

describe('REST API content-length / content-type injection', () => {
  it('injects content-type and content-length when a body is present and the client sent neither', () => {
    const payload = '{"hello":"world"}'
    const event = build({
      request: {
        method: 'POST',
        payload,
        headers: { 'user-agent': 'TestAgent/1.0', host: 'localhost:3000' },
        raw: {
          req: {
            rawHeaders: [
              'User-Agent',
              'TestAgent/1.0',
              'Host',
              'localhost:3000',
            ],
          },
        },
      },
    })
    expect(event.headers['Content-Type']).toBe('application/json')
    expect(event.headers['Content-Length']).toBe(
      String(Buffer.byteLength(payload)),
    )
    expect(event.multiValueHeaders['Content-Type']).toEqual([
      'application/json',
    ])
    expect(event.multiValueHeaders['Content-Length']).toEqual([
      String(Buffer.byteLength(payload)),
    ])
  })

  it('does not overwrite a client-sent content-type or content-length (any casing)', () => {
    const event = build({
      request: {
        method: 'POST',
        payload: 'a,b,c',
        headers: { 'content-type': 'text/csv', 'content-length': '999' },
        raw: {
          req: {
            rawHeaders: ['Content-Type', 'text/csv', 'Content-Length', '999'],
          },
        },
      },
    })
    expect(event.headers['Content-Type']).toBe('text/csv')
    expect(event.headers['Content-Length']).toBe('999')
    // No duplicate canonical default is injected alongside the client header —
    // the client's wire casing is the only content-type/length key present.
    const contentTypeKeys = Object.keys(event.headers).filter(
      (name) => name.toLowerCase() === 'content-type',
    )
    const contentLengthKeys = Object.keys(event.headers).filter(
      (name) => name.toLowerCase() === 'content-length',
    )
    expect(contentTypeKeys).toEqual(['Content-Type'])
    expect(contentLengthKeys).toEqual(['Content-Length'])
    expect(event.multiValueHeaders['Content-Type']).toEqual(['text/csv'])
    expect(event.multiValueHeaders['Content-Length']).toEqual(['999'])
  })

  it('content-length for a base64-encoded binary body is the decoded byte length', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])
    const event = build({
      request: {
        method: 'POST',
        payload: buf,
        headers: { 'content-type': 'application/octet-stream' },
        raw: {
          req: {
            rawHeaders: ['Content-Type', 'application/octet-stream'],
          },
        },
      },
    })
    expect(event.isBase64Encoded).toBe(true)
    expect(event.headers['Content-Length']).toBe(
      String(Buffer.byteLength(event.body, 'base64')),
    )
    expect(event.multiValueHeaders['Content-Length']).toEqual([
      String(Buffer.byteLength(event.body, 'base64')),
    ])
  })

  it('defaults content-type but injects no content-length when there is no body', () => {
    const event = build({
      request: {
        method: 'GET',
        payload: undefined,
        headers: { 'user-agent': 'TestAgent/1.0', host: 'localhost:3000' },
        raw: {
          req: {
            rawHeaders: [
              'User-Agent',
              'TestAgent/1.0',
              'Host',
              'localhost:3000',
            ],
          },
        },
      },
    })
    expect(event.headers['Content-Type']).toBe('application/json')
    expect(
      Object.keys(event.headers).some(
        (name) => name.toLowerCase() === 'content-length',
      ),
    ).toBe(false)
    expect(event.multiValueHeaders['Content-Type']).toEqual([
      'application/json',
    ])
    expect(
      Object.keys(event.multiValueHeaders).some(
        (name) => name.toLowerCase() === 'content-length',
      ),
    ).toBe(false)
  })
})

describe('REST API requestContext', () => {
  it('has every documented v1 field', () => {
    const event = build()
    const required = [
      'accountId',
      'apiId',
      'domainName',
      'domainPrefix',
      'extendedRequestId',
      'httpMethod',
      'identity',
      'path',
      'protocol',
      'requestId',
      'requestTime',
      'requestTimeEpoch',
      'resourceId',
      'resourcePath',
      'stage',
    ]
    for (const field of required) {
      expect(event.requestContext).toHaveProperty(field)
    }
  })

  it('httpMethod matches the top-level field', () => {
    const event = build({ request: { method: 'post' } })
    expect(event.requestContext.httpMethod).toBe('POST')
  })

  it('path mirrors the wire path with stage prefix', () => {
    const event = build({
      request: { url: new URL('http://localhost:3000/dev/users/42') },
    })
    expect(event.requestContext.path).toBe('/dev/users/42')
  })

  it('resourcePath is the APIGW route template', () => {
    expect(build().requestContext.resourcePath).toBe('/users/{id}')
  })

  it('stage matches the factory argument', () => {
    expect(build({ stage: 'prod' }).requestContext.stage).toBe('prod')
  })

  it('identity.sourceIp is request.info.remoteAddress', () => {
    expect(
      build({
        request: { info: { remoteAddress: '10.0.0.42', received: 1 } },
      }).requestContext.identity.sourceIp,
    ).toBe('10.0.0.42')
  })

  it('identity.userAgent reflects the user-agent header', () => {
    const event = build({
      request: { headers: { 'user-agent': 'curl/8.x' } },
    })
    expect(event.requestContext.identity.userAgent).toBe('curl/8.x')
  })

  it('identity.userAgent falls back to "" when header absent', () => {
    const event = build({
      request: {
        headers: { 'content-type': 'text/plain' },
        raw: { req: { rawHeaders: ['Content-Type', 'text/plain'] } },
      },
    })
    expect(event.requestContext.identity.userAgent).toBe('')
  })

  it('identity has every documented v1 field with null fallback for unimplemented ones', () => {
    const event = build()
    const id = event.requestContext.identity
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

  it('requestId is a UUID v4', () => {
    expect(build().requestContext.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('extendedRequestId is a separate UUID v4', () => {
    const event = build()
    expect(event.requestContext.extendedRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(event.requestContext.extendedRequestId).not.toBe(
      event.requestContext.requestId,
    )
  })

  it('requestTimeEpoch matches request.info.received', () => {
    expect(build().requestContext.requestTimeEpoch).toBe(1_700_000_000_000)
  })

  it('requestTime is in CLF format (dd/Mon/yyyy:HH:MM:SS +0000)', () => {
    expect(build().requestContext.requestTime).toBe(
      '14/Nov/2023:22:13:20 +0000',
    )
  })
})

describe('buildRestApiEvent — requestContext.authorizer', () => {
  function buildEvent(overrides = {}) {
    const request = {
      method: 'GET',
      path: '/dev/p',
      url: new URL('http://localhost:3000/dev/p'),
      params: {},
      query: {},
      headers: {},
      info: { remoteAddress: '127.0.0.1', received: 0 },
      raw: { req: { rawHeaders: [] } },
      payload: undefined,
      ...overrides.request,
      auth: overrides.request?.auth ?? { credentials: {} },
    }
    return buildRestApiEvent({
      request,
      route: { apigwPath: '/p', method: 'GET', functionName: 'fn' },
      stage: 'dev',
    })
  }

  afterEach(() => {
    delete process.env.AUTHORIZER
  })

  it('omits authorizer when no credentials, no env, no header', () => {
    const event = buildEvent()
    expect(event.requestContext.authorizer).toBeUndefined()
  })

  it('surfaces credentials.authorizer flat (REST v1 shape)', () => {
    const event = buildEvent({
      request: {
        auth: {
          credentials: { authorizer: { principalId: 'u-1', tenantId: 't-7' } },
        },
      },
    })
    expect(event.requestContext.authorizer).toEqual({
      principalId: 'u-1',
      tenantId: 't-7',
    })
  })

  it('process.env.AUTHORIZER overrides credentials when set with valid JSON', () => {
    process.env.AUTHORIZER = JSON.stringify({
      principalId: 'env-user',
      role: 'admin',
    })
    const event = buildEvent({
      request: {
        auth: { credentials: { authorizer: { principalId: 'u-1' } } },
      },
    })
    expect(event.requestContext.authorizer).toEqual({
      principalId: 'env-user',
      role: 'admin',
    })
  })

  it('sls-offline-authorizer-override header wins over env and credentials', () => {
    process.env.AUTHORIZER = JSON.stringify({ from: 'env' })
    const event = buildEvent({
      request: {
        headers: {
          'sls-offline-authorizer-override': JSON.stringify({ from: 'header' }),
        },
        auth: { credentials: { authorizer: { principalId: 'u' } } },
      },
    })
    expect(event.requestContext.authorizer).toEqual({ from: 'header' })
  })

  it('invalid JSON in env.AUTHORIZER falls through to credentials', () => {
    process.env.AUTHORIZER = 'not-json{'
    const event = buildEvent({
      request: {
        auth: { credentials: { authorizer: { principalId: 'u' } } },
      },
    })
    expect(event.requestContext.authorizer).toEqual({ principalId: 'u' })
  })

  it('invalid JSON in the override header falls through to env, then credentials', () => {
    process.env.AUTHORIZER = JSON.stringify({ from: 'env' })
    const event = buildEvent({
      request: {
        headers: { 'sls-offline-authorizer-override': 'not-json{' },
      },
    })
    expect(event.requestContext.authorizer).toEqual({ from: 'env' })
  })
})
