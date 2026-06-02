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
 * Each handler is backed by the long-poll invocation queue: `next` parks
 * until work is available (or the runtime client disconnects), while
 * `response`/`error` resolve the corresponding pending invocation.
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
  server.route({
    method: 'GET',
    path: '/runtime/{functionKey}/2018-06-01/runtime/invocation/next',
    /**
     * Long-poll the invocation queue for the next event targeted at
     * `{functionKey}`. The handler parks on `queue.awaitNext` until an
     * invocation is enqueued, then returns the event payload as the
     * response body alongside the three Lambda Runtime API delivery
     * headers (`Lambda-Runtime-Aws-Request-Id`, `Lambda-Runtime-Deadline-Ms`,
     * `Lambda-Runtime-Invoked-Function-Arn`) and `Content-Type`.
     *
     * `Lambda-Runtime-Trace-Id` is intentionally omitted — there is no
     * X-Ray plumbing in offline mode.
     *
     * If the runtime client disconnects mid-long-poll, the wired
     * `AbortController` aborts the parked `awaitNext` so the waiter is
     * removed from the queue and the resulting `AbortError` propagates —
     * Hapi handles the closed socket and does not attempt to write a body.
     */
    async handler(request, h) {
      const { functionKey } = request.params
      const controller = new AbortController()
      // Pre-abort if the socket is already closed by the time the handler
      // runs: Node only fires `'close'` once, so a late `.once()` listener
      // would never fire and the waiter would leak in the queue.
      const rawReq = request.raw.req
      if (rawReq.closed || rawReq.destroyed) {
        controller.abort()
      } else {
        rawReq.once('close', () => controller.abort())
      }

      const next = await queue.awaitNext(functionKey, {
        signal: controller.signal,
      })

      return h
        .response(JSON.stringify(next.payload))
        .type('application/json')
        .header('Lambda-Runtime-Aws-Request-Id', next.requestId)
        .header('Lambda-Runtime-Deadline-Ms', String(next.deadlineMs))
        .header('Lambda-Runtime-Invoked-Function-Arn', next.invokedFunctionArn)
    },
  })

  server.route({
    method: 'POST',
    path: '/runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/response',
    options: {
      payload: {
        // Receive the raw Buffer so the handler can attempt JSON.parse and
        // gracefully fall back to the raw string for non-JSON bodies.
        // Otherwise Hapi would 400 on a Content-Type/body mismatch before
        // the handler runs.
        parse: false,
        maxBytes: 10 * 1024 * 1024,
      },
    },
    /**
     * Settle an in-flight invocation with the runtime's response body.
     *
     * Behaviour:
     *  - 404 when no in-flight invocation matches `{functionKey, requestId}`
     *    — checked via `queue.has` to avoid silently swallowing late traffic
     *    from a crashed/timed-out runtime.
     *  - Otherwise parse the body: JSON when possible, raw string fallback
     *    for non-JSON bodies, `null` for empty bodies. The parsed value
     *    becomes the resolution value of the original `enqueue()` promise.
     *  - Returns 202 with an empty body, matching the AWS Runtime API spec.
     */
    handler(request, h) {
      const { functionKey, requestId } = request.params
      if (!queue.has(functionKey, requestId)) {
        return h.response().code(404)
      }

      const raw = request.payload
      let parsed = null
      if (raw && raw.length) {
        const text = raw.toString('utf8')
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = text
        }
      }

      queue.resolveInvocation(functionKey, requestId, parsed)
      return h.response().code(202)
    },
  })

  server.route({
    method: 'POST',
    path: '/runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/error',
    options: {
      payload: {
        // Same rationale as POST /response: take the raw Buffer so the
        // handler can attempt JSON.parse and synthesize a minimal
        // `{ errorMessage, errorType }` shape for non-JSON bodies instead
        // of letting Hapi 400 on a Content-Type/body mismatch.
        parse: false,
        maxBytes: 10 * 1024 * 1024,
      },
    },
    /**
     * Settle an in-flight invocation by rejecting it with the runtime's
     * reported error body.
     *
     * Behaviour:
     *  - 404 when no in-flight invocation matches `{functionKey, requestId}`
     *    — checked via `queue.has` to avoid silently swallowing late traffic
     *    from a crashed/timed-out runtime.
     *  - Otherwise parse the body: JSON when possible (AWS spec shape is
     *    `{ errorMessage, errorType, stackTrace? }`, but we accept any JSON
     *    object as-is). For non-JSON or empty bodies we synthesize a
     *    minimal `{ errorMessage, errorType: 'Error' }` so downstream
     *    consumers always see a consistent object. The parsed value
     *    becomes the rejection reason of the original `enqueue()` promise.
     *  - Returns 202 with an empty body, matching the AWS Runtime API spec.
     */
    handler(request, h) {
      const { functionKey, requestId } = request.params
      if (!queue.has(functionKey, requestId)) {
        return h.response().code(404)
      }

      const raw = request.payload
      let parsed = { errorMessage: '', errorType: 'Error' }
      if (raw && raw.length) {
        const text = raw.toString('utf8')
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = { errorMessage: text, errorType: 'Error' }
        }
      }

      queue.rejectInvocation(functionKey, requestId, parsed)
      return h.response().code(202)
    },
  })
}
