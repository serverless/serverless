import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { registerAlbRoutes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/alb/route-loader.js'

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

describe('registerAlbRoutes — registration', () => {
  it('no alb events → empty registered list', () => {
    const stub = makeRouteStub()
    const out = registerAlbRoutes({
      server: stub,
      serverless: makeServerless(),
      onRequest: jest.fn(),
    })
    expect(out).toEqual([])
    expect(stub.routes).toHaveLength(0)
  })

  it('registers a route from conditions.path string + conditions.method array', () => {
    const stub = makeRouteStub()
    registerAlbRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            {
              alb: {
                listenerArn: 'arn:...',
                priority: 1,
                conditions: {
                  path: '/orders',
                  method: ['POST'],
                },
              },
            },
          ],
        },
      }),
      onRequest: jest.fn(),
    })
    expect(stub.routes).toHaveLength(1)
    expect(stub.routes[0].method).toBe('POST')
    expect(stub.routes[0].path).toBe('/orders')
  })

  it('accepts conditions.path as a single-element array', () => {
    const stub = makeRouteStub()
    registerAlbRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            {
              alb: {
                conditions: { path: ['/orders'], method: ['GET'] },
              },
            },
          ],
        },
      }),
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].path).toBe('/orders')
    expect(stub.routes[0].method).toBe('GET')
  })

  it('defaults method to "*" (Hapi catch-all) when conditions.method is absent', () => {
    const stub = makeRouteStub()
    registerAlbRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            {
              alb: { conditions: { path: '/orders' } },
            },
          ],
        },
      }),
      onRequest: jest.fn(),
    })
    expect(stub.routes[0].method).toBe('*')
  })

  it('registers one Hapi route per method when conditions.method has multiple', () => {
    const stub = makeRouteStub()
    registerAlbRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            {
              alb: {
                conditions: { path: '/orders', method: ['GET', 'POST'] },
              },
            },
          ],
        },
      }),
      onRequest: jest.fn(),
    })
    expect(stub.routes).toHaveLength(2)
    expect(stub.routes.map((r) => r.method).sort()).toEqual(['GET', 'POST'])
  })

  it('ignores listenerArn and priority (no real ALB offline)', () => {
    const stub = makeRouteStub()
    expect(() =>
      registerAlbRoutes({
        server: stub,
        serverless: makeServerless({
          f: {
            events: [
              {
                alb: {
                  listenerArn: 'arn:whatever',
                  priority: 999,
                  conditions: { path: '/p', method: ['GET'] },
                },
              },
            ],
          },
        }),
        onRequest: jest.fn(),
      }),
    ).not.toThrow()
    expect(stub.routes[0].path).toBe('/p')
  })

  it('returns the registered route list for the boot summary', () => {
    const stub = makeRouteStub()
    const out = registerAlbRoutes({
      server: stub,
      serverless: makeServerless({
        a: {
          events: [{ alb: { conditions: { path: '/a', method: ['GET'] } } }],
        },
        b: {
          events: [{ alb: { conditions: { path: '/b', method: ['POST'] } } }],
        },
      }),
      onRequest: jest.fn(),
    })
    expect(out).toEqual([
      { method: 'GET', path: '/a', functionKey: 'a' },
      { method: 'POST', path: '/b', functionKey: 'b' },
    ])
  })

  it('skips non-alb events on a function (only walks alb)', () => {
    const stub = makeRouteStub()
    registerAlbRoutes({
      server: stub,
      serverless: makeServerless({
        f: {
          events: [
            { http: 'GET /rest' },
            { httpApi: { method: 'GET', path: '/api' } },
            { alb: { conditions: { path: '/lb', method: ['GET'] } } },
          ],
        },
      }),
      onRequest: jest.fn(),
    })
    expect(stub.routes).toHaveLength(1)
    expect(stub.routes[0].path).toBe('/lb')
  })

  it('delivers an ALB event to onRequest via Hapi inject', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    let captured
    const onRequest = jest.fn(async (functionKey, event) => {
      captured = { functionKey, event }
      return { statusCode: 200, body: 'ok' }
    })
    registerAlbRoutes({
      server,
      serverless: makeServerless({
        echo: {
          events: [
            { alb: { conditions: { path: '/echo', method: ['POST'] } } },
          ],
        },
      }),
      onRequest,
    })
    await server.start()
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/echo',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ k: 'v' }),
      })
      expect(res.statusCode).toBe(200)
      expect(captured.functionKey).toBe('echo')
      expect(captured.event.httpMethod).toBe('POST')
      expect(captured.event.path).toBe('/echo')
      expect(captured.event.requestContext.elb.targetGroupArn).toBe(
        'arn:aws:elasticloadbalancing:us-east-1:550213415212:targetgroup/5811b5d6aff964cd50efa8596604c4e0/b49d49c443aa999f',
      )
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })

  it('returns the formatted ALB response from a shaped handler return', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const onRequest = jest.fn(async () => ({
      statusCode: 418,
      body: '{"msg":"teapot"}',
      headers: { 'content-type': 'application/json' },
    }))
    registerAlbRoutes({
      server,
      serverless: makeServerless({
        teapot: {
          events: [
            { alb: { conditions: { path: '/teapot', method: ['GET'] } } },
          ],
        },
      }),
      onRequest,
    })
    await server.start()
    try {
      const res = await server.inject({ method: 'GET', url: '/teapot' })
      expect(res.statusCode).toBe(418)
      expect(res.payload).toBe('{"msg":"teapot"}')
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })
})
