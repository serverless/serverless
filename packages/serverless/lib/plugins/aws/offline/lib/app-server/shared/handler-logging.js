/**
 * Unified error-logging path for the REST and HTTP API route loaders.
 *
 * Framework v3 exposes `serverless.serverlessLog` — a structured logger
 * routed through the CLI's output system, which respects `--verbose` and
 * the JSON output mode. When that's available we prefer it; otherwise we
 * fall back to `console.error` so test fixtures and direct programmatic
 * uses still surface the message.
 *
 * Centralizing the dance means every offline route handler emits a
 * consistent message shape, and a future shift to `@serverless/util/log`
 * is a single-file change.
 *
 * @param {object} serverless        Framework's serverless instance.
 * @param {string} functionKey       The function key the error originated in.
 * @param {Error}  err               The thrown error.
 */
export function logHandlerError(serverless, functionKey, err) {
  if (typeof serverless?.serverlessLog === 'function') {
    serverless.serverlessLog(`Error in ${functionKey}: ${err.message}`)
    return
  }
  console.error(`[offline] Error in ${functionKey}:`, err)
}
