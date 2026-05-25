import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { registerAuthSchemes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/register-schemes.js'

function makeServerless(functions = {}, apiKeys = []) {
  return {
    service: {
      provider: { apiGateway: { apiKeys } },
      functions,
    },
  }
}

function makeLambdas(map = {}) {
  return { get: (name) => map[name] }
}

describe('registerAuthSchemes', () => {
  it('registers the api-key scheme + strategy when any route is private', async () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({
        list: {
          events: [{ http: { method: 'GET', path: '/p', private: true } }],
        },
      }),
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
    })
    expect(result.privateStrategy).toBe('api-key')
    expect(result.authorizerStrategies.size).toBe(0)
    expect(server.auth.settings.default).toBeNull()
    // The strategy must exist so route options can reference it.
    expect(() =>
      server.route({
        method: 'GET',
        path: '/x',
        options: { auth: 'api-key' },
        handler: () => 'x',
      }),
    ).not.toThrow()
  })

  it('does NOT register the api-key strategy when no private routes', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({
        list: { events: [{ http: { method: 'GET', path: '/p' } }] },
      }),
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
    })
    expect(result.privateStrategy).toBeNull()
    expect(() =>
      server.route({
        method: 'GET',
        path: '/x',
        options: { auth: 'api-key' },
        handler: () => 'x',
      }),
    ).toThrow()
  })

  it('registers one strategy per unique authorizer reference', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const auth = { invoke: jest.fn(async () => 'Unauthorized') }
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({
        authFn: { events: [] },
        a: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/a',
                authorizer: { name: 'authFn', type: 'TOKEN' },
              },
            },
            {
              http: {
                method: 'GET',
                path: '/b',
                authorizer: { name: 'authFn', type: 'TOKEN' },
              },
            },
          ],
        },
      }),
      lambdas: makeLambdas({ authFn: auth }),
      stage: 'dev',
      accountId: '000000000000',
    })
    expect(result.authorizerStrategies.size).toBe(1)
    expect(result.authorizerStrategies.get('authFn')).toBe(
      'lambda-authorizer:authFn',
    )
  })

  it('logs and skips an authorizer whose target Lambda is not registered', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = registerAuthSchemes({
        server,
        serverless: makeServerless({
          a: {
            events: [
              {
                http: {
                  method: 'GET',
                  path: '/a',
                  authorizer: { name: 'missing' },
                },
              },
            ],
          },
        }),
        lambdas: makeLambdas({}),
        stage: 'dev',
        accountId: '000000000000',
      })
      expect(result.authorizerStrategies.size).toBe(0)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('logs the auto-generated API key once', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    try {
      registerAuthSchemes({
        server,
        serverless: makeServerless({
          a: {
            events: [{ http: { method: 'GET', path: '/a', private: true } }],
          },
        }),
        lambdas: makeLambdas(),
        stage: 'dev',
        accountId: '000000000000',
      })
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /Key with token: 'd41d8cd98f00b204e9800998ecf8427e'/,
        ),
      )
    } finally {
      logSpy.mockRestore()
    }
  })
})

describe('registerAuthSchemes — HTTP API v2', () => {
  it('returns v2AuthorizerStrategies Map (empty when no v2 routes)', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({}),
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
    })
    expect(result.v2AuthorizerStrategies).toBeInstanceOf(Map)
    expect(result.v2AuthorizerStrategies.size).toBe(0)
  })

  it('registers a JWT strategy when an httpApi authorizer has issuerUrl', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({
        a: {
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/p',
                authorizer: {
                  name: 'jwt-1',
                  issuerUrl: 'https://i',
                  audience: ['c'],
                },
              },
            },
          ],
        },
      }),
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
    })
    expect(result.v2AuthorizerStrategies.get('jwt-1')).toBe('jwt:jwt-1')
    expect(() =>
      server.route({
        method: 'GET',
        path: '/x',
        options: { auth: 'jwt:jwt-1' },
        handler: () => 'x',
      }),
    ).not.toThrow()
  })

  it('registers a v2 Lambda strategy when an httpApi authorizer has only a name', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({
        authFn: { events: [] },
        a: {
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/p',
                authorizer: { name: 'authFn' },
              },
            },
          ],
        },
      }),
      lambdas: makeLambdas({ authFn: { invoke: jest.fn() } }),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
    })
    expect(result.v2AuthorizerStrategies.get('authFn')).toBe(
      'lambda-authorizer:v2:authFn',
    )
  })

  it('throws OFFLINE_HTTPAPI_AUTHORIZER_TOKEN_UNSUPPORTED when type is token on httpApi', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    let caught
    try {
      registerAuthSchemes({
        server,
        serverless: makeServerless({
          a: {
            events: [
              {
                httpApi: {
                  method: 'GET',
                  path: '/p',
                  authorizer: { name: 'x', type: 'token' },
                },
              },
            ],
          },
        }),
        lambdas: makeLambdas(),
        stage: 'dev',
        accountId: '000000000000',
        domainName: 'localhost',
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()
    expect(caught.code).toBe('OFFLINE_HTTPAPI_AUTHORIZER_TOKEN_UNSUPPORTED')
    expect(caught.message).toContain('"a"')
  })

  it('warns and skips a v2 Lambda authorizer whose function is not registered', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = registerAuthSchemes({
        server,
        serverless: makeServerless({
          a: {
            events: [
              {
                httpApi: {
                  method: 'GET',
                  path: '/p',
                  authorizer: { name: 'missing' },
                },
              },
            ],
          },
        }),
        lambdas: makeLambdas({}),
        stage: 'dev',
        accountId: '000000000000',
        domainName: 'localhost',
      })
      expect(result.v2AuthorizerStrategies.size).toBe(0)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('resolves provider-level provider.httpApi.authorizers[name] as the base JWT config', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: {
        service: {
          provider: {
            httpApi: {
              authorizers: {
                'jwt-prov': {
                  type: 'jwt',
                  issuerUrl: 'https://issuer.example.com',
                  audience: ['my-aud'],
                  identitySource: '$request.header.Authorization',
                },
              },
            },
          },
          functions: {
            a: {
              events: [
                {
                  httpApi: {
                    method: 'GET',
                    path: '/p',
                    authorizer: { name: 'jwt-prov' },
                  },
                },
              ],
            },
          },
        },
      },
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
    })
    expect(result.v2AuthorizerStrategies.get('jwt-prov')).toBe('jwt:jwt-prov')
  })

  it('per-event inline fields override provider-level when both are present', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: {
        service: {
          provider: {
            httpApi: {
              authorizers: {
                'jwt-1': {
                  type: 'jwt',
                  issuerUrl: 'https://provider-issuer',
                  audience: ['provider-aud'],
                },
              },
            },
          },
          functions: {
            a: {
              events: [
                {
                  httpApi: {
                    method: 'GET',
                    path: '/p',
                    authorizer: {
                      name: 'jwt-1',
                      audience: ['event-aud'],
                    },
                  },
                },
              ],
            },
          },
        },
      },
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
    })
    expect(result.v2AuthorizerStrategies.get('jwt-1')).toBe('jwt:jwt-1')
  })

  it('warns and skips when name-only reference cannot be resolved (no provider entry)', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = registerAuthSchemes({
        server,
        serverless: makeServerless({
          a: {
            events: [
              {
                httpApi: {
                  method: 'GET',
                  path: '/p',
                  authorizer: { name: 'phantom' },
                },
              },
            ],
          },
        }),
        lambdas: makeLambdas(),
        stage: 'dev',
        accountId: '000000000000',
        domainName: 'localhost',
      })
      expect(result.v2AuthorizerStrategies.size).toBe(0)
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('deduplicates JWT strategies across multiple routes that share the same authorizer name', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({
        a: {
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/p1',
                authorizer: {
                  name: 'jwt-1',
                  issuerUrl: 'https://i',
                  audience: ['c'],
                },
              },
            },
            {
              httpApi: {
                method: 'GET',
                path: '/p2',
                authorizer: {
                  name: 'jwt-1',
                  issuerUrl: 'https://i',
                  audience: ['c'],
                },
              },
            },
          ],
        },
      }),
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
    })
    expect(result.v2AuthorizerStrategies.size).toBe(1)
  })
})

describe('registerAuthSchemes — customAuthenticationProvider', () => {
  function makeCustomAuthStrategy(name = 'custom-auth') {
    return {
      name,
      scheme: `${name}-scheme`,
      getAuthenticateFunction: () => ({
        authenticate: (_request, h) => h.unauthenticated(new Error('nope')),
      }),
    }
  }

  it('registers the custom scheme + strategy when customAuthStrategy is provided; both maps have the name', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const customAuthStrategy = makeCustomAuthStrategy('my-custom')
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({}),
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      customAuthStrategy,
    })
    expect(result.authorizerStrategies.get('my-custom')).toBe('my-custom')
    expect(result.v2AuthorizerStrategies.get('my-custom')).toBe('my-custom')
    expect(() =>
      server.route({
        method: 'GET',
        path: '/x',
        options: { auth: 'my-custom' },
        handler: () => 'x',
      }),
    ).not.toThrow()
  })

  it('does NOT touch the maps when customAuthStrategy is null', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({}),
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      customAuthStrategy: null,
    })
    expect(result.authorizerStrategies.size).toBe(0)
    expect(result.v2AuthorizerStrategies.size).toBe(0)
  })

  it('custom-auth name takes precedence over a colliding REST v1 Lambda authorizer name', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const customAuthStrategy = makeCustomAuthStrategy('sharedName')
    const result = registerAuthSchemes({
      server,
      serverless: makeServerless({
        sharedName: { events: [] },
        a: {
          events: [
            {
              http: {
                method: 'GET',
                path: '/p',
                authorizer: { name: 'sharedName', type: 'TOKEN' },
              },
            },
          ],
        },
      }),
      lambdas: makeLambdas({ sharedName: { invoke: jest.fn() } }),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      customAuthStrategy,
    })
    expect(result.authorizerStrategies.get('sharedName')).toBe('sharedName')
    // The colliding Lambda authorizer strategy must NOT have been registered.
    expect(() =>
      server.route({
        method: 'GET',
        path: '/x',
        options: { auth: 'lambda-authorizer:sharedName' },
        handler: () => 'x',
      }),
    ).toThrow()
  })

  it('custom-auth name takes precedence over a colliding HTTP API v2 JWT authorizer name', () => {
    const server = Hapi.server({ host: 'localhost', port: 0 })
    const customAuthStrategy = makeCustomAuthStrategy('sharedName')
    const result = registerAuthSchemes({
      server,
      serverless: {
        service: {
          provider: {
            httpApi: {
              authorizers: {
                sharedName: {
                  type: 'jwt',
                  issuerUrl: 'https://issuer.example.com',
                  audience: ['my-aud'],
                },
              },
            },
          },
          functions: {
            a: {
              events: [
                {
                  httpApi: {
                    method: 'GET',
                    path: '/p',
                    authorizer: { name: 'sharedName' },
                  },
                },
              ],
            },
          },
        },
      },
      lambdas: makeLambdas(),
      stage: 'dev',
      accountId: '000000000000',
      domainName: 'localhost',
      customAuthStrategy,
    })
    expect(result.v2AuthorizerStrategies.get('sharedName')).toBe('sharedName')
    // The colliding JWT strategy must NOT have been registered.
    expect(() =>
      server.route({
        method: 'GET',
        path: '/x',
        options: { auth: 'jwt:sharedName' },
        handler: () => 'x',
      }),
    ).toThrow()
  })
})
