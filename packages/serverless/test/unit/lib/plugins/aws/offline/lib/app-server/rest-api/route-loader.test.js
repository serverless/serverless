import { jest } from '@jest/globals'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Hapi from '@hapi/hapi'
import { registerRestApiRoutes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/route-loader.js'
import { registerAuthSchemes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/register-schemes.js'

function makeServerless(functions = {}) {
  return { service: { functions } }
}

function makeRouteStub() {
  const routes = []
  return {
    routes,
    route(cfg) {
      routes.push(cfg)
    },
  }
}

function fakeH() {
  const calls = { headers: [] }
  const builder = {
    code: (c) => {
      calls.statusCode = c
      return builder
    },
    header: (n, v) => {
      calls.headers.push({ name: n, value: v })
      return builder
    },
  }
  return {
    calls,
    response: (p) => {
      calls.payload = p
      return builder
    },
  }
}

function namedHeaders(calls) {
  return Object.fromEntries(
    calls.headers.map((x) => [x.name.toLowerCase(), x.value]),
  )
}

describe('registerRestApiRoutes — registration', () => {
  it('no http events → no routes registered', () => {
    const stub = makeRouteStub()
    const out = registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({}),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes).toHaveLength(0)
    expect(out).toEqual([])
  })

  it('short string form: "GET /users" registers a Hapi GET /<stage>/users route', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        listUsers: { events: [{ http: 'GET /users' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].method).toBe('GET')
    expect(stub.routes[0].path).toBe('/dev/users')
  })

  it('long-form object honors method and path', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        createUser: {
          events: [{ http: { method: 'post', path: '/users' } }],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].method).toBe('POST')
    expect(stub.routes[0].path).toBe('/dev/users')
  })

  it('translates {proxy+} to Hapi {proxy*}', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        proxy: { events: [{ http: 'GET /api/{proxy+}' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].path).toBe('/dev/api/{proxy*}')
  })

  it('ANY method maps to Hapi *', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        any: { events: [{ http: { method: 'ANY', path: '/x' } }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].method).toBe('*')
  })

  it('HEAD maps to GET (Hapi auto-serves HEAD)', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        h: { events: [{ http: { method: 'HEAD', path: '/x' } }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].method).toBe('GET')
  })

  it('--noPrependStageInUrl removes the /<stage>/ prefix', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        users: { events: [{ http: 'GET /users' }] },
      }),
      stage: 'dev',
      noPrependStageInUrl: true,
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].path).toBe('/users')
  })

  it('--prefix is applied after the stage segment', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        users: { events: [{ http: 'GET /users' }] },
      }),
      stage: 'dev',
      prefix: 'api',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].path).toBe('/dev/api/users')
  })

  it('--prefix applied without stage when --noPrependStageInUrl is set', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        users: { events: [{ http: 'GET /users' }] },
      }),
      stage: 'dev',
      noPrependStageInUrl: true,
      prefix: 'api',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].path).toBe('/api/users')
  })

  it('returns the registered route list with apigw paths for the boot summary', () => {
    const stub = makeRouteStub()
    const out = registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: { events: [{ http: 'GET /a' }] },
        b: { events: [{ http: { method: 'POST', path: '/b/{id}' } }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(out).toEqual([
      {
        method: 'GET',
        path: '/a',
        mountedPath: '/dev/a',
        apigwMountedPath: '/dev/a',
        functionKey: 'a',
      },
      {
        method: 'POST',
        path: '/b/{id}',
        mountedPath: '/dev/b/{id}',
        apigwMountedPath: '/dev/b/{id}',
        functionKey: 'b',
      },
    ])
  })

  it('apigwMountedPath preserves APIGW {proxy+} template (Hapi {proxy*} stays in mountedPath)', () => {
    const stub = makeRouteStub()
    const out = registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        p: { events: [{ http: 'ANY /api/{proxy+}' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(out[0].mountedPath).toBe('/dev/api/{proxy*}')
    expect(out[0].apigwMountedPath).toBe('/dev/api/{proxy+}')
  })

  it('configures Hapi state parsing with failAction:ignore', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        u: { events: [{ http: 'GET /u' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].options.state).toEqual({
      parse: true,
      failAction: 'ignore',
    })
  })

  it('POST proxy routes get payload option with parsing disabled (maxBytes 10 MB)', () => {
    // Proxy integrations receive the body byte-for-byte, so payload parsing is
    // disabled and the handler sees the raw Buffer.
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        c: { events: [{ http: { method: 'POST', path: '/c' } }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].options.payload).toEqual({
      parse: false,
      output: 'data',
      maxBytes: 10 * 1024 * 1024,
    })
  })

  it('POST non-proxy (AWS) routes keep payload parsing enabled', () => {
    // Non-proxy integrations render a velocity request template against the
    // parsed body, so parsing stays on.
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        c: {
          events: [
            { http: { method: 'POST', path: '/c', integration: 'AWS' } },
          ],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].options.payload).toEqual({
      parse: true,
      output: 'data',
      maxBytes: 10 * 1024 * 1024,
    })
  })

  it('GET routes do NOT carry payload option', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        g: { events: [{ http: 'GET /g' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].options.payload).toBeUndefined()
  })

  it('AWS (non-proxy) integration registers a route (no longer throws)', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            {
              http: { method: 'GET', path: '/aws', integration: 'AWS' },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes).toHaveLength(1)
    expect(stub.routes[0].method).toBe('GET')
    expect(stub.routes[0].path).toBe('/dev/aws')
  })

  it('unsupported integration type bubbles up from the detector', () => {
    const stub = makeRouteStub()
    expect(() =>
      registerRestApiRoutes({
        server: stub,
        serverless: makeServerless({
          f: {
            events: [
              {
                http: { method: 'GET', path: '/h', integration: 'HTTP' },
              },
            ],
          },
        }),
        stage: 'dev',
        onRequest: jest.fn(),
      }),
    ).toThrow(/OFFLINE_UNSUPPORTED_INTEGRATION|not supported/)
  })
})

describe('registerRestApiRoutes — live request via server.inject()', () => {
  let server
  afterEach(async () => {
    if (server) {
      await server.stop({ timeout: 5000 })
      server = null
    }
  })

  it('delivers a v1 event with path params and stage in requestContext', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        getUser: {
          events: [{ http: { method: 'GET', path: '/users/{id}' } }],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/users/42' })

    expect(res.statusCode).toBe(200)
    expect(captured.functionKey).toBe('getUser')
    expect(captured.event.httpMethod).toBe('GET')
    expect(captured.event.path).toBe('/users/42')
    expect(captured.event.requestContext.path).toBe('/dev/users/42')
    expect(captured.event.resource).toBe('/users/{id}')
    expect(captured.event.pathParameters).toEqual({ id: '42' })
    expect(captured.event.requestContext.stage).toBe('dev')
    expect(captured.event.requestContext.resourcePath).toBe('/users/{id}')
    // REST responses carry the gateway request-id headers, mirroring the event.
    expect(res.headers['x-amzn-requestid']).toBe(
      captured.event.requestContext.requestId,
    )
    expect(res.headers['x-amz-apigw-id']).toBe(
      captured.event.requestContext.extendedRequestId,
    )
  })

  it('normalizes a no-leading-slash path to a leading slash in resource/resourcePath', async () => {
    // AWS API Gateway always normalizes the resource path to a leading slash,
    // regardless of how it is written in serverless.yml (`items` and `/items`
    // both deploy as `/items`).
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: '{}' }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        getItem: {
          events: [{ http: { method: 'GET', path: 'items/{id}' } }],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/items/42' })

    expect(res.statusCode).toBe(200)
    expect(captured.event.resource).toBe('/items/{id}')
    expect(captured.event.requestContext.resourcePath).toBe('/items/{id}')
  })

  it('strips both stage and --prefix from event.path on a real request', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: '{}' }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        getUser: {
          events: [{ http: { method: 'GET', path: '/users/{id}' } }],
        },
      }),
      stage: 'dev',
      prefix: 'api',
      onRequest,
    })
    await server.start()

    // The route is mounted /dev/api/users/{id}; the handler must still see the
    // bare resource path with both the stage AND the prefix stripped.
    const res = await server.inject({ method: 'GET', url: '/dev/api/users/42' })

    expect(res.statusCode).toBe(200)
    expect(captured.event.path).toBe('/users/42')
    expect(captured.event.requestContext.path).toBe('/dev/api/users/42')
    expect(captured.event.pathParameters).toEqual({ id: '42' })
  })

  it('delivers a proxy request body byte-for-byte without re-serializing JSON', async () => {
    // AWS_PROXY passes the request body through unmodified; insignificant JSON
    // whitespace must survive so webhook HMAC signatures computed over the raw
    // bytes still verify.
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: '{}' }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        create: { events: [{ http: { method: 'POST', path: '/items' } }] },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const payload = '{ "a":  1 ,  "b": 2 }'
    const res = await server.inject({
      method: 'POST',
      url: '/dev/items',
      headers: { 'content-type': 'application/json' },
      payload,
    })

    expect(res.statusCode).toBe(200)
    expect(captured.event.isBase64Encoded).toBe(false)
    expect(captured.event.body).toBe(payload)
  })

  it('base64-encodes a binary proxy request body and sets isBase64Encoded', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: '{}' }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        upload: { events: [{ http: { method: 'POST', path: '/upload' } }] },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const bytes = Buffer.from([0x01, 0x02, 0x03, 0xff, 0x00])
    const res = await server.inject({
      method: 'POST',
      url: '/dev/upload',
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes,
    })

    expect(res.statusCode).toBe(200)
    expect(captured.event.isBase64Encoded).toBe(true)
    expect(Buffer.from(captured.event.body, 'base64')).toEqual(bytes)
  })

  it('delivers body:null for a proxy GET with no body', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: '{}' }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        list: { events: [{ http: { method: 'GET', path: '/items' } }] },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/items' })

    expect(res.statusCode).toBe(200)
    expect(captured.event.body).toBeNull()
    expect(captured.event.isBase64Encoded).toBe(false)
  })

  it('delivers body:null with no content-length/content-type for a proxy POST with no body', async () => {
    // A body-allowed method sent with no payload arrives as a zero-length
    // Buffer. Real API Gateway emits body:null and injects no Content-Length
    // or Content-Type for a bodyless request, regardless of method.
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: '{}' }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        create: { events: [{ http: { method: 'POST', path: '/items' } }] },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'POST', url: '/dev/items' })

    expect(res.statusCode).toBe(200)
    expect(captured.event.body).toBeNull()
    expect(captured.event.isBase64Encoded).toBe(false)
    const headerNames = Object.keys(captured.event.headers).map((k) =>
      k.toLowerCase(),
    )
    expect(headerNames).not.toContain('content-length')
    expect(headerNames).not.toContain('content-type')
  })

  it('injects content-length matching the raw body byte length for a multibyte proxy body', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: '{}' }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        create: { events: [{ http: { method: 'POST', path: '/items' } }] },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const payload = '{"name":"é"}'
    const res = await server.inject({
      method: 'POST',
      url: '/dev/items',
      headers: { 'content-type': 'application/json' },
      payload,
    })

    expect(res.statusCode).toBe(200)
    expect(captured.event.body).toBe(payload)
    const contentLength =
      captured.event.headers['Content-Length'] ??
      captured.event.headers['content-length']
    expect(contentLength).toBe(String(Buffer.byteLength(payload)))
  })

  it('returns 502 when the handler throws', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        boom: { events: [{ http: 'GET /boom' }] },
      }),
      stage: 'dev',
      onRequest: async () => {
        throw new Error('kaboom')
      },
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/boom' })
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload)).toEqual({
      message: 'Internal server error',
    })
  })

  it('per-route cors:true adds CORS headers to non-OPTIONS responses', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        getUser: {
          events: [
            { http: { method: 'GET', path: '/users/{id}', cors: true } },
          ],
        },
      }),
      stage: 'dev',
      onRequest: async () => ({ statusCode: 200, body: 'ok' }),
    })
    await server.start()

    const res = await server.inject({
      method: 'GET',
      url: '/dev/users/42',
      headers: { origin: 'https://example.com' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })

  it('preflight Allow-Methods unions every route method sharing the path', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        listUsers: {
          events: [{ http: { method: 'GET', path: '/users', cors: true } }],
        },
        createUser: {
          events: [{ http: { method: 'POST', path: '/users', cors: true } }],
        },
      }),
      stage: 'dev',
      onRequest: async () => ({ statusCode: 200, body: 'ok' }),
    })
    await server.start()

    const res = await server.inject({ method: 'OPTIONS', url: '/dev/users' })
    expect(res.statusCode).toBe(200)
    const methods = res.headers['access-control-allow-methods'].split(',')
    expect(methods).toEqual(expect.arrayContaining(['GET', 'POST', 'OPTIONS']))
  })
})

describe('registerRestApiRoutes — CORS', () => {
  it('http.cors:true registers an OPTIONS route at the mounted path', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [{ http: { method: 'GET', path: '/x', cors: true } }],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    const opts = stub.routes.find((r) => r.method === 'OPTIONS')
    expect(opts).toBeDefined()
    expect(opts.path).toBe('/dev/x')
  })

  it('http.cors:false does NOT register an OPTIONS route', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [{ http: { method: 'GET', path: '/x', cors: false } }],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes.find((r) => r.method === 'OPTIONS')).toBeUndefined()
  })

  it('http.cors absent does NOT register an OPTIONS route', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [{ http: { method: 'GET', path: '/x' } }],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes.find((r) => r.method === 'OPTIONS')).toBeUndefined()
  })

  it('two routes sharing a path share a single OPTIONS handler', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        list: {
          events: [{ http: { method: 'GET', path: '/x', cors: true } }],
        },
        create: {
          events: [{ http: { method: 'POST', path: '/x', cors: true } }],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    const options = stub.routes.filter((r) => r.method === 'OPTIONS')
    expect(options).toHaveLength(1)
  })

  it('http.cors object form is honored (custom origin)', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/x',
                cors: { origin: 'https://example.com' },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    // The OPTIONS route exists; the actual origin check happens at handler time.
    // Verify by calling the synthesized handler with a request:
    const opts = stub.routes.find((r) => r.method === 'OPTIONS')
    expect(opts).toBeDefined()
    const fakeH = () => {
      const calls = { headers: [] }
      const builder = {
        code: (c) => {
          calls.statusCode = c
          return builder
        },
        header: (n, v) => {
          calls.headers.push({ name: n, value: v })
          return builder
        },
      }
      return {
        calls,
        response: (p) => {
          calls.payload = p
          return builder
        },
      }
    }
    const h = fakeH()
    opts.handler({ headers: { origin: 'https://example.com' } }, h)
    const allowOrigin = h.calls.headers.find(
      (x) => x.name.toLowerCase() === 'access-control-allow-origin',
    )
    expect(allowOrigin?.value).toBe('https://example.com')
  })

  it('global corsAllow flags override per-route CORS values on preflight', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/x',
                cors: {
                  origin: 'https://route.example.com',
                  headers: ['x-route'],
                  exposedHeaders: ['x-route-exposed'],
                  allowCredentials: false,
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      corsAllowOrigin: 'https://global.example.com',
      corsAllowHeaders: 'x-global,x-other',
      corsExposedHeaders: 'x-global-exposed',
      corsDisallowCredentials: false,
      onRequest: jest.fn(),
    })
    const opts = stub.routes.find((r) => r.method === 'OPTIONS')
    const h = fakeH()
    opts.handler({ headers: { origin: 'https://global.example.com' } }, h)
    expect(namedHeaders(h.calls)).toMatchObject({
      'access-control-allow-origin': 'https://global.example.com',
      'access-control-allow-headers': 'x-global,x-other',
      'access-control-expose-headers': 'x-global-exposed',
      'access-control-allow-credentials': 'true',
    })
  })

  it('short string form cannot declare CORS — no OPTIONS route synthesized', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        f: { events: [{ http: 'GET /x' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes.find((r) => r.method === 'OPTIONS')).toBeUndefined()
  })
})

describe('registerRestApiRoutes — cookie flags', () => {
  it('disableCookieValidation:false keeps request cookie parsing enabled', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        u: { events: [{ http: 'GET /u' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].options.state.parse).toBe(true)
  })

  it('disableCookieValidation:true disables request cookie parsing', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        u: { events: [{ http: 'GET /u' }] },
      }),
      stage: 'dev',
      disableCookieValidation: true,
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].options.state.parse).toBe(false)
  })

  it('enforceSecureCookies:true appends Secure to Set-Cookie responses', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    try {
      registerRestApiRoutes({
        server,
        serverless: makeServerless({
          c: { events: [{ http: 'GET /cookie' }] },
        }),
        stage: 'dev',
        enforceSecureCookies: true,
        onRequest: async () => ({
          statusCode: 200,
          headers: { 'Set-Cookie': 'sid=123; HttpOnly' },
          body: 'ok',
        }),
      })
      await server.start()
      const res = await server.inject({
        method: 'GET',
        url: '/dev/cookie',
      })
      expect(res.headers['set-cookie']).toContain('Secure')
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })
})

describe('registerRestApiRoutes — AWS (non-proxy) integration dispatch', () => {
  let server
  afterEach(async () => {
    if (server) {
      await server.stop({ timeout: 5000 })
      server = null
    }
  })

  it('AWS integration handler receives the rendered event from the request template', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { ok: true }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        createItem: {
          events: [
            {
              http: {
                method: 'POST',
                path: '/items/{id}',
                integration: 'AWS',
                request: {
                  template: {
                    'application/json':
                      '{"id": "$input.params(\'id\')", "msg": $input.json(\'$.hello\')}',
                  },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/dev/items/42',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ hello: 'world' }),
    })

    expect(res.statusCode).toBe(200)
    expect(captured.functionKey).toBe('createItem')
    expect(captured.event).toEqual({ id: '42', msg: 'world' })
  })

  it('AWS integration: an untemplated content type is rejected with 415 and the handler is not invoked', async () => {
    // The default passthrough behavior for an AWS (Lambda) integration is
    // NEVER: a request whose Content-Type matches neither a configured request
    // template nor a built-in default (application/json,
    // application/x-www-form-urlencoded) is rejected with 415 and the body is
    // never delivered to the integration.
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({ ok: true }))
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        createItem: {
          events: [
            {
              http: {
                method: 'POST',
                path: '/items',
                integration: 'AWS',
                request: {
                  template: {
                    'application/json': '{"received": $input.json(\'$\')}',
                  },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/dev/items',
      headers: { 'content-type': 'text/plain' },
      payload: 'plain text body',
    })

    expect(res.statusCode).toBe(415)
    expect(JSON.parse(res.payload)).toEqual({
      message: 'Unsupported Media Type',
    })
    expect(onRequest).not.toHaveBeenCalled()
  })

  it('AWS integration: a configured-template content type is delivered to the handler (200)', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { ok: true }
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        createItem: {
          events: [
            {
              http: {
                method: 'POST',
                path: '/items',
                integration: 'AWS',
                request: {
                  template: {
                    'application/json': '{"received": $input.json(\'$\')}',
                  },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/dev/items',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ hello: 'world' }),
    })

    expect(res.statusCode).toBe(200)
    expect(onRequest).toHaveBeenCalledTimes(1)
    expect(captured.event).toEqual({ received: { hello: 'world' } })
  })

  it('AWS integration: a built-in default content type (x-www-form-urlencoded) is delivered to the handler (200)', async () => {
    // application/x-www-form-urlencoded keeps its built-in default template even
    // when only an application/json template is configured, so the request is
    // not rejected.
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({ ok: true }))
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        createItem: {
          events: [
            {
              http: {
                method: 'POST',
                path: '/items',
                integration: 'AWS',
                request: {
                  template: {
                    'application/json': '{"received": $input.json(\'$\')}',
                  },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/dev/items',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'a=1&b=2',
    })

    expect(res.statusCode).toBe(200)
    expect(onRequest).toHaveBeenCalledTimes(1)
  })

  it('AWS integration: response selectionPattern picks the matching status on error', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => {
      throw new Error('Not found: user 42')
    })
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        getItem: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/items/{id}',
                integration: 'AWS',
                response: {
                  statusCodes: {
                    200: { pattern: '' },
                    404: { pattern: 'Not found.*' },
                  },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'GET',
      url: '/dev/items/42',
    })
    expect(res.statusCode).toBe(404)
  })

  it('AWS integration: response template renders the Lambda result', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({ hello: 'world' }))
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        echo: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/items',
                integration: 'AWS',
                response: {
                  template: {
                    'application/json': '{"echo": "$input.path(\'$.hello\')"}',
                  },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/items' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ echo: 'world' })
  })

  it('AWS integration: bare-string response.template is treated as the application/json default', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({ hello: 'world' }))
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        echo2: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/items2',
                integration: 'AWS',
                // Framework's schema allows `response.template` as either a
                // bare string (default content-type) or a content-type map.
                response: {
                  template: '{"defaulted": "$input.path(\'$.hello\')"}',
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/items2' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ defaulted: 'world' })
  })

  it('AWS integration: response.headers Content-Type selects the response template and reply Content-Type', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({ hello: 'world' }))
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        xml: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/xml',
                integration: 'AWS',
                response: {
                  // The configured Content-Type (a velocity literal authored
                  // with wrapping single quotes) drives both template
                  // selection and the reply Content-Type — not the request.
                  headers: { 'Content-Type': "'text/xml'" },
                  template: {
                    'text/xml': "<msg>$input.path('$.hello')</msg>",
                  },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'GET',
      url: '/dev/xml',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/xml')
    expect(res.payload).toBe('<msg>world</msg>')
  })

  it('AWS integration: response.headers literal maps to a response header', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({ ok: true }))
    registerRestApiRoutes({
      server,
      serverless: makeServerless({
        h: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/h',
                integration: 'AWS',
                response: {
                  headers: { 'X-Custom': "'literal-value'" },
                },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/h' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-custom']).toBe('literal-value')
  })
})

describe('registerRestApiRoutes — AWS (non-proxy) sidecar templates', () => {
  let server
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'offline-rest-'))
    mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'src', 'echo.req.vm'),
      '{"viaSidecar": true, "method": "$context.httpMethod"}',
      'utf8',
    )
    writeFileSync(
      path.join(tmpDir, 'src', 'resp.res.vm'),
      '{"wrapped": $input.json("$")}',
      'utf8',
    )
  })

  afterEach(async () => {
    if (server) {
      await server.stop({ timeout: 5000 })
      server = null
    }
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('a <handler>.req.vm sidecar overrides the default request template', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { ok: true }
    })
    registerRestApiRoutes({
      server,
      serverless: {
        serviceDir: tmpDir,
        service: {
          functions: {
            echo: {
              handler: 'src/echo.handler',
              events: [
                {
                  http: {
                    method: 'post',
                    path: '/echo',
                    integration: 'lambda',
                  },
                },
              ],
            },
          },
        },
      },
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/dev/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ hello: 'world' }),
    })

    expect(res.statusCode).toBe(200)
    expect(captured.functionKey).toBe('echo')
    expect(captured.event).toEqual({ viaSidecar: true, method: 'POST' })
  })

  it('an explicit request.template wins over a present <handler>.req.vm sidecar', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { ok: true }
    })
    registerRestApiRoutes({
      server,
      serverless: {
        serviceDir: tmpDir,
        service: {
          functions: {
            echo: {
              handler: 'src/echo.handler',
              events: [
                {
                  http: {
                    method: 'post',
                    path: '/echo',
                    integration: 'lambda',
                    request: {
                      template: { 'application/json': '{"explicit": true}' },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/dev/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ hello: 'world' }),
    })

    expect(res.statusCode).toBe(200)
    expect(captured.event).toEqual({ explicit: true })
  })

  it('a <handler>.res.vm sidecar maps the response when no response.template is configured', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({ value: 7 }))
    registerRestApiRoutes({
      server,
      serverless: {
        serviceDir: tmpDir,
        service: {
          functions: {
            resp: {
              handler: 'src/resp.handler',
              events: [
                {
                  http: {
                    method: 'get',
                    path: '/resp',
                    integration: 'lambda',
                  },
                },
              ],
            },
          },
        },
      },
      stage: 'dev',
      onRequest,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/dev/resp' })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ wrapped: { value: 7 } })
  })
})

describe('registerRestApiRoutes — auth strategy wiring', () => {
  it('sets options.auth to "api-key" when route has private: true', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: { events: [{ http: { method: 'GET', path: '/p', private: true } }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: 'api-key',
        authorizerStrategies: new Map(),
      },
    })
    expect(stub.routes[0].options.auth).toBe('api-key')
  })

  it('sets options.auth to the lambda-authorizer strategy when route declares authorizer.name', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/p',
                authorizer: { name: 'authFn' },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: null,
        authorizerStrategies: new Map([['authFn', 'lambda-authorizer:authFn']]),
      },
    })
    expect(stub.routes[0].options.auth).toBe('lambda-authorizer:authFn')
  })

  it('leaves private REST routes public when noAuth is true', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: { events: [{ http: { method: 'GET', path: '/p', private: true } }] },
      }),
      stage: 'dev',
      noAuth: true,
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: 'api-key',
        authorizerStrategies: new Map(),
      },
    })
    expect(stub.routes[0].options.auth).toBeUndefined()
  })

  it('leaves options.auth undefined for routes without private/authorizer', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: { events: [{ http: { method: 'GET', path: '/p' } }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: null,
        authorizerStrategies: new Map(),
      },
    })
    expect(stub.routes[0].options.auth).toBeUndefined()
  })

  it('falls back gracefully when authStrategies is omitted (back-compat)', () => {
    const stub = makeRouteStub()
    expect(() =>
      registerRestApiRoutes({
        server: stub,
        serverless: makeServerless({
          a: { events: [{ http: { method: 'GET', path: '/p' } }] },
        }),
        stage: 'dev',
        onRequest: jest.fn(),
      }),
    ).not.toThrow()
    expect(stub.routes[0].options.auth).toBeUndefined()
  })
})

describe('registerRestApiRoutes — private + authorizer enforcement', () => {
  let server

  afterEach(async () => {
    if (server) {
      await server.stop({ timeout: 5000 })
      server = null
    }
  })

  // A function declaring an http event that is BOTH private AND guarded by a
  // Lambda authorizer. AWS enforces both: the authorizer runs, AND a valid
  // api-key is required.
  function makeBothServerless({ allow }) {
    return {
      service: {
        provider: { apiGateway: { apiKeys: ['key-123'] } },
        functions: {
          authFn: { events: [] },
          secret: {
            events: [
              {
                http: {
                  method: 'GET',
                  path: '/secret',
                  private: true,
                  // REQUEST authorizer with no identitySource → always invoked
                  // (identity type NONE), so the policy decision drives the
                  // outcome rather than a missing TOKEN header.
                  authorizer: { name: 'authFn', type: 'request' },
                },
              },
            ],
          },
        },
      },
    }
  }

  async function bootBoth({ allow, usageIdentifierKey }) {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const authorizerLambda = {
      invoke: jest.fn(async () => ({
        principalId: 'u-1',
        policyDocument: {
          Statement: [{ Effect: allow ? 'Allow' : 'Deny', Resource: '*' }],
        },
        ...(usageIdentifierKey ? { usageIdentifierKey } : {}),
      })),
    }
    const lambdas = {
      get: (name) => (name === 'authFn' ? authorizerLambda : undefined),
    }
    const authStrategies = registerAuthSchemes({
      server,
      serverless: makeBothServerless({ allow }),
      lambdas,
      stage: 'dev',
      accountId: '000000000000',
    })
    registerRestApiRoutes({
      server,
      serverless: makeBothServerless({ allow }),
      stage: 'dev',
      onRequest: async () => ({
        statusCode: 200,
        body: JSON.stringify({ ok: true }),
      }),
      authStrategies,
    })
    await server.start()
    return { authorizerLambda }
  }

  it('valid api-key + a DENYING authorizer → 403 (authorizer fails Hapi auth)', async () => {
    await bootBoth({ allow: false })
    const res = await server.inject({
      method: 'GET',
      url: '/dev/secret',
      headers: { 'x-api-key': 'key-123' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('missing api-key + an ALLOWING authorizer → 403 (handler api-key gate)', async () => {
    await bootBoth({ allow: true })
    const res = await server.inject({ method: 'GET', url: '/dev/secret' })
    expect(res.statusCode).toBe(403)
  })

  it('valid api-key + an ALLOWING authorizer → 200', async () => {
    await bootBoth({ allow: true })
    const res = await server.inject({
      method: 'GET',
      url: '/dev/secret',
      headers: { 'x-api-key': 'key-123' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
  })

  it('authorizer-returned usageIdentifierKey matching a configured key + no client key → 200', async () => {
    await bootBoth({ allow: true, usageIdentifierKey: 'key-123' })
    const res = await server.inject({ method: 'GET', url: '/dev/secret' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
  })

  it('private-only route still enforces the api-key (single-concern guard)', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const serverless = {
      service: {
        provider: { apiGateway: { apiKeys: ['key-123'] } },
        functions: {
          priv: {
            events: [{ http: { method: 'GET', path: '/priv', private: true } }],
          },
        },
      },
    }
    const authStrategies = registerAuthSchemes({
      server,
      serverless,
      lambdas: { get: () => undefined },
      stage: 'dev',
      accountId: '000000000000',
    })
    registerRestApiRoutes({
      server,
      serverless,
      stage: 'dev',
      onRequest: async () => ({ statusCode: 200, body: 'ok' }),
      authStrategies,
    })
    await server.start()

    const denied = await server.inject({ method: 'GET', url: '/dev/priv' })
    expect(denied.statusCode).toBe(403)
    const allowed = await server.inject({
      method: 'GET',
      url: '/dev/priv',
      headers: { 'x-api-key': 'key-123' },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('authorizer-only route is unaffected by the api-key gate (single-concern guard)', async () => {
    server = Hapi.server({ host: 'localhost', port: 0 })
    const authorizerLambda = {
      invoke: jest.fn(async () => ({
        principalId: 'u-1',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      })),
    }
    const serverless = {
      service: {
        provider: {},
        functions: {
          authFn: { events: [] },
          guarded: {
            events: [
              {
                http: {
                  method: 'GET',
                  path: '/guarded',
                  authorizer: { name: 'authFn' },
                },
              },
            ],
          },
        },
      },
    }
    const authStrategies = registerAuthSchemes({
      server,
      serverless,
      lambdas: { get: (n) => (n === 'authFn' ? authorizerLambda : undefined) },
      stage: 'dev',
      accountId: '000000000000',
    })
    registerRestApiRoutes({
      server,
      serverless,
      stage: 'dev',
      onRequest: async () => ({ statusCode: 200, body: 'ok' }),
      authStrategies,
    })
    await server.start()

    // No api-key sent; an authorizer-only route does not require one.
    const res = await server.inject({
      method: 'GET',
      url: '/dev/guarded',
      headers: { authorization: 'Bearer good' },
    })
    expect(res.statusCode).toBe(200)
  })
})
