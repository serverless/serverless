/**
 * Hapi-based AWS API server for sls offline.
 *
 * Boots a single Hapi server that listens on `awsApiPort` and exposes the
 * Lambda Invoke API and, when needed, the Lambda Runtime API. Any other
 * path returns a 404.
 */

import Hapi from '@hapi/hapi'
import { DEFAULT_AWS_API_PORT } from '../constants.js'
import { registerRuntimeApiRoutes } from './runtime-api-routes.js'
import { registerLambdaInvokeRoutes } from './lambda-invoke/routes.js'

/**
 * Create and start a Hapi server that acts as a local Lambda endpoint.
 *
 * The Lambda Invoke and (optionally) Lambda Runtime API routes are
 * registered up front; any unmatched path falls through to a terminal
 * catch-all that returns a 404 with an AWS-shaped JSON body.
 *
 * @param {{
 *   awsApiPort?: number,
 *   host?: string,
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
 * @param {{ debug?: (data: object) => void }} [options.logger]
 *   Optional logger instance (e.g. from `@serverless/util`).  The bound URL
 *   is exposed via the returned server's `server.info.uri` so the boot
 *   summary can include it alongside the route table.
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
  logger,
  runtimeApi,
  lambdaInvoke,
} = {}) {
  // AWS SDK clients append a trailing slash to some endpoints (notably the
  // legacy InvokeAsync path), so trailing slashes must be insignificant when
  // matching routes.
  const server = Hapi.server({
    host,
    port: awsApiPort,
    router: { stripTrailingSlash: true },
  })

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

  // Terminal catch-all: any path not claimed by the Lambda Invoke or
  // Runtime API routes above is outside this server's scope. Return a clean
  // AWS-shaped 404 rather than letting Hapi emit its default error. The body
  // is never parsed — non-Lambda callers may use any wire protocol.
  server.route({
    method: '*',
    path: '/{any*}',
    options: {
      payload: {
        parse: false,
        maxBytes: 10 * 1024 * 1024,
      },
    },
    handler(request, h) {
      logger?.debug?.({
        msg: 'unrouted-request',
        headers: request.headers,
      })
      return h
        .response({
          message: 'The requested path is not supported by sls offline.',
        })
        .code(404)
    },
  })

  await server.start()

  return server
}
