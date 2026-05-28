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
import { registerRuntimeApiRoutes } from './runtime-api-routes.js'
import { registerLambdaInvokeRoutes } from './lambda-invoke/routes.js'

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
 *   Optional logger instance (e.g. from `@serverless/util`).  `debug` is
 *   called on unrouted requests.  The bound URL is exposed via the
 *   returned server's `server.info.uri` so the boot summary can include
 *   it alongside the route table.
 *
 * @param {{ queue: object }} [options.runtimeApi]
 *   When present, registers the AWS Lambda Runtime API routes
 *   (`/runtime/{functionKey}/2018-06-01/runtime/invocation/...`) BEFORE
 *   the catch-all so they take precedence in Hapi's match table. Required
 *   when any function in the service uses the Go runtime; can be omitted
 *   otherwise. `queue` is the shared invocation queue created by
 *   `createInvocationQueue()`.
 *
 * @param {{
 *   getLambdaFunction: (functionKey: string) => { invoke: (event: unknown, options?: object) => Promise<unknown> },
 *   functionNameMap: Map<string, string>,
 * }} [options.lambdaInvoke]
 *   When present, registers the Lambda Invoke API routes
 *   (`/2015-03-31/functions/{name}/invocations` and
 *   `/2014-11-13/functions/{name}/invoke-async`) BEFORE the catch-all so
 *   the specific paths take precedence over `* /{any*}`. `functionNameMap`
 *   maps each function's deployed name to its key; `getLambdaFunction`
 *   returns the invoke facade for a key.
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
  runtimeApi,
  lambdaInvoke,
} = {}) {
  const server = Hapi.server({ host, port: awsApiPort })

  // Runtime API routes (when supplied) must register BEFORE the catch-all
  // so Hapi's match table prefers the specific Lambda paths over `* /{any*}`.
  if (runtimeApi?.queue) {
    registerRuntimeApiRoutes(server, { queue: runtimeApi.queue })
  }

  // Lambda Invoke routes (when supplied) likewise register BEFORE the
  // catch-all so the specific invocation paths win the match table.
  if (lambdaInvoke?.getLambdaFunction && lambdaInvoke?.functionNameMap) {
    registerLambdaInvokeRoutes(server, {
      getLambdaFunction: lambdaInvoke.getLambdaFunction,
      functionNameMap: lambdaInvoke.functionNameMap,
      logger,
    })
  }

  server.route({
    method: '*',
    path: '/{any*}',
    options: {
      payload: {
        parse: true,
        // Override the incoming Content-Type so Hapi always runs the JSON
        // parser, regardless of what the AWS SDK sent (e.g.
        // "application/x-amz-json-1.0").  No `allow` list is set so that
        // any Content-Type is accepted at the gate; `override` already
        // normalises it to application/json before parsing.
        override: 'application/json',
        maxBytes: 10 * 1024 * 1024, // 10 MB cap (AWS SQS limit is 256 KB; 10 MB is safely above)
      },
    },
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
