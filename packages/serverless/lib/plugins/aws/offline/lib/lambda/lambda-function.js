/**
 * Single invocation entry point for a configured Lambda function.
 *
 * Builds the per-invocation Lambda context object and runtime environment,
 * resolves the handler file path lazily so that bundler plugins which swap
 * `serverless.config.servicePath` (built-in esbuild) or set
 * `custom['serverless-offline'].location` (community `serverless-esbuild`)
 * during the `before:offline:start` hook are honoured, and dispatches the
 * call to the worker-thread runner pool.
 *
 * Created once per function definition during plugin boot; consumed by every
 * trigger source (HTTP API route handler, SQS poller, future REST API, ALB,
 * WebSocket and EventBridge runners) so the context/environment shape stays
 * consistent across event sources.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import { resolve, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { getHandlerBaseDir } from '../handler-base-dir.js'
import { arnFor } from '../provisioner/arn-synth.js'

/** Handler file extensions tried in order. Matches Node's CJS/ESM module loader. */
const HANDLER_EXTENSIONS = ['.js', '.mjs', '.cjs']

/** Real Lambda default memory (MB). */
const DEFAULT_MEMORY_LIMIT_IN_MB = 1024

/** Real Lambda default timeout (seconds). */
const DEFAULT_TIMEOUT_SECONDS = 6

/**
 * Resolves a handler string of the form `<rel-path>.<exportName>` to an
 * absolute file path on disk and the exported function name.
 *
 * Tries `.js`, `.mjs`, `.cjs` in order; falls back to the `.js` path so the
 * runner can surface a clear ENOENT at invocation time rather than at boot.
 *
 * Synchronous on purpose — invoke() is called inside the synchronous SQS
 * subscriber tick, so doing async fs.access there would break the store's
 * synchronous-notification contract.
 *
 * @param {string} handlerString - e.g. `'src/handler.main'`
 * @param {string} baseDir       - Absolute service root (post-bundler swap).
 * @returns {{ handlerPath: string, handlerName: string }}
 */
function resolveHandlerSync(handlerString, baseDir) {
  const lastDot = handlerString.lastIndexOf('.')
  const relPath = handlerString.slice(0, lastDot)
  const handlerName = handlerString.slice(lastDot + 1)

  for (const ext of HANDLER_EXTENSIONS) {
    const candidate = resolve(join(baseDir, relPath + ext))
    try {
      fs.accessSync(candidate, fs.constants.F_OK)
      return { handlerPath: candidate, handlerName }
    } catch {
      // Extension not found — try the next one.
    }
  }

  return {
    handlerPath: resolve(join(baseDir, relPath + '.js')),
    handlerName,
  }
}

/**
 * Creates a Lambda function facade — a single entry point for invoking the
 * function regardless of trigger source.
 *
 * @param {object} params
 * @param {object} params.serverless    - Framework `serverless` instance.
 * @param {string} params.functionKey   - Function key in `service.functions`.
 * @param {object} params.runner        - Worker-thread runner (or compatible) with an `.invoke()` method.
 * @param {object} [params.logger]      - Optional logger; `logger.notice(line)` is called once per
 *                                        invocation with the per-call execution trace
 *                                        `(λ: <functionKey>) RequestId: <id> Duration: X.XX ms Billed Duration: Y ms`.
 *                                        When omitted, no trace is emitted (useful in tests).
 * @param {boolean} [params.noTimeout]   - When `true`, the runner is invoked without a
 *                                        `timeoutMs` so the handler can exceed
 *                                        `functions[].timeout` without being terminated.
 *                                        Useful when stepping through a handler in a debugger.
 * @returns {{
 *   invoke(event: unknown): Promise<unknown>,
 *   readonly functionKey: string,
 * }}
 */
export function createLambdaFunction({
  serverless,
  functionKey,
  runner,
  logger,
  noTimeout = false,
}) {
  /**
   * Emit the per-invocation execution trace. Best-effort: silently no-ops if
   * the logger is absent or its `.notice` method throws.
   *
   * @param {string} awsRequestId
   * @param {number} durationMs Wall-clock duration in milliseconds (sub-ms precision).
   */
  function logExecution(awsRequestId, durationMs) {
    if (!logger || typeof logger.notice !== 'function') return
    const billedMs = Math.ceil(durationMs)
    try {
      logger.notice(
        `(λ: ${functionKey}) RequestId: ${awsRequestId}  Duration: ${durationMs.toFixed(2)} ms  Billed Duration: ${billedMs} ms`,
      )
    } catch {
      // Never propagate a logger fault into the invocation path.
    }
  }

  return {
    get functionKey() {
      return functionKey
    },

    /**
     * Invokes the function with the given event payload.
     *
     * Reads the function definition, provider config, and handler base
     * directory lazily on every call so that:
     *   - bundler plugins swap paths between invocations safely;
     *   - per-invocation context fields (awsRequestId, deadlineMs) are fresh;
     *   - provider/function environment overrides are picked up if mutated
     *     by other plugins.
     *
     * @param {unknown} event
     * @returns {Promise<unknown>}
     */
    async invoke(event) {
      const fn = serverless.service.functions?.[functionKey]
      if (!fn) {
        throw new Error(
          `Function "${functionKey}" not found in service.functions.`,
        )
      }

      const provider = serverless.service.provider ?? {}

      const baseDir = getHandlerBaseDir(serverless)
      const { handlerPath, handlerName } = resolveHandlerSync(
        fn.handler,
        baseDir,
      )

      const timeoutSeconds =
        fn.timeout ?? provider.timeout ?? DEFAULT_TIMEOUT_SECONDS
      const timeoutMs = timeoutSeconds * 1000
      const deadlineMs = Date.now() + timeoutMs

      const memoryLimitInMB = String(
        fn.memorySize ?? provider.memorySize ?? DEFAULT_MEMORY_LIMIT_IN_MB,
      )

      const awsRequestId = crypto.randomUUID()

      const context = {
        functionName: functionKey,
        awsRequestId,
        invokedFunctionArn: arnFor('lambda', functionKey),
        memoryLimitInMB,
        callbackWaitsForEmptyEventLoop: true,
        deadlineMs,
        // Raw handler string — worker-entry sets process.env._HANDLER from it
        // for parity with the real Lambda execution environment.
        handler: fn.handler,
      }

      const environment = {
        ...(provider.environment ?? {}),
        ...(fn.environment ?? {}),
      }

      // Measure wall-clock duration around the runner invocation. Use the
      // monotonic high-resolution clock so NTP adjustments cannot warp the
      // measurement on long-running handlers.
      const startedAt = performance.now()
      try {
        return await runner.invoke({
          functionKey,
          handlerPath,
          handlerName,
          event,
          context,
          environment,
          // When timeout enforcement is disabled, omit timeoutMs entirely so
          // the runner does not arm its termination timer.
          timeoutMs: noTimeout ? undefined : timeoutMs,
        })
      } finally {
        const durationMs = performance.now() - startedAt
        logExecution(awsRequestId, durationMs)
      }
    },
  }
}
