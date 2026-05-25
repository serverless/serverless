import Hapi from '@hapi/hapi'
import { createApiKeyScheme } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/authorizers/api-key-scheme.js'

function makeStore(keys) {
  return { keys: new Set(keys), generated: false }
}

async function makeServer(store) {
  const server = Hapi.server({ host: 'localhost', port: 0 })
  server.auth.scheme('api-key', createApiKeyScheme({ store }))
  server.auth.strategy('api-key', 'api-key')
  server.route({
    method: 'GET',
    path: '/p',
    options: { auth: 'api-key' },
    handler: (request) => ({ ok: true, key: request.auth.credentials.apiKey }),
  })
  await server.initialize()
  return server
}

describe('api-key Hapi auth scheme', () => {
  it('200s when x-api-key matches a configured key', async () => {
    const server = await makeServer(makeStore(['k1']))
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { 'x-api-key': 'k1' },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload)).toEqual({ ok: true, key: 'k1' })
    } finally {
      await server.stop()
    }
  })

  it('403s with Forbidden envelope when x-api-key is missing', async () => {
    const server = await makeServer(makeStore(['k1']))
    try {
      const res = await server.inject({ method: 'GET', url: '/p' })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.payload)).toEqual({ message: 'Forbidden' })
      expect(res.headers['x-amzn-errortype']).toBe('ForbiddenException')
      expect(res.headers['content-type']).toContain('application/json')
    } finally {
      await server.stop()
    }
  })

  it('403s with Forbidden envelope when x-api-key value is wrong', async () => {
    const server = await makeServer(makeStore(['k1']))
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { 'x-api-key': 'wrong' },
      })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.payload)).toEqual({ message: 'Forbidden' })
    } finally {
      await server.stop()
    }
  })

  it('header lookup is case-insensitive (Hapi lowercases headers)', async () => {
    const server = await makeServer(makeStore(['k1']))
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/p',
        headers: { 'X-Api-Key': 'k1' },
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.stop()
    }
  })
})
