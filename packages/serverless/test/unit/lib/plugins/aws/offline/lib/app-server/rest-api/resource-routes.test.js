import http from 'node:http'
import Hapi from '@hapi/hapi'
import h2o2 from '@hapi/h2o2'
import {
  parseResources,
  registerResourceRoutes,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/resource-routes.js'

describe('parseResources', () => {
  it('returns {} when resources is undefined', () => {
    expect(parseResources(undefined)).toEqual({})
  })

  it('returns {} when Resources is missing', () => {
    expect(parseResources({})).toEqual({})
  })

  it('returns {} when Resources is empty', () => {
    expect(parseResources({ Resources: {} })).toEqual({})
  })

  it('returns {} when there are no Method or Resource entries', () => {
    expect(
      parseResources({
        Resources: {
          MyTable: { Type: 'AWS::DynamoDB::Table', Properties: {} },
        },
      }),
    ).toEqual({})
  })

  it('reconstructs a 2-segment path with Fn::GetAtt root parent', () => {
    // /public/{proxy+}
    // ApiGatewayResourcePublic  parent = Fn::GetAtt [ApiGatewayRestApi, RootResourceId]
    // ApiGatewayResourceProxy   parent = Ref ApiGatewayResourcePublic
    const resources = {
      Resources: {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi', Properties: {} },
        ApiGatewayResourcePublic: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'public',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayResourceProxy: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: '{proxy+}',
            ParentId: { Ref: 'ApiGatewayResourcePublic' },
          },
        },
        ApiGatewayMethodProxyGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceProxy' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/{proxy}',
            },
          },
        },
      },
    }

    expect(parseResources(resources)).toEqual({
      ApiGatewayMethodProxyGet: {
        isProxy: true,
        method: 'GET',
        pathResource: '/public/{proxy+}',
        proxyUri: 'https://example.com/{proxy}',
      },
    })
  })

  it('resolves parent via { Ref } correctly', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceUsers: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'users',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodUsersGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceUsers' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://backend.example.com/users',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodUsersGet.pathResource).toBe('/users')
  })

  it('resolves parent via { Fn::GetAtt } correctly (root resolution)', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceItems: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'items',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodItemsGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'ANY',
            ResourceId: { Ref: 'ApiGatewayResourceItems' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://backend.example.com/items',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodItemsGet.pathResource).toBe('/items')
    expect(result.ApiGatewayMethodItemsGet.method).toBe('ANY')
  })

  it('sets isProxy true and proxyUri for HTTP_PROXY integration', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceFoo: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'foo',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodFooPost: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'POST',
            ResourceId: { Ref: 'ApiGatewayResourceFoo' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/foo',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodFooPost).toEqual({
      isProxy: true,
      method: 'POST',
      pathResource: '/foo',
      proxyUri: 'https://example.com/foo',
    })
  })

  it('sets isProxy false and proxyUri undefined for HTTP (non-proxy) integration', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceBar: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'bar',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodBarGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceBar' },
            Integration: {
              Type: 'HTTP',
              Uri: 'https://example.com/bar',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodBarGet).toEqual({
      isProxy: false,
      method: 'GET',
      pathResource: '/bar',
      proxyUri: undefined,
    })
  })

  it('sets isProxy false and proxyUri undefined for MOCK integration', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceMock: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'mock',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodMockGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceMock' },
            Integration: {
              Type: 'MOCK',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodMockGet).toEqual({
      isProxy: false,
      method: 'GET',
      pathResource: '/mock',
      proxyUri: undefined,
    })
  })

  it('returns {} entry for a method with unresolvable path (missing PathPart)', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceMissingPart: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            // PathPart intentionally omitted
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodMissingGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceMissingPart' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/missing',
            },
          },
        },
      },
    }

    expect(parseResources(resources)).toEqual({
      ApiGatewayMethodMissingGet: {},
    })
  })

  it('carries through the HttpMethod value', () => {
    const resources = {
      Resources: {
        ApiGatewayResourceOrders: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'orders',
            ParentId: { 'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'] },
          },
        },
        ApiGatewayMethodOrdersDelete: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'DELETE',
            ResourceId: { Ref: 'ApiGatewayResourceOrders' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: 'https://example.com/orders',
            },
          },
        },
      },
    }

    const result = parseResources(resources)
    expect(result.ApiGatewayMethodOrdersDelete.method).toBe('DELETE')
  })
})

// ---------------------------------------------------------------------------
// registerResourceRoutes
// ---------------------------------------------------------------------------

describe('registerResourceRoutes', () => {
  /** @type {import('@hapi/hapi').Server} */
  let server
  /** @type {http.Server} */
  let upstream
  let upstreamPort

  /**
   * Tiny upstream HTTP server that echoes back `{ method, url, body }` as JSON.
   */
  function startUpstream() {
    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ method: req.method, url: req.url, body }))
        })
      })
      srv.listen(0, '127.0.0.1', () => {
        resolve(srv)
      })
    })
  }

  beforeEach(async () => {
    upstream = await startUpstream()
    upstreamPort = upstream.address().port

    server = Hapi.server({ port: 0, host: '127.0.0.1' })
    await server.register(h2o2)
  })

  afterEach(async () => {
    await server.stop()
    await new Promise((resolve) => upstream.close(resolve))
  })

  /**
   * Build a resources fixture with:
   *  - one HTTP_PROXY method pointing at the upstream on /public/{proxy+}
   *  - one non-HTTP_PROXY (MOCK) method on /internal
   */
  function makeResources(port) {
    return {
      Resources: {
        ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi', Properties: {} },
        // /public/{proxy+}
        ApiGatewayResourcePublic: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'public',
            ParentId: {
              'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'],
            },
          },
        },
        ApiGatewayResourceProxy: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: '{proxy+}',
            ParentId: { Ref: 'ApiGatewayResourcePublic' },
          },
        },
        ApiGatewayMethodProxyGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceProxy' },
            Integration: {
              Type: 'HTTP_PROXY',
              Uri: `http://127.0.0.1:${port}/up/{proxy}`,
            },
          },
        },
        // /internal — MOCK (non-proxy), should be skipped with a warning
        ApiGatewayResourceInternal: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            PathPart: 'internal',
            ParentId: {
              'Fn::GetAtt': ['ApiGatewayRestApi', 'RootResourceId'],
            },
          },
        },
        ApiGatewayMethodInternalGet: {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: 'GET',
            ResourceId: { Ref: 'ApiGatewayResourceInternal' },
            Integration: { Type: 'MOCK' },
          },
        },
      },
    }
  }

  function makeLogger() {
    return {
      notices: [],
      warnings: [],
      notice(msg) {
        this.notices.push(msg)
      },
      warning(msg) {
        this.warnings.push(msg)
      },
    }
  }

  it('registers a proxy route and forwards requests to the upstream', async () => {
    const resources = makeResources(upstreamPort)
    const logger = makeLogger()

    await registerResourceRoutes(server, {
      resources,
      resourceRoutes: true,
      stage: 'dev',
      prefix: '',
      stageInUrl: true,
      corsConfig: false,
      disableCookieValidation: false,
      logger,
    })

    const res = await server.inject({
      method: 'GET',
      url: '/dev/public/hello?foo=bar',
    })

    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.payload)
    // The upstream should have received the path param substituted in and the
    // query string forwarded.
    expect(payload.url).toBe('/up/hello?foo=bar')
    expect(payload.method).toBe('GET')
  })

  it('passes the query string through to the upstream', async () => {
    const resources = makeResources(upstreamPort)
    const logger = makeLogger()

    await registerResourceRoutes(server, {
      resources,
      resourceRoutes: true,
      stage: 'dev',
      prefix: '',
      stageInUrl: true,
      corsConfig: false,
      disableCookieValidation: false,
      logger,
    })

    const res = await server.inject({
      method: 'GET',
      url: '/dev/public/item?a=1&b=2',
    })

    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.payload)
    expect(payload.url).toContain('?a=1&b=2')
  })

  it('does NOT register a route for the non-proxy method and emits a warning', async () => {
    const resources = makeResources(upstreamPort)
    const logger = makeLogger()

    await registerResourceRoutes(server, {
      resources,
      resourceRoutes: true,
      stage: 'dev',
      prefix: '',
      stageInUrl: true,
      corsConfig: false,
      disableCookieValidation: false,
      logger,
    })

    // The MOCK method's path should not appear in the server route table.
    const routePaths = server.table().map((r) => r.path)
    expect(routePaths).not.toContain('/dev/internal')

    // A warning must have been emitted for the non-proxy method.
    expect(
      logger.warnings.some((w) => w.includes('Only HTTP_PROXY is supported')),
    ).toBe(true)
    expect(logger.warnings.some((w) => w.includes('/internal'))).toBe(true)
  })

  it('respects a per-method URI override from the resourceRoutes map', async () => {
    const resources = makeResources(upstreamPort)
    const logger = makeLogger()

    // Override the proxy URI for ApiGatewayMethodProxyGet to a different path
    // on the same upstream.
    await registerResourceRoutes(server, {
      resources,
      resourceRoutes: {
        ApiGatewayMethodProxyGet: {
          Uri: `http://127.0.0.1:${upstreamPort}/overridden/{proxy}`,
        },
      },
      stage: 'dev',
      prefix: '',
      stageInUrl: true,
      corsConfig: false,
      disableCookieValidation: false,
      logger,
    })

    const res = await server.inject({
      method: 'GET',
      url: '/dev/public/thing',
    })

    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.payload)
    expect(payload.url).toBe('/overridden/thing')
  })

  it('omits the stage prefix when stageInUrl is false', async () => {
    const resources = makeResources(upstreamPort)
    const logger = makeLogger()

    await registerResourceRoutes(server, {
      resources,
      resourceRoutes: true,
      stage: 'dev',
      prefix: '',
      stageInUrl: false,
      corsConfig: false,
      disableCookieValidation: false,
      logger,
    })

    const routePaths = server.table().map((r) => r.path)
    expect(routePaths.some((p) => p.startsWith('/public/'))).toBe(true)
    expect(routePaths.some((p) => p.startsWith('/dev/'))).toBe(false)
  })

  it('logs a notice for each registered route', async () => {
    const resources = makeResources(upstreamPort)
    const logger = makeLogger()

    await registerResourceRoutes(server, {
      resources,
      resourceRoutes: true,
      stage: 'dev',
      prefix: '',
      stageInUrl: true,
      corsConfig: false,
      disableCookieValidation: false,
      logger,
    })

    expect(
      logger.notices.some(
        (n) => n.includes('GET') && n.includes('/dev/public/{proxy*}'),
      ),
    ).toBe(true)
  })
})
