/**
 * Hapi-based AWS API server for sls offline.
 *
 * Boots a single Hapi server that listens on `awsApiPort` and dispatches
 * incoming requests to per-service handlers using the Authorization-header
 * routing strategy defined in dispatcher.js.
 */

import Hapi from '@hapi/hapi'
import { DEFAULT_AWS_API_PORT } from '../constants.js'
import { detectService } from './dispatcher.js'

/**
 * Create and start a Hapi server that acts as a local AWS endpoint.
 *
 * All requests arrive at the single catch-all route `* /{any*}`.  The
 * dispatcher inspects the SigV4 Authorization header to determine the target
 * AWS service, then the call is forwarded to the matching entry in
 * `handlers`.
 *
 * @param {{
 *   awsApiPort?: number,
 *   host?: string,
 *   handlers?: Record<string, (request: object, h: object) => unknown>,
 *   logger?: { debug?: (data: object) => void },
 * }} options
 *
 * @param {number}  [options.awsApiPort=DEFAULT_AWS_API_PORT]
 *   TCP port to listen on.  Pass `0` to let the OS assign a random port
 *   (required by the cross-cutting random-port policy in integration tests).
 *
 * @param {string}  [options.host='localhost']
 *   Interface to bind.  Defaults to loopback so the server is not reachable
 *   from outside the machine.
 *
 * @param {Record<string, (request: object, h: object) => unknown>} [options.handlers={}]
 *   Map of service name → Hapi route handler function.
 *   Example: `{ sqs: async (request, h) => h.response({}).code(200) }`.
 *   Only services listed here will be served; others return 501.
 *
 * @param {{ debug?: (data: object) => void }} [options.logger]
 *   A logger instance (e.g. from `@serverless/util`).  Only `debug` is
 *   called by the server itself; the parameter is optional.
 *
 * @returns {Promise<import('@hapi/hapi').Server>}
 *   The started Hapi server.  Register teardown via
 *   `server.stop({ timeout: 5000 })`.
 */
export async function createAwsApiServer({
  awsApiPort = DEFAULT_AWS_API_PORT,
  host = 'localhost',
  handlers = {},
  logger,
} = {}) {
  const server = Hapi.server({ host, port: awsApiPort })

  server.route({
    method: '*',
    path: '/{any*}',
    async handler(request, h) {
      const service = detectService(request)

      if (!service) {
        logger?.debug?.({
          msg: 'unrouted-request',
          headers: request.headers,
        })
        return h
          .response({
            error: {
              code: 'OFFLINE_UNROUTED_REQUEST',
              message: 'Could not determine AWS service from request',
            },
          })
          .code(400)
      }

      const handler = handlers[service]
      if (!handler) {
        return h
          .response({
            error: {
              code: 'OFFLINE_UNSUPPORTED_SERVICE',
              message: `Service "${service}" is not handled in this build.`,
            },
          })
          .code(501)
      }

      return await handler(request, h)
    },
  })

  await server.start()

  return server
}
