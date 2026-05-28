/**
 * Integration tests for the HTTP API route loader.
 *
 * Boots a real Hapi server (no port — uses server.inject()) so that the
 * full path from a real HTTP request → Hapi's parsers → our event factory
 * → the registered route handler is exercised. The unit tests in
 * `route-loader.test.js` cover the loader's registration logic with stubs;
 * this file covers the wire-level request/response shape a Lambda handler
 * actually sees when a request flows through.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { registerHttpApiRoutes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/http-api/route-loader.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lifecycle tracker so each test cleans up its own Hapi instance. */
let activeServer = null

afterEach(async () => {
  if (activeServer) {
    await activeServer.stop({ timeout: 5000 })
    activeServer = null
  }
})

/**
 * Boot a Hapi server with the given function map registered and capture the
 * event object delivered to the Lambda handler stub.
 *
 * @param {Record<string, object>} functions  Stub `service.functions` map.
 * @returns {Promise<{ server: import('@hapi/hapi').Server, lastEvent: () => object | null, onRequest: jest.Mock }>}
 */
async function bootWithFunctions(functions) {
  const server = Hapi.server({ host: 'localhost', port: 0 })
  activeServer = server

  let lastEvent = null
  const onRequest = jest.fn(async (functionKey, event) => {
    lastEvent = event
    return { statusCode: 200, body: 'ok' }
  })

  registerHttpApiRoutes({
    server,
    serverless: { service: { functions } },
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()

  return {
    server,
    onRequest,
    lastEvent: () => lastEvent,
  }
}

// ---------------------------------------------------------------------------
// Request → event factory shape via real Hapi parser
// ---------------------------------------------------------------------------

describe('request → event delivered to the Lambda handler', () => {
  it('delivers the URL path verbatim as rawPath', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      get: { events: [{ httpApi: { method: 'GET', path: '/items' } }] },
    })

    await server.inject({ method: 'GET', url: '/items' })

    expect(lastEvent().rawPath).toBe('/items')
    expect(lastEvent().requestContext.http.path).toBe('/items')
  })

  it('binds APIGW path placeholders to pathParameters', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      getUser: {
        events: [{ httpApi: { method: 'GET', path: '/users/{id}' } }],
      },
    })

    await server.inject({ method: 'GET', url: '/users/42' })

    expect(lastEvent().pathParameters).toEqual({ id: '42' })
    expect(lastEvent().routeKey).toBe('GET /users/{id}')
  })

  it('keeps multi-value query string parameters', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      listTags: { events: [{ httpApi: 'GET /tags' }] },
    })

    await server.inject({ method: 'GET', url: '/tags?t=a&t=b&t=c&page=2' })

    expect(lastEvent().queryStringParameters).toEqual({
      t: 'a,b,c',
      page: '2',
    })
    expect(lastEvent().rawQueryString).toContain('t=a')
    expect(lastEvent().rawQueryString).toContain('page=2')
  })

  it('passes a JSON request body through verbatim as a string', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      create: { events: [{ httpApi: 'POST /items' }] },
    })

    const payload = JSON.stringify({ name: 'Widget', count: 3 })

    await server.inject({
      method: 'POST',
      url: '/items',
      headers: { 'content-type': 'application/json' },
      payload,
    })

    expect(lastEvent().isBase64Encoded).toBe(false)
    expect(JSON.parse(lastEvent().body)).toEqual({ name: 'Widget', count: 3 })
  })

  it('base64-encodes octet-stream request bodies', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      upload: { events: [{ httpApi: 'POST /upload' }] },
    })

    const bytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0xff, 0x00])

    await server.inject({
      method: 'POST',
      url: '/upload',
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes,
    })

    expect(lastEvent().isBase64Encoded).toBe(true)
    expect(Buffer.from(lastEvent().body, 'base64')).toEqual(bytes)
  })

  it('delivers body:null and isBase64Encoded:false for GET with no body', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      list: { events: [{ httpApi: 'GET /items' }] },
    })

    await server.inject({ method: 'GET', url: '/items' })

    expect(lastEvent().body).toBeNull()
    expect(lastEvent().isBase64Encoded).toBe(false)
  })

  it('exposes cookies parsed from the Cookie request header', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      me: { events: [{ httpApi: 'GET /me' }] },
    })

    await server.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: 'session=abc; csrf=xyz' },
    })

    expect(lastEvent().cookies).toEqual(['session=abc', 'csrf=xyz'])
    expect(lastEvent().headers).not.toHaveProperty('cookie')
  })

  it('cookies survive a malformed cookie header without 400-ing the request', async () => {
    // Real-world clients sometimes send cookies that Hapi's strict parser
    // would reject (e.g. unquoted special characters). The route loader
    // sets state.failAction: 'ignore' so the request still reaches the
    // handler; the event's cookies field reflects whatever Hapi could parse.
    const { server, lastEvent } = await bootWithFunctions({
      me: { events: [{ httpApi: 'GET /me' }] },
    })

    const res = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: 'session=abc; weird="!@#$%"' },
    })

    expect(res.statusCode).toBe(200)
    // The valid cookie made it through; the request didn't error out.
    expect(lastEvent().cookies).toEqual(expect.arrayContaining(['session=abc']))
  })

  it('exposes the request method uppercase in requestContext.http.method', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      patch: {
        events: [{ httpApi: { method: 'PATCH', path: '/items/{id}' } }],
      },
    })

    await server.inject({ method: 'PATCH', url: '/items/abc', payload: '{}' })

    expect(lastEvent().requestContext.http.method).toBe('PATCH')
  })

  it('honours httpApi.operationName by surfacing it in requestContext', async () => {
    const { server, lastEvent } = await bootWithFunctions({
      list: {
        events: [
          {
            httpApi: {
              method: 'GET',
              path: '/items',
              operationName: 'ListItems',
            },
          },
        ],
      },
    })

    await server.inject({ method: 'GET', url: '/items' })

    expect(lastEvent().requestContext.operationName).toBe('ListItems')
  })
})

// ---------------------------------------------------------------------------
// Lambda response → HTTP wire shape
// ---------------------------------------------------------------------------

describe('Lambda response → HTTP wire shape', () => {
  it('returns 200 with empty body when the handler returns undefined', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          functions: { ping: { events: [{ httpApi: 'GET /ping' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => undefined,
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/ping' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('')
  })

  it('returns 200 with application/json when the handler returns a plain string', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: { functions: { hi: { events: [{ httpApi: 'GET /hi' }] } } },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => 'hello',
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/hi' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('returns 200 with JSON when the handler returns a plain object without statusCode', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: { functions: { json: { events: [{ httpApi: 'GET /j' }] } } },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({ ok: true, n: 7 }),
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/j' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true, n: 7 })
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('honours statusCode and headers from a shaped response', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          functions: { create: { events: [{ httpApi: 'POST /items' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({
        statusCode: 201,
        body: '{"id":"abc"}',
        headers: { 'content-type': 'application/json', location: '/items/abc' },
      }),
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/items',
      payload: '{}',
    })

    expect(res.statusCode).toBe(201)
    expect(res.payload).toBe('{"id":"abc"}')
    expect(res.headers.location).toBe('/items/abc')
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('decodes a base64 response body when isBase64Encoded is true', async () => {
    const original = Buffer.from([0xff, 0xd8, 0xff, 0xe0]) // a tiny JPEG header
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: { functions: { img: { events: [{ httpApi: 'GET /img' }] } } },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({
        statusCode: 200,
        body: original.toString('base64'),
        isBase64Encoded: true,
        headers: { 'content-type': 'image/jpeg' },
      }),
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/img' })
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.equals(original)).toBe(true)
  })

  it('emits one Set-Cookie line per entry in the cookies array', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          functions: { login: { events: [{ httpApi: 'POST /login' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({
        statusCode: 204,
        cookies: ['session=abc; HttpOnly', 'csrf=xyz'],
      }),
    })
    await server.start()

    const res = await server.inject({
      method: 'POST',
      url: '/login',
      payload: '{}',
    })

    expect(res.statusCode).toBe(204)
    const raw = res.headers['set-cookie']
    const cookies = Array.isArray(raw)
      ? raw
      : raw.split(',').map((s) => s.trim())
    expect(cookies).toContain('session=abc; HttpOnly')
    expect(cookies).toContain('csrf=xyz')
  })

  it('returns 502 when the handler throws', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          functions: { boom: { events: [{ httpApi: 'GET /boom' }] } },
        },
        serverlessLog: () => {},
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => {
        throw new Error('kaboom')
      },
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload)).toEqual({
      message: 'Internal server error',
    })
  })

  it('returns 502 when the handler returns a non-string body without isBase64Encoded', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          functions: { broken: { events: [{ httpApi: 'GET /broken' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({
        statusCode: 200,
        body: { json: 'object-instead-of-string' },
      }),
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/broken' })
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.payload)).toEqual({
      message: 'Internal server error',
    })
  })

  it('honours custom non-success status codes from a shaped response', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          functions: { gone: { events: [{ httpApi: 'GET /missing' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({
        statusCode: 404,
        body: 'gone',
      }),
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/missing' })
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('gone')
  })

  it('passes through redirect status codes with Location header', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    activeServer = server
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          functions: { redir: { events: [{ httpApi: 'GET /redir' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({
        statusCode: 302,
        headers: { location: 'https://example.com/dest' },
      }),
    })
    await server.start()

    const res = await server.inject({ method: 'GET', url: '/redir' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('https://example.com/dest')
  })
})
