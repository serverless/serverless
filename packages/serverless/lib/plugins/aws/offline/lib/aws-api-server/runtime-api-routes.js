/**
 * AWS Lambda Runtime API route registration.
 *
 * Registers the three documented Runtime API endpoints on a Hapi server so a
 * child process embedding an AWS Lambda Runtime SDK (e.g. `aws-lambda-go`'s
 * `lambda.Start`) can poll for work, post results, and post errors. Each
 * route is namespaced by `{functionKey}` so multiple functions can be served
 * concurrently from one Hapi instance.
 *
 * Endpoint map (per https://docs.aws.amazon.com/lambda/latest/dg/runtimes-api.html):
 *  - GET  /runtime/{functionKey}/2018-06-01/runtime/invocation/next
 *  - POST /runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/response
 *  - POST /runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/error
 *
 * The handlers in this scaffold throw `OFFLINE_NOT_IMPLEMENTED` to make
 * accidental hits during early integration immediately visible; subsequent
 * milestones replace each handler body with the real implementation.
 */

/**
 * Register the three Runtime API routes on the supplied Hapi server. Must
 * be called before any catch-all (`* /{any*}`) route is registered so the
 * specific paths take precedence in Hapi's match table.
 *
 * @param {import('@hapi/hapi').Server} server
 * @param {{ queue: import('../runners/invocation-queue.js').createInvocationQueue extends () => infer Q ? Q : never }} options
 *   The invocation queue produced by `createInvocationQueue()`. Each route
 *   forwards into it via `enqueue` / `awaitNext` / `resolveInvocation` /
 *   `rejectInvocation`. Required, even in the scaffold form — keeps the
 *   later route bodies from needing a re-registration step.
 */
export function registerRuntimeApiRoutes(server, { queue }) {
  // The scaffold doesn't read `queue`, but binding it to the closure here
  // keeps the route bodies' future references stable.
  void queue

  server.route({
    method: 'GET',
    path: '/runtime/{functionKey}/2018-06-01/runtime/invocation/next',
    handler: () => {
      const e = new Error('Runtime API GET /invocation/next not implemented')
      e.code = 'OFFLINE_NOT_IMPLEMENTED'
      throw e
    },
  })

  server.route({
    method: 'POST',
    path: '/runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/response',
    handler: () => {
      const e = new Error(
        'Runtime API POST /invocation/{id}/response not implemented',
      )
      e.code = 'OFFLINE_NOT_IMPLEMENTED'
      throw e
    },
  })

  server.route({
    method: 'POST',
    path: '/runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/error',
    handler: () => {
      const e = new Error(
        'Runtime API POST /invocation/{id}/error not implemented',
      )
      e.code = 'OFFLINE_NOT_IMPLEMENTED'
      throw e
    },
  })
}
