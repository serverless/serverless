import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { createV2LambdaAuthorizerScheme } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/v2-lambda-authorizer-scheme.js'

function makeLambdaFunction(impl) {
  return { invoke: jest.fn(impl) }
}

async function setupServer({
  authorizerDef = {
    name: 'auth',
    identitySource: '$request.header.Authorization',
  },
  invokeImpl,
  apigwPath = '/items/{id}',
  routePath = '/items/{id}',
}) {
  const lambdaFunction = makeLambdaFunction(invokeImpl)
  const scheme = createV2LambdaAuthorizerScheme({
    authorizerDef,
    lambdaFunction,
    stage: 'dev',
    accountId: '000000000000',
    domainName: 'offline.execute-api.localhost',
  })
  const server = Hapi.server({ host: 'localhost', port: 0 })
  server.auth.scheme('v2-lambda-authorizer', scheme)
  server.auth.strategy('auth', 'v2-lambda-authorizer')
  server.route({
    method: 'GET',
    path: routePath,
    options: {
      auth: 'auth',
      plugins: { offline: { apigwPath } },
    },
    handler: (request) => ({
      ok: true,
      authorizer: request.auth.credentials.authorizer,
    }),
  })
  await server.initialize()
  return { server, lambdaFunction }
}

describe('v2 lambda-authorizer scheme', () => {
  it('200s on Allow policy, attaches credentials.authorizer = { lambda: context }', async () => {
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
        url: '/items/42',
        headers: { authorization: 'Bearer good' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.authorizer).toEqual({ lambda: { tenantId: 't-7' } })
    } finally {
      await server.stop()
    }
  })

  it('401s when identitySource is missing (Lambda NOT invoked)', async () => {
    const invoke = jest.fn()
    const { server } = await setupServer({ invokeImpl: invoke })
    try {
      const res = await server.inject({ method: 'GET', url: '/items/42' })
      expect(res.statusCode).toBe(401)
      expect(invoke).not.toHaveBeenCalled()
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
        url: '/items/42',
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
        throw new Error('boom')
      },
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/items/42',
        headers: { authorization: 'Bearer x' },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it('403s when policy has no Allow match', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'user-7',
        policyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Resource: 'arn:aws:execute-api:us-east-1:000000000000:other/*',
            },
          ],
        },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/items/42',
        headers: { authorization: 'Bearer x' },
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('403s on explicit Deny', async () => {
    const { server } = await setupServer({
      invokeImpl: async () => ({
        principalId: 'user-7',
        policyDocument: { Statement: [{ Effect: 'Deny', Resource: '*' }] },
      }),
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/items/42',
        headers: { authorization: 'Bearer x' },
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('builds a v2 REQUEST event with version 2.0, routeKey, and routeArn', async () => {
    let captured
    const { server } = await setupServer({
      invokeImpl: async (event) => {
        captured = event
        return {
          principalId: 'u',
          policyDocument: { Statement: [{ Effect: 'Allow', Resource: '*' }] },
        }
      },
    })
    try {
      await server.inject({
        method: 'GET',
        url: '/items/42',
        headers: { authorization: 'Bearer t' },
      })
      expect(captured.version).toBe('2.0')
      expect(captured.type).toBe('REQUEST')
      expect(captured.routeKey).toBe('GET /items/{id}')
      expect(captured.routeArn).toBe(
        'arn:aws:execute-api:us-east-1:000000000000:offline/dev/GET/items/{id}',
      )
      expect(captured.identitySource).toEqual(['Bearer t'])
    } finally {
      await server.stop()
    }
  })
})
