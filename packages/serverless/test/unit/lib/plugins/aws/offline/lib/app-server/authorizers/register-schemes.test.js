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
