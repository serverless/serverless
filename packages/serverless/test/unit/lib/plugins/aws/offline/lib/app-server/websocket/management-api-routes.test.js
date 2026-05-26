import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { registerManagementApiRoutes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/websocket/management-api-routes.js'

function makeRegistry(records = []) {
  const map = new Map(records.map((r) => [r.connectionId, r]))
  return {
    get(id) {
      return map.get(id)
    },
    remove(id) {
      map.delete(id)
    },
    all() {
      return map.values()
    },
    touch() {},
  }
}

async function makeServer(registry) {
  const server = Hapi.server({ host: 'localhost', port: 0 })
  registerManagementApiRoutes({ hapiServer: server, registry, stage: 'dev' })
  await server.start()
  return server
}

describe('PostToConnection', () => {
  it('200 OK when connection exists; sends body to ws.send()', async () => {
    const sendSpy = jest.fn()
    const registry = makeRegistry([
      {
        connectionId: 'c-1',
        ws: { send: sendSpy, readyState: 1 },
        sourceIp: '1.1.1.1',
        userAgent: 'wscat',
        connectedAt: 100,
        lastActiveAt: 100,
      },
    ])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/dev/@connections/c-1',
        payload: 'hello world',
      })
      expect(res.statusCode).toBe(200)
      expect(sendSpy).toHaveBeenCalledWith('hello world')
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })

  it('410 Gone when connectionId is unknown', async () => {
    const registry = makeRegistry([])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/dev/@connections/missing',
        payload: 'x',
      })
      expect(res.statusCode).toBe(410)
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })

  it('410 Gone when the ws readyState is not OPEN', async () => {
    const registry = makeRegistry([
      {
        connectionId: 'c-1',
        ws: { send: jest.fn(), readyState: 3 /* CLOSED */ },
        sourceIp: '',
        userAgent: '',
        connectedAt: 0,
        lastActiveAt: 0,
      },
    ])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/dev/@connections/c-1',
        payload: 'x',
      })
      expect(res.statusCode).toBe(410)
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })
})

describe('GetConnection', () => {
  it('200 with AWS-shaped metadata when connection exists', async () => {
    const registry = makeRegistry([
      {
        connectionId: 'c-1',
        ws: { readyState: 1 },
        sourceIp: '203.0.113.7',
        userAgent: 'wscat/1.0',
        connectedAt: 1730000000000,
        lastActiveAt: 1730000005000,
      },
    ])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/dev/@connections/c-1',
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.payload)
      expect(body.ConnectedAt).toBe(1730000000000)
      expect(body.LastActiveAt).toBe(1730000005000)
      expect(body.Identity.SourceIp).toBe('203.0.113.7')
      expect(body.Identity.UserAgent).toBe('wscat/1.0')
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })

  it('410 Gone when connectionId is unknown', async () => {
    const registry = makeRegistry([])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/dev/@connections/missing',
      })
      expect(res.statusCode).toBe(410)
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })
})

describe('DeleteConnection', () => {
  it('204 No Content when connection exists; calls ws.close()', async () => {
    const closeSpy = jest.fn()
    const registry = makeRegistry([
      {
        connectionId: 'c-1',
        ws: { close: closeSpy, readyState: 1 },
        sourceIp: '',
        userAgent: '',
        connectedAt: 0,
        lastActiveAt: 0,
      },
    ])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'DELETE',
        url: '/dev/@connections/c-1',
      })
      expect(res.statusCode).toBe(204)
      expect(closeSpy).toHaveBeenCalled()
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })

  it('410 Gone when connectionId is unknown', async () => {
    const registry = makeRegistry([])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'DELETE',
        url: '/dev/@connections/missing',
      })
      expect(res.statusCode).toBe(410)
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })
})

describe('Mount path', () => {
  it('routes are mounted at /<stage>/@connections/{id}', async () => {
    const registry = makeRegistry([])
    const server = Hapi.server({ host: 'localhost', port: 0 })
    registerManagementApiRoutes({
      hapiServer: server,
      registry,
      stage: 'staging',
    })
    await server.start()
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/staging/@connections/missing',
      })
      expect(res.statusCode).toBe(410)
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })

  it('does not intercept other paths', async () => {
    const registry = makeRegistry([])
    const server = await makeServer(registry)
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/elsewhere',
      })
      expect(res.statusCode).toBe(404)
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })
})
