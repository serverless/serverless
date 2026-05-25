/**
 * App server for sls offline.
 *
 * Boots a Hapi v21 server on `appPort` that serves user traffic (HTTP API,
 * ALB, WebSocket, …).  This server is intentionally separate from the
 * AWS-API server — Hapi v21 removed multi-connection support in favour of
 * independent server instances.
 *
 * The caller is responsible for:
 *  - Registering routes via the `registerRoutes` callback.
 *  - Stopping the server during teardown: `server.stop({ timeout: 5000 })`.
 */

import Hapi from '@hapi/hapi'
import { DEFAULT_APP_PORT, DEFAULT_HOST } from '../constants.js'

/**
 * Create and start a Hapi server that handles application traffic.
 *
 * Routes are registered by the caller via `registerRoutes(server)` which is
 * awaited **before** `server.start()`.  This allows the integration layer to
 * attach HTTP API routes, ALB routes, WebSocket routes, etc. without this
 * module knowing about any of their shapes.
 *
 * @param {object} opts
 *
 * @param {number} [opts.appPort=DEFAULT_APP_PORT]
 *   TCP port to listen on.  Pass `0` to let the OS assign a random port
 *   (required by the cross-cutting random-port policy in integration tests).
 *
 * @param {string} [opts.host=DEFAULT_HOST]
 *   Interface to bind.  Defaults to loopback so the server is not reachable
 *   from outside the machine.
 *
 * @param {{ notice?: (msg: string) => void }} [opts.logger]
 *   Optional logger instance (e.g. from `@serverless/util` via `log.get(...)`).
 *   Currently unused — the bound URL is exposed via the returned server's
 *   `server.info.uri` so the boot summary can include it alongside the
 *   route table.  Accepted for future use (e.g. per-request access logs).
 *
 * @param {(server: import('@hapi/hapi').Server) => Promise<void>} opts.registerRoutes
 *   Async callback invoked with the Hapi server instance before
 *   `server.start()`.  The integration layer uses this to call
 *   `registerHttpApiRoutes(...)`, `registerAlbRoutes(...)`, etc.
 *
 * @returns {Promise<import('@hapi/hapi').Server>}
 *   The started Hapi server instance.  Register teardown with
 *   `server.stop({ timeout: 5000 })` via the orchestrator.
 *
 * @throws {TypeError} If `registerRoutes` is not a function.
 */
export async function createAppServer({
  appPort = DEFAULT_APP_PORT,
  host = DEFAULT_HOST,
  logger,
  registerRoutes,
} = {}) {
  if (typeof registerRoutes !== 'function') {
    throw new TypeError(
      'createAppServer: registerRoutes must be a function, got ' +
        typeof registerRoutes,
    )
  }

  const server = Hapi.server({ host, port: appPort })

  await registerRoutes(server)

  await server.start()

  return server
}
