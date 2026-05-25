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
 * @returns {{
 *   invoke(event: unknown): Promise<unknown>,
 *   readonly functionKey: string,
 * }}
 */
export function createLambdaFunction({ serverless, functionKey, runner }) {
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
    invoke(event) {
      const fn = serverless.service.functions?.[functionKey]
      if (!fn) {
        return Promise.reject(
          new Error(
            `Function "${functionKey}" not found in service.functions.`,
          ),
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

      const context = {
        functionName: functionKey,
        awsRequestId: crypto.randomUUID(),
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

      return runner.invoke({
        functionKey,
        handlerPath,
        handlerName,
        event,
        context,
        environment,
        timeoutMs,
      })
    },
  }
}
