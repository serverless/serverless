import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { WebSocket } from 'ws'
import { createWebSocketServer } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/websocket/server.js'
import { createConnectionRegistry } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/websocket/connection-registry.js'

function makeServerless(functions = {}) {
  return { service: { functions } }
}

async function setup({
  functions = {},
  authStrategies,
  onRequest = jest.fn(async () => ({ statusCode: 200 })),
  webSocketHardTimeout,
  webSocketIdleTimeout,
}) {
  const hapiServer = Hapi.server({ host: 'localhost', port: 0 })
  const registry = createConnectionRegistry()
  const wsServer = createWebSocketServer({
    hapiServer,
    serverless: makeServerless(functions),
    onRequest,
    authStrategies,
    registry,
    stage: 'dev',
    accountId: '000000000000',
    region: 'us-east-1',
    webSocketHardTimeout,
    webSocketIdleTimeout,
  })
  await hapiServer.start()
  const url = `ws://localhost:${hapiServer.info.port}/dev`
  return { hapiServer, wsServer, registry, onRequest, url }
}

async function teardown({ hapiServer, wsServer }) {
  await wsServer.stop()
  await hapiServer.stop({ timeout: 5000 })
}

function connectWs(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
    ws.once('unexpected-response', (req, res) => {
      reject(new Error(`unexpected-response ${res.statusCode}`))
    })
  })
}

function waitMessage(ws) {
  return new Promise((resolve) =>
    ws.once('message', (data) => resolve(data.toString())),
  )
}

function waitClose(ws) {
  return new Promise((resolve) =>
    ws.once('close', (code, reason) =>
      resolve({ code, reason: reason.toString() }),
    ),
  )
}

describe('WebSocket server — connect lifecycle', () => {
  it('accepts an upgrade and invokes the $connect handler', async () => {
    const ctx = await setup({
      functions: {
        onConnect: { events: [{ websocket: '$connect' }] },
      },
    })
    try {
      const ws = await connectWs(ctx.url)
      expect(ctx.onRequest).toHaveBeenCalledWith(
        'onConnect',
        expect.objectContaining({
          requestContext: expect.objectContaining({
            routeKey: '$connect',
            eventType: 'CONNECT',
          }),
        }),
      )
      // Registry should contain the connection.
      const records = Array.from(ctx.registry.all())
      expect(records).toHaveLength(1)
      ws.close()
    } finally {
      await teardown(ctx)
    }
  })

  it('rejects the upgrade when $connect handler returns 4xx', async () => {
    const ctx = await setup({
      functions: {
        onConnect: { events: [{ websocket: '$connect' }] },
      },
      onRequest: jest.fn(async () => ({ statusCode: 403 })),
    })
    try {
      await expect(connectWs(ctx.url)).rejects.toThrow(/403/)
    } finally {
      await teardown(ctx)
    }
  })

  it('accepts the upgrade when no $connect route is registered', async () => {
    const ctx = await setup({ functions: {} })
    try {
      const ws = await connectWs(ctx.url)
      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()
    } finally {
      await teardown(ctx)
    }
  })
})

describe('WebSocket server — message dispatch', () => {
  it('dispatches incoming message via body.action to matching route', async () => {
    const handlerCalls = []
    const ctx = await setup({
      functions: {
        broadcast: { events: [{ websocket: { route: 'broadcast' } }] },
      },
      onRequest: jest.fn(async (fnKey, event) => {
        handlerCalls.push({ fnKey, event })
        return { statusCode: 200 }
      }),
    })
    try {
      const ws = await connectWs(ctx.url)
      ws.send('{"action":"broadcast","msg":"hi"}')
      await new Promise((r) => setTimeout(r, 50))
      const match = handlerCalls.find(
        (c) => c.event?.requestContext?.routeKey === 'broadcast',
      )
      expect(match).toBeDefined()
      expect(match.fnKey).toBe('broadcast')
      expect(match.event.body).toBe('{"action":"broadcast","msg":"hi"}')
      ws.close()
    } finally {
      await teardown(ctx)
    }
  })

  it('falls back to $default when body.action is missing', async () => {
    const handlerCalls = []
    const ctx = await setup({
      functions: {
        defaulted: { events: [{ websocket: '$default' }] },
      },
      onRequest: jest.fn(async (fnKey, event) => {
        handlerCalls.push({ fnKey, event })
        return { statusCode: 200 }
      }),
    })
    try {
      const ws = await connectWs(ctx.url)
      ws.send('plain text not JSON')
      await new Promise((r) => setTimeout(r, 50))
      const match = handlerCalls.find(
        (c) => c.event?.requestContext?.routeKey === '$default',
      )
      expect(match).toBeDefined()
      ws.close()
    } finally {
      await teardown(ctx)
    }
  })

  it('falls back to $default when body.action does not match any route', async () => {
    const handlerCalls = []
    const ctx = await setup({
      functions: {
        defaulted: { events: [{ websocket: '$default' }] },
      },
      onRequest: jest.fn(async (fnKey, event) => {
        handlerCalls.push({ fnKey, event })
        return { statusCode: 200 }
      }),
    })
    try {
      const ws = await connectWs(ctx.url)
      ws.send('{"action":"unknownAction"}')
      await new Promise((r) => setTimeout(r, 50))
      const match = handlerCalls.find(
        (c) => c.event?.requestContext?.routeKey === '$default',
      )
      expect(match).toBeDefined()
      ws.close()
    } finally {
      await teardown(ctx)
    }
  })

  it('drops messages silently when no route + no $default', async () => {
    const handlerCalls = []
    const ctx = await setup({
      functions: {
        only: { events: [{ websocket: { route: 'specific' } }] },
      },
      onRequest: jest.fn(async (fnKey, event) => {
        handlerCalls.push({ fnKey, event })
        return { statusCode: 200 }
      }),
    })
    try {
      const ws = await connectWs(ctx.url)
      ws.send('{"action":"unknownAction"}')
      await new Promise((r) => setTimeout(r, 50))
      const messageCalls = handlerCalls.filter(
        (c) => c.event?.requestContext?.eventType === 'MESSAGE',
      )
      expect(messageCalls).toHaveLength(0)
      ws.close()
    } finally {
      await teardown(ctx)
    }
  })
})

describe('WebSocket server — disconnect', () => {
  it('removes from registry + invokes $disconnect handler on close', async () => {
    const handlerCalls = []
    const ctx = await setup({
      functions: {
        onDisconnect: { events: [{ websocket: '$disconnect' }] },
      },
      onRequest: jest.fn(async (fnKey, event) => {
        handlerCalls.push({ fnKey, event })
        return { statusCode: 200 }
      }),
    })
    try {
      const ws = await connectWs(ctx.url)
      await new Promise((r) => setTimeout(r, 50)) // let registry settle
      ws.close()
      await new Promise((r) => setTimeout(r, 100))
      const records = Array.from(ctx.registry.all())
      expect(records).toHaveLength(0)
      const disconnectCall = handlerCalls.find(
        (c) => c.event?.requestContext?.eventType === 'DISCONNECT',
      )
      expect(disconnectCall).toBeDefined()
    } finally {
      await teardown(ctx)
    }
  })
})

describe('WebSocket server — timeouts', () => {
  it('closes idle connections after webSocketIdleTimeout seconds', async () => {
    const ctx = await setup({
      webSocketHardTimeout: 5,
      webSocketIdleTimeout: 0.05,
    })
    try {
      const ws = await connectWs(ctx.url)
      const close = await waitClose(ws)
      expect(close).toEqual({
        code: 1001,
        reason: 'WebSocket idle timeout exceeded',
      })
    } finally {
      await teardown(ctx)
    }
  })

  it('closes connections after webSocketHardTimeout even if they are active', async () => {
    const ctx = await setup({
      webSocketHardTimeout: 0.05,
      webSocketIdleTimeout: 5,
    })
    try {
      const ws = await connectWs(ctx.url)
      ws.send('still active')
      const close = await waitClose(ws)
      expect(close).toEqual({
        code: 1001,
        reason: 'WebSocket hard timeout exceeded',
      })
    } finally {
      await teardown(ctx)
    }
  })
})

describe('WebSocket server — authorizer on $connect', () => {
  it('invokes the authorizer before $connect; rejects on deny', async () => {
    const ctx = await setup({
      functions: {
        authFn: { events: [] },
        onConnect: {
          events: [{ websocket: { route: '$connect', authorizer: 'authFn' } }],
        },
      },
      onRequest: jest.fn(async (fnKey) => {
        if (fnKey === 'authFn') {
          return {
            principalId: 'u',
            policyDocument: {
              Statement: [{ Effect: 'Deny', Resource: '*' }],
            },
          }
        }
        return { statusCode: 200 }
      }),
    })
    try {
      await expect(connectWs(ctx.url)).rejects.toThrow(/40[13]/)
    } finally {
      await teardown(ctx)
    }
  })

  it('invokes the authorizer; accepts on allow + invokes $connect', async () => {
    const calls = []
    const ctx = await setup({
      functions: {
        authFn: { events: [] },
        onConnect: {
          events: [{ websocket: { route: '$connect', authorizer: 'authFn' } }],
        },
      },
      onRequest: jest.fn(async (fnKey, event) => {
        calls.push({ fnKey, event })
        if (fnKey === 'authFn') {
          return {
            principalId: 'u',
            policyDocument: {
              Statement: [{ Effect: 'Allow', Resource: event.methodArn }],
            },
            context: { tenant: 'acme' },
          }
        }
        return { statusCode: 200 }
      }),
    })
    try {
      const ws = await connectWs(ctx.url)
      expect(calls.find((c) => c.fnKey === 'authFn')).toBeDefined()
      expect(calls.find((c) => c.fnKey === 'onConnect')).toBeDefined()
      ws.close()
    } finally {
      await teardown(ctx)
    }
  })
})
