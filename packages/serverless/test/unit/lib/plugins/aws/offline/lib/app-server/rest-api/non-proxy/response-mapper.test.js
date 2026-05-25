import { mapNonProxyResponse } from '../../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/non-proxy/response-mapper.js'

/** Minimal Hapi h-toolkit stub the mapper can drive. */
function makeH() {
  const calls = { headers: [] }
  const builder = {
    code(c) {
      calls.statusCode = c
      return builder
    },
    type(t) {
      calls.contentType = t
      return builder
    },
    header(name, value) {
      calls.headers.push({ name, value })
      return builder
    },
  }
  return {
    calls,
    response(payload) {
      calls.payload = payload
      return builder
    },
  }
}

function makeRequest(overrides = {}) {
  return {
    method: 'POST',
    params: {},
    query: {},
    headers: { 'content-type': 'application/json' },
    info: { remoteAddress: '127.0.0.1' },
    raw: { req: { rawHeaders: [] } },
    mime: 'application/json',
    payload: {},
    ...overrides,
  }
}

describe('mapNonProxyResponse — status-code selection', () => {
  it('success uses responses.default.statusCode', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { ok: true },
      err: null,
      responses: { default: { statusCode: 200 } },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.statusCode).toBe(200)
  })

  it('success falls back to 200 when no default.statusCode set', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { ok: true },
      err: null,
      responses: { default: {} },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.statusCode).toBe(200)
  })

  it('error: selectionPattern regex against err.message picks the matching response', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: null,
      err: new Error('Not found: user 42'),
      responses: {
        default: { statusCode: 500 },
        404: { statusCode: 404, selectionPattern: 'Not found.*' },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.statusCode).toBe(404)
  })

  it('error: uses response key as regex when selectionPattern absent', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: null,
      err: new Error('boom'),
      responses: {
        default: { statusCode: 500 },
        boom: { statusCode: 418 },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.statusCode).toBe(418)
  })

  it('error: falls back to default response when no selectionPattern matches', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: null,
      err: new Error('something else'),
      responses: {
        default: { statusCode: 500 },
        404: { statusCode: 404, selectionPattern: 'Not found.*' },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.statusCode).toBe(500)
  })

  it('error: status code extracted from [NNN] prefix in message', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: null,
      err: new Error('[400] Bad input'),
      responses: { default: { statusCode: 500 } },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.statusCode).toBe(400)
  })

  it('error: defaults to 502 when no [NNN] prefix and no matching response statusCode', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: null,
      err: new Error('mystery failure'),
      responses: { default: {} },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.statusCode).toBe(502)
  })
})

describe('mapNonProxyResponse — responseParameters (header mapping)', () => {
  it('maps integration.response.body.PATH to a response header', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { redirect: { url: 'https://example.com/x' } },
      err: null,
      responses: {
        default: {
          statusCode: 302,
          responseParameters: {
            'method.response.header.Location':
              'integration.response.body.redirect.url',
          },
        },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.headers).toEqual(
      expect.arrayContaining([
        { name: 'Location', value: 'https://example.com/x' },
      ]),
    )
  })

  it('maps integration.response.body (no JSON path) to header, stringifying when needed', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: 'plain-string-payload',
      err: null,
      responses: {
        default: {
          statusCode: 200,
          responseParameters: {
            'method.response.header.X-Body': 'integration.response.body',
          },
        },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.headers).toEqual(
      expect.arrayContaining([
        { name: 'X-Body', value: 'plain-string-payload' },
      ]),
    )
  })

  it("maps 'literal' single-quoted value to header", () => {
    const h = makeH()
    mapNonProxyResponse({
      result: {},
      err: null,
      responses: {
        default: {
          statusCode: 200,
          responseParameters: {
            'method.response.header.X-Static': "'hello-world'",
          },
        },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.headers).toEqual(
      expect.arrayContaining([{ name: 'X-Static', value: 'hello-world' }]),
    )
  })

  it('skips non-method.response.header.* keys silently', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: {},
      err: null,
      responses: {
        default: {
          statusCode: 200,
          responseParameters: {
            'method.response.querystring.x': "'ignored'",
          },
        },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.headers).toEqual([])
  })

  it('treats missing JSON path as empty string — header NOT set', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { other: 'value' },
      err: null,
      responses: {
        default: {
          statusCode: 200,
          responseParameters: {
            'method.response.header.X-Missing':
              'integration.response.body.does.not.exist',
          },
        },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(
      h.calls.headers.find((it) => it.name === 'X-Missing'),
    ).toBeUndefined()
  })
})

describe('mapNonProxyResponse — responseTemplates', () => {
  it('renders responseTemplates[contentType] with $input bound to the Lambda result', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { hello: 'world' },
      err: null,
      responses: {
        default: {
          statusCode: 200,
          responseTemplates: {
            'application/json': '{"echo": "$input.path(\'$.hello\')"}',
          },
        },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(JSON.parse(h.calls.payload)).toEqual({ echo: 'world' })
  })

  it('serializes object result to JSON when no responseTemplates match', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { a: 1, b: 'two' },
      err: null,
      responses: { default: { statusCode: 200 } },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(JSON.parse(h.calls.payload)).toEqual({ a: 1, b: 'two' })
  })

  it('passes string result through verbatim when no responseTemplates', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: 'raw-text',
      err: null,
      responses: { default: { statusCode: 200 } },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(h.calls.payload).toBe('raw-text')
  })

  it('on error renders responseTemplates with $input bound to the AWS-shaped error envelope', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: null,
      err: new Error('kaboom'),
      responses: {
        default: {
          statusCode: 500,
          responseTemplates: {
            'application/json': '{"msg": "$input.path(\'$.errorMessage\')"}',
          },
        },
      },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(JSON.parse(h.calls.payload)).toEqual({ msg: 'kaboom' })
  })
})
