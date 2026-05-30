import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { createLambdaAuthorizerScheme } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/lambda-authorizer-scheme.js'

function makeLambdaFunction(impl) {
  return { invoke: jest.fn(impl) }
}

async function setupServer({
  authorizerDef = { name: 'auth', type: 'TOKEN' },
  invokeImpl,
}) {
  const lambdaFunction = makeLambdaFunction(invokeImpl)
  const scheme = createLambdaAuthorizerScheme({
    authorizerDef,
    lambdaFunction,
    stage: 'dev',
    accountId: '000000000000',
  })
  const server = Hapi.server({ host: 'localhost', port: 0 })
  server.auth.scheme('lambda-authorizer', scheme)
  server.auth.strategy('auth', 'lambda-authorizer')
  server.route({
    method: 'GET',
    path: '/p',
    options: { auth: 'auth' },
    handler: (request) => ({
      ok: true,
      authorizer: request.auth.credentials.authorizer,
    }),
  })
  await server.initialize()
  return { server, lambdaFunction }
}

describe('lambda-authorizer scheme — TOKEN', () => {
  it('200s on Allow policy, attaches credentials.authorizer = { principalId, ...context }', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'user-7',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
        context: { tenantId: 't-7' },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer good' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.authorizer).toEqual({
        principalId: 'user-7',
        tenantId: 't-7',
      })
    } finally {
      await server.stop()
    }
  })

  it('500s when the authorizer context contains a non-primitive value', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'user-7',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
        context: { nested: {} },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer good' },
      })
      expect(res.statusCode).toBe(500)
      expect(res.headers['x-amzn-errortype']).toBe(
        'AuthorizerConfigurationException',
      )
    } finally {
      await server.stop()
    }
  })

  it('stringifies primitive context values surfaced to the handler', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'user-7',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
        context: { n: 5, b: true },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer good' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.authorizer).toEqual({
        principalId: 'user-7',
        n: '5',
        b: 'true',
      })
    } finally {
      await server.stop()
    }
  })

  it('401s when authorizer returns the literal string "Unauthorized"', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => 'Unauthorized',
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer x' },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('401s when authorizer throws', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => {
        throw new Error('bad token')
      },
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer x' },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('403s when policy has no Allow matching the methodArn', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: {
          Statement: [{ Effect: 'Allow', Resource: 'arn:something-else' }],
        },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer x' },
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('403s when policy has Deny matching the methodArn', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: {
          Statement: [
            { Effect: 'Allow', Resource: '*' },
            { Effect: 'Deny', Resource: '*' },
          ],
        },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer x' },
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('passes the TOKEN event with the request authorization header as authorizationToken', async () => {
    const { server, lambdaFunction } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer tok' },
      })
      expect(lambdaFunction.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TOKEN',
          authorizationToken: 'Bearer tok',
          methodArn: expect.stringMatching(
            /^arn:aws:execute-api:.*\/dev\/GET\/p$/,
          ),
        }),
      )
    } finally {
      await server.stop()
    }
  })

  it('invokes the authorizer when the token matches identityValidationExpression', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'TOKEN',
        identityValidationExpression: '^Bearer .+',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer good' },
      })
      expect(res.statusCode).toBe(200)
      expect(lambdaFunction.invoke).toHaveBeenCalledTimes(1)
    } finally {
      await server.stop()
    }
  })

  it('401s without invoking when the token fails identityValidationExpression', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'TOKEN',
        identityValidationExpression: '^Bearer .+',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'garbage' },
      })
      expect(res.statusCode).toBe(401)
      expect(lambdaFunction.invoke).not.toHaveBeenCalled()
    } finally {
      await server.stop()
    }
  })

  it('ignores an unparseable identityValidationExpression (invokes anyway)', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'TOKEN',
        identityValidationExpression: '[unclosed',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'anything' },
      })
      expect(res.statusCode).toBe(200)
      expect(lambdaFunction.invoke).toHaveBeenCalledTimes(1)
    } finally {
      await server.stop()
    }
  })

  it('reads the configured identitySource header for the authorizationToken', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'TOKEN',
        identitySource: 'method.request.header.X-Custom',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { 'x-custom': 'custom-tok' },
      })
      expect(res.statusCode).toBe(200)
      expect(lambdaFunction.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TOKEN',
          authorizationToken: 'custom-tok',
        }),
      )
    } finally {
      await server.stop()
    }
  })

  it('401s without invoking when the configured identitySource header is missing', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'TOKEN',
        identitySource: 'method.request.header.X-Custom',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      // The default Authorization header is present but must be ignored — the
      // authorizer reads only its configured X-Custom header.
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer ignored' },
      })
      expect(res.statusCode).toBe(401)
      expect(lambdaFunction.invoke).not.toHaveBeenCalled()
    } finally {
      await server.stop()
    }
  })
})

describe('lambda-authorizer scheme — REQUEST', () => {
  it('401s when identitySource resolves to nothing', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'REQUEST',
        identitySource: 'method.request.header.X-Token',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({ method: 'GET', url: '/p' })
      expect(res.statusCode).toBe(401)
      // Authorizer Lambda must NOT have been invoked.
      expect(lambdaFunction.invoke).not.toHaveBeenCalled()
    } finally {
      await server.stop()
    }
  })

  it('invokes the authorizer with a REQUEST event when identitySource resolves', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'REQUEST',
        identitySource: 'method.request.header.X-Token',
      },
      invokeImpl: async () => ({
        principalId: 'u-1',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { 'x-token': 'tok-1' },
      })
      expect(res.statusCode).toBe(200)
      const event = lambdaFunction.invoke.mock.calls[0][0]
      expect(event.type).toBe('REQUEST')
      expect(event).not.toHaveProperty('identitySource')
      expect(event.httpMethod).toBe('GET')
      expect(event.resource).toBe('/p')
      expect(event.path).toBe('/p')
      expect(event.requestContext.resourcePath).toBe('/p')
      expect(event.requestContext.httpMethod).toBe('GET')
      expect(event.requestContext.stage).toBe('dev')
      expect(event.requestContext).not.toHaveProperty('authorizer')
    } finally {
      await server.stop()
    }
  })

  it('sets top-level path stage-stripped and requestContext.path to the full wire path', async () => {
    const lambdaFunction = makeLambdaFunction(async () => ({
      principalId: 'u-1',
      policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
    }))
    const scheme = createLambdaAuthorizerScheme({
      authorizerDef: {
        name: 'auth',
        type: 'REQUEST',
        identitySource: 'method.request.header.X-Token',
      },
      lambdaFunction,
      stage: 'dev',
      accountId: '000000000000',
    })
    const server = Hapi.server({ host: 'localhost', port: 0 })
    server.auth.scheme('lambda-authorizer', scheme)
    server.auth.strategy('auth', 'lambda-authorizer')
    server.route({
      method: 'GET',
      path: '/dev/items/{id}',
      options: {
        auth: 'auth',
        plugins: { offline: { apigwPath: '/items/{id}' } },
      },
      handler: () => ({ ok: true }),
    })
    await server.initialize()
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/dev/items/42',
        headers: { 'x-token': 'tok-1' },
      })
      expect(res.statusCode).toBe(200)
      const event = lambdaFunction.invoke.mock.calls[0][0]
      expect(event.path).toBe('/items/42')
      expect(event.requestContext.path).toBe('/dev/items/42')
    } finally {
      await server.stop()
    }
  })

  it('401s without invoking when one of several identity sources is missing', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'REQUEST',
        identitySource:
          'method.request.header.X-Token, method.request.header.X-Extra',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { 'x-token': 'tok-1' },
      })
      expect(res.statusCode).toBe(401)
      expect(lambdaFunction.invoke).not.toHaveBeenCalled()
    } finally {
      await server.stop()
    }
  })

  it('invokes the authorizer only when every identity source is present', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: {
        name: 'auth',
        type: 'REQUEST',
        identitySource:
          'method.request.header.X-Token, method.request.header.X-Extra',
      },
      invokeImpl: async () => ({
        principalId: 'u',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { 'x-token': 'tok-1', 'x-extra': 'extra-1' },
      })
      expect(res.statusCode).toBe(200)
      expect(lambdaFunction.invoke).toHaveBeenCalledTimes(1)
    } finally {
      await server.stop()
    }
  })

  it('invokes the authorizer with an empty identity when no identitySource is configured', async () => {
    const { server, lambdaFunction } = await setupServer({
      authorizerDef: { name: 'auth', type: 'REQUEST' },
      invokeImpl: async () => ({
        principalId: 'u-9',
        policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({ method: 'GET', url: '/p' })
      expect(res.statusCode).toBe(200)
      // No identity source declared → invoke with an empty identity (NONE),
      // never short-circuit to 401.
      expect(lambdaFunction.invoke).toHaveBeenCalledTimes(1)
      const event = lambdaFunction.invoke.mock.calls[0][0]
      expect(event.type).toBe('REQUEST')
      expect(event).not.toHaveProperty('identitySource')
    } finally {
      await server.stop()
    }
  })
})

describe('lambda-authorizer scheme — usageIdentifierKey', () => {
  it('surfaces a usageIdentifierKey returned by the authorizer in credentials', async () => {
    const lambdaFunction = makeLambdaFunction(async () => ({
      principalId: 'user-7',
      policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
      usageIdentifierKey: 'abc',
    }))
    const scheme = createLambdaAuthorizerScheme({
      authorizerDef: { name: 'auth', type: 'TOKEN' },
      lambdaFunction,
      stage: 'dev',
      accountId: '000000000000',
    })
    const server = Hapi.server({ host: 'localhost', port: 0 })
    server.auth.scheme('lambda-authorizer', scheme)
    server.auth.strategy('auth', 'lambda-authorizer')
    server.route({
      method: 'GET',
      path: '/p',
      options: { auth: 'auth' },
      handler: (request) => ({
        usageIdentifierKey: request.auth.credentials.usageIdentifierKey ?? null,
      }),
    })
    await server.initialize()
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer good' },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).usageIdentifierKey).toBe('abc')
    } finally {
      await server.stop()
    }
  })

  it('omits usageIdentifierKey from credentials when the authorizer returns none', async () => {
    const lambdaFunction = makeLambdaFunction(async () => ({
      principalId: 'user-7',
      policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
    }))
    const scheme = createLambdaAuthorizerScheme({
      authorizerDef: { name: 'auth', type: 'TOKEN' },
      lambdaFunction,
      stage: 'dev',
      accountId: '000000000000',
    })
    const server = Hapi.server({ host: 'localhost', port: 0 })
    server.auth.scheme('lambda-authorizer', scheme)
    server.auth.strategy('auth', 'lambda-authorizer')
    server.route({
      method: 'GET',
      path: '/p',
      options: { auth: 'auth' },
      handler: (request) => ({
        hasKey: 'usageIdentifierKey' in request.auth.credentials,
      }),
    })
    await server.initialize()
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { authorization: 'Bearer good' },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).hasKey).toBe(false)
    } finally {
      await server.stop()
    }
  })
})
