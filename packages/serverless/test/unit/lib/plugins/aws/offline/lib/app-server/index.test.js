import { jest } from '@jest/globals'
import { createAppServer } from '../../../../../../../../lib/plugins/aws/offline/lib/app-server/index.js'

/**
 * Build a minimal logger stub that satisfies the app-server's expectations.
 *
 * @returns {{ notice: jest.Mock }}
 */
function makeLogger() {
  return { notice: jest.fn() }
}

let server

afterEach(async () => {
  if (server) {
    await server.stop({ timeout: 5000 })
    server = null
  }
})

// ---------------------------------------------------------------------------
// 1. Server boots on port 0 (OS-assigned port)
// ---------------------------------------------------------------------------

it('1. server boots on OS-assigned port when appPort is 0', async () => {
  server = await createAppServer({
    appPort: 0,
    host: 'localhost',
    logger: makeLogger(),
    registerRoutes: async () => {},
  })

  expect(server).toBeDefined()
  expect(typeof server.stop).toBe('function')
  expect(server.info.port).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// 2. registerRoutes callback runs before server.start(), verified by
//    injecting a request right after createAppServer resolves
// ---------------------------------------------------------------------------

it('2. routes registered via callback are reachable immediately after createAppServer resolves', async () => {
  const callOrder = []

  server = await createAppServer({
    appPort: 0,
    host: 'localhost',
    logger: makeLogger(),
    registerRoutes: async (hapiServer) => {
      callOrder.push('registerRoutes')
      hapiServer.route({
        method: 'GET',
        path: '/ping',
        handler: (_request, h) => h.response({ ok: true }).code(200),
      })
    },
  })

  callOrder.push('createAppServer resolved')

  // The route was registered before server.start() — it must be reachable.
  const res = await server.inject({ method: 'GET', url: '/ping' })
  expect(res.statusCode).toBe(200)
  expect(JSON.parse(res.payload)).toEqual({ ok: true })

  // registerRoutes ran before the promise resolved
  expect(callOrder.indexOf('registerRoutes')).toBeLessThan(
    callOrder.indexOf('createAppServer resolved'),
  )
})

// ---------------------------------------------------------------------------
// 3. Uses the provided host
// ---------------------------------------------------------------------------

it('3. server.info.host matches the provided host option', async () => {
  server = await createAppServer({
    appPort: 0,
    host: '127.0.0.1',
    logger: makeLogger(),
    registerRoutes: async () => {},
  })

  expect(server.info.host).toBe('127.0.0.1')
})

// ---------------------------------------------------------------------------
// 4. logger.notice is called with a message that contains the real port
// ---------------------------------------------------------------------------

it('4. logger.notice is called after start with the actual listening port', async () => {
  const logger = makeLogger()

  server = await createAppServer({
    appPort: 0,
    host: 'localhost',
    logger,
    registerRoutes: async () => {},
  })

  expect(logger.notice).toHaveBeenCalledTimes(1)
  const [msg] = logger.notice.mock.calls[0]
  expect(typeof msg).toBe('string')
  // Must contain the real port (which is > 0 since we passed appPort: 0)
  expect(msg).toContain(String(server.info.port))
})

// ---------------------------------------------------------------------------
// 5. Throws when registerRoutes is not a function
// ---------------------------------------------------------------------------

it('5. throws when registerRoutes is not a function', async () => {
  await expect(
    createAppServer({
      appPort: 0,
      host: 'localhost',
      logger: makeLogger(),
      registerRoutes: 'not-a-function',
    }),
  ).rejects.toThrow()
})
