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
      expect(lambdaFunction.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REQUEST',
          identitySource: ['tok-1'],
        }),
      )
    } finally {
      await server.stop()
    }
  })
})
