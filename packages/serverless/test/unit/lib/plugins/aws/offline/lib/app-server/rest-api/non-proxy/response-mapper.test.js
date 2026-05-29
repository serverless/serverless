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

  it('JSON-serializes a bare string result when there is no responseTemplate', () => {
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
    // API Gateway JSON-serializes the integration result, so a bare string
    // is emitted quoted.
    expect(h.calls.payload).toBe('"raw-text"')
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

describe('mapNonProxyResponse — response Content-Type', () => {
  it('defaults to application/json (not text/html, the Hapi default)', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { ok: true },
      err: null,
      responses: { default: { statusCode: 200 } },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/x',
      h,
    })
    expect(h.calls.contentType).toBe('application/json')
  })

  it('still application/json when the handler throws and no template matches', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: null,
      err: new Error('boom'),
      responses: { default: { statusCode: 500 } },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/x',
      h,
    })
    expect(h.calls.contentType).toBe('application/json')
  })

  it('uses the response record responseContentType to select the template and pin the reply type', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { hello: 'world' },
      err: null,
      responses: {
        default: {
          statusCode: 200,
          responseContentType: 'text/xml',
          responseTemplates: {
            'text/xml': "<msg>$input.path('$.hello')</msg>",
          },
        },
      },
      // The request is JSON, but the integration response's configured content
      // type (text/xml) is what selects the template and the reply Content-Type.
      request: makeRequest({
        mime: 'application/json',
        headers: { 'content-type': 'application/json' },
      }),
      stage: 'dev',
      resourcePath: '/x',
      h,
    })
    expect(h.calls.contentType).toBe('text/xml')
    expect(h.calls.payload).toBe('<msg>world</msg>')
  })

  it('ignores the request mime — a JSON request does not select an XML template absent a configured content type', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: { hello: 'world' },
      err: null,
      responses: {
        default: {
          statusCode: 200,
          responseTemplates: {
            'application/xml': "<msg>$input.path('$.hello')</msg>",
          },
        },
      },
      // An XML-typed request must NOT cause the mapper to pick the XML
      // template; with no configured response content type it defaults to JSON.
      request: makeRequest({
        mime: 'application/xml',
        headers: { 'content-type': 'application/xml' },
      }),
      stage: 'dev',
      resourcePath: '/x',
      h,
    })
    expect(h.calls.contentType).toBe('application/json')
    // The XML template was never rendered: the body is the JSON-serialized result.
    expect(h.calls.payload).toBe('{"hello":"world"}')
  })
})

describe('mapNonProxyResponse — contentHandling CONVERT_TO_BINARY', () => {
  it('base64-decodes the body into a binary Buffer when contentHandling is CONVERT_TO_BINARY', () => {
    const h = makeH()
    const original = Buffer.from([1, 2, 3, 4])
    mapNonProxyResponse({
      result: original.toString('base64'),
      err: null,
      responses: { default: { statusCode: 200 } },
      contentHandling: 'CONVERT_TO_BINARY',
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    expect(Buffer.isBuffer(h.calls.payload)).toBe(true)
    expect(h.calls.payload.equals(original)).toBe(true)
  })

  it('leaves the body as a (JSON-serialized) string when contentHandling is absent', () => {
    const h = makeH()
    const original = Buffer.from([1, 2, 3, 4])
    const base64 = original.toString('base64')
    mapNonProxyResponse({
      result: base64,
      err: null,
      responses: { default: { statusCode: 200 } },
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    // Without CONVERT_TO_BINARY the body is not decoded to a Buffer; the bare
    // string result is JSON-serialized like any other no-template result.
    expect(typeof h.calls.payload).toBe('string')
    expect(h.calls.payload).toBe(JSON.stringify(base64))
  })

  it('does not decode an error (non-2xx) response body even when CONVERT_TO_BINARY is set', () => {
    const h = makeH()
    mapNonProxyResponse({
      result: undefined,
      err: new Error('[500] boom'),
      responses: { default: { statusCode: 200 } },
      contentHandling: 'CONVERT_TO_BINARY',
      request: makeRequest(),
      stage: 'dev',
      resourcePath: '/things',
      h,
    })
    // Content handling applies only to 2xx integration responses; the error
    // envelope must pass through as a text body, not be base64-decoded.
    expect(h.calls.statusCode).toBe(500)
    expect(typeof h.calls.payload).toBe('string')
    expect(JSON.parse(h.calls.payload).errorMessage).toBe('[500] boom')
  })
})
