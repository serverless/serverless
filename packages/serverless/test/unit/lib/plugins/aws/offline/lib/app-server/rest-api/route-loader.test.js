import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { registerRestApiRoutes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/route-loader.js'

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

  it('translates {proxy+} to Hapi {any*}', () => {
    const stub = makeRouteStub()
    registerRestApiRoutes({
      server: stub,
      serverless: makeServerless({
        proxy: { events: [{ http: 'GET /api/{proxy+}' }] },
      }),
      stage: 'dev',
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].path).toBe('/dev/api/{any*}')
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
      { method: 'GET', path: '/a', mountedPath: '/dev/a', functionKey: 'a' },
      {
        method: 'POST',
        path: '/b/{id}',
        mountedPath: '/dev/b/{id}',
        functionKey: 'b',
      },
    ])
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

  it('POST routes get payload parse option (maxBytes 10 MB)', () => {
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

  it('AWS integration throws OFFLINE_REST_AWS_INTEGRATION_NOT_IMPLEMENTED at register time', () => {
    const stub = makeRouteStub()
    let caught
    try {
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
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.code).toBe('OFFLINE_REST_AWS_INTEGRATION_NOT_IMPLEMENTED')
    expect(caught.message).toContain('"f"')
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
    expect(captured.event.path).toBe('/dev/users/42')
    expect(captured.event.resource).toBe('/users/{id}')
    expect(captured.event.pathParameters).toEqual({ id: '42' })
    expect(captured.event.requestContext.stage).toBe('dev')
    expect(captured.event.requestContext.resourcePath).toBe('/users/{id}')
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
})
