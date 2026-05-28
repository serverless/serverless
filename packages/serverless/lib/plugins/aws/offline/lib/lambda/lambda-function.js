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

/**
 * Handler file extensions tried in order, keyed by runtime family.
 *
 * Node entries match Node's CJS/ESM module loader. Single-extension families
 * (Python `.py`, Ruby `.rb`, Go `.go`, Java `.java`) match the single
 * source-file convention each language's child-process wrapper expects. For
 * Go the `.go` extension refers to the source file used by the auto-build
 * path. Java handlers are FQCN strings (`com.example.Class::method`) — the
 * `.java` extension is registered for future watcher source-change detection
 * only; the runner resolves handlers via the user's compiled `.jar`
 * artifact, not via this table.
 */
const HANDLER_EXTENSIONS_BY_RUNTIME = {
  node: ['.js', '.mjs', '.cjs'],
  python: ['.py'],
  ruby: ['.rb'],
  go: ['.go'],
  java: ['.java'],
}

/**
 * Resolve the runtime family from an effective runtime string.
 *
 * The `provided.al{,2}` family is treated as Go for handler-extension
 * purposes — that's the canonical runtime for current `aws-lambda-go`
 * builds. The Go-vs-Java disambiguation for `provided.al{,2}` happens
 * later in `create-runner.js` via the `.jar` artifact-extension check —
 * this coarse family classification is only used for handler-extension
 * lookups, which neither Go (bootstrap binary) nor Java (FQCN handler)
 * consult at runtime.
 *
 * @param {string | undefined | null} runtime
 * @returns {'node' | 'python' | 'ruby' | 'go' | 'java'}
 */
function runtimeFamily(runtime) {
  if (/^python\d+\.\d+$/.test(runtime ?? '')) return 'python'
  if (/^ruby\d+\.\d+$/.test(runtime ?? '')) return 'ruby'
  if (/^go\d+\.x?$/.test(runtime ?? '')) return 'go'
  if (/^java\d+(\.al2)?$/.test(runtime ?? '')) return 'java'
  if (/^provided\.(al|al2|al2023)$/.test(runtime ?? '')) return 'go'
  return 'node'
}

/** Real Lambda default memory (MB). */
const DEFAULT_MEMORY_LIMIT_IN_MB = 1024

/** Real Lambda default timeout (seconds). */
const DEFAULT_TIMEOUT_SECONDS = 6

/**
 * Resolves a handler string of the form `<rel-path>.<exportName>` to an
 * absolute file path on disk and the exported function name. Extension
 * candidates are chosen by runtime family — Python uses `.py` only, Node
 * tries `.js` / `.mjs` / `.cjs` in that order. Falls back to the first
 * candidate extension so the runner can surface a clear ENOENT at
 * invocation time rather than at boot.
 *
 * Synchronous on purpose — invoke() is called inside the synchronous SQS
 * subscriber tick, so doing async fs.access there would break the store's
 * synchronous-notification contract.
 *
 * @param {string} handlerString - e.g. `'src/handler.main'`
 * @param {string} baseDir       - Absolute service root (post-bundler swap).
 * @param {string | undefined | null} runtime - Effective runtime; picks the
 *   extension candidate list. Missing/unknown → Node defaults.
 * @returns {{ handlerPath: string, handlerName: string }}
 */
function resolveHandlerSync(handlerString, baseDir, runtime) {
  const extensions = HANDLER_EXTENSIONS_BY_RUNTIME[runtimeFamily(runtime)]
  const lastDot = handlerString.lastIndexOf('.')
  const relPath = handlerString.slice(0, lastDot)
  const handlerName = handlerString.slice(lastDot + 1)

  for (const ext of extensions) {
    const candidate = resolve(join(baseDir, relPath + ext))
    try {
      fs.accessSync(candidate, fs.constants.F_OK)
      return { handlerPath: candidate, handlerName }
    } catch {
      // Extension not found — try the next one.
    }
  }

  return {
    handlerPath: resolve(join(baseDir, relPath + extensions[0])),
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
 * @param {boolean} [params.localEnvironment=false]
 *   When true, copy the host process environment into the Lambda environment
 *   before applying provider/function environment overrides.
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
  localEnvironment = false,
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
     * @param {{ clientContext?: unknown }} [options]  Optional invoke
     *   options. `clientContext` carries the decoded value of a
     *   `LambdaClient.invoke` `ClientContext` argument (the base64
     *   `X-Amz-Client-Context` header) and is surfaced on the synthesized
     *   Lambda context.
     * @returns {Promise<unknown>}
     */
    async invoke(event, options = {}) {
      const fn = serverless.service.functions?.[functionKey]
      if (!fn) {
        throw new Error(
          `Function "${functionKey}" not found in service.functions.`,
        )
      }

      const provider = serverless.service.provider ?? {}

      const baseDir = getHandlerBaseDir(serverless)
      const runtime = fn.runtime ?? provider.runtime
      const { handlerPath, handlerName } = resolveHandlerSync(
        fn.handler,
        baseDir,
        runtime,
      )

      // Resolve package.artifact to an absolute path so Java's classpath
      // builder can read it without re-traversing the service tree.
      // Function-level overrides provider-level. null when not declared
      // (Node/Python/Ruby/Go runners ignore the field).
      const artifactRel =
        fn.package?.artifact ?? provider.package?.artifact ?? null
      const artifactPath = artifactRel
        ? resolve(join(baseDir, artifactRel))
        : null

      const timeoutSeconds =
        fn.timeout ?? provider.timeout ?? DEFAULT_TIMEOUT_SECONDS
      const timeoutMs = timeoutSeconds * 1000

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
        // Configured per-invocation budget in ms. The worker reads this and
        // uses its own monotonic `performance.now()` clock to compute
        // `getRemainingTimeInMillis`, so NTP adjustments and parent/worker
        // clock-skew can never make the value go non-monotonic.
        timeoutMs,
        // Raw handler string — worker-entry sets process.env._HANDLER from it
        // for parity with the real Lambda execution environment.
        handler: fn.handler,
        // Client context from a LambdaClient.invoke ClientContext arg (the
        // base64 X-Amz-Client-Context header), null otherwise. Mirrors the
        // real Lambda context.clientContext field.
        clientContext: options.clientContext ?? null,
      }

      const environment = {
        ...(localEnvironment ? process.env : {}),
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
          // Forward the function's runtime so the composite runner can
          // route to the matching sub-runner (Node / Python / future).
          // Same resolution used above for handlerPath extension selection.
          runtime,
          codeDir: baseDir,
          architecture: fn.architecture ?? provider.architecture ?? 'x86_64',
          // Absolute path to the user's compiled artifact (Java JAR).
          // Null for non-Java runtimes; the multiplexer ignores it
          // unless it routes the invoke to the Java sub-runner.
          artifactPath,
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
