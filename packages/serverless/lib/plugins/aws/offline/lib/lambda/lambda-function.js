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
 * @param {string | null} [params.layerOptDir=null]
 *   Host dir of this function's extracted layer set, mounted at /opt by the
 *   Docker runner; null when none.
 * @param {object} [params.offlineRuntime]
 *   Boot-level offline runtime values injected into every handler's env so
 *   handler code (and its AWS SDK clients) target the local emulator. These
 *   reach the handler scope only — they are never written onto the host
 *   process, where AWS_ENDPOINT_URL would redirect the framework's own SDK
 *   clients to the emulator.
 * @param {string} [params.offlineRuntime.endpointUrl]
 *   Local AWS emulator URL, e.g. `http://localhost:<awsApiPort>`.
 * @param {boolean} [params.offlineRuntime.noAuth=false]
 *   When true, an empty AUTHORIZER (`{}`) is injected so authorizer-aware
 *   handlers receive a synthetic context with authentication disabled.
 * @param {{ route?: Function } | null} [params.destinationRouter=null]
 *   Lambda async-destination router (`lambda-destinations.js`). A mutable seam:
 *   boot passes the object early and sets `.route` once the downstream stores
 *   exist. Consulted only for an `{ async: true }` invoke of a function that
 *   declares `destinations`; a settled invoke then fires `route(...)` and the
 *   outcome the caller receives is unchanged. `null` (or `.route` unset) means
 *   no routing — the strictly synchronous behaviour.
 * @returns {{
 *   invoke(event: unknown, options?: object): Promise<unknown>,
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
  layerOptDir = null,
  offlineRuntime = {},
  destinationRouter = null,
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
     * @param {{ clientContext?: unknown, async?: boolean }} [options]  Optional
     *   invoke options. `clientContext` carries the decoded value of a
     *   `LambdaClient.invoke` `ClientContext` argument (the base64
     *   `X-Amz-Client-Context` header) and is surfaced on the synthesized
     *   Lambda context. `async` marks an asynchronous (event) invocation: when
     *   set AND the function declares `destinations` AND a destination router is
     *   wired, the settled outcome is forwarded to the router fire-and-forget.
     *   It never changes what this method returns or throws to the caller.
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

      // The deployed function name (Framework-resolved, e.g.
      // `my-service-dev-worker`, or an explicit `functions.x.name`), not the
      // serverless.yml key. Mirrors real Lambda's context.functionName and
      // cascades to AWS_LAMBDA_FUNCTION_NAME + the log group/stream names the
      // runners derive from it. Falls back to the key when unresolved.
      const deployedName = fn.name ?? functionKey

      const context = {
        functionName: deployedName,
        awsRequestId,
        invokedFunctionArn: arnFor('lambda', deployedName),
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
        // Boot-level offline runtime values. The runner injects these into the
        // handler's env block (never the host process). AWS_ENDPOINT_URL points
        // a handler's SDK client at the local emulator; placeholder credentials
        // default to 'test' only when the host shell has not already provided a
        // real value (read-only here — the host env is not mutated). IS_OFFLINE
        // and AUTHORIZER follow the configured offline options.
        isOffline: true,
        endpointUrl: offlineRuntime.endpointUrl,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
        authorizer: offlineRuntime.noAuth ? '{}' : undefined,
      }

      const environment = {
        ...(localEnvironment ? process.env : {}),
        ...(provider.environment ?? {}),
        ...(fn.environment ?? {}),
      }

      // Async-destination routing is engaged only for an `{ async: true }`
      // invoke of a function that declares `destinations`, and only when a
      // router is wired with a live `.route`. For every other path (sync
      // invoke, no destinations, no router) `route` stays null and the
      // invocation is byte-for-byte the original synchronous behaviour.
      const route =
        options.async === true && fn.destinations && destinationRouter?.route
          ? destinationRouter.route
          : null

      // Measure wall-clock duration around the runner invocation. Use the
      // monotonic high-resolution clock so NTP adjustments cannot warp the
      // measurement on long-running handlers.
      const startedAt = performance.now()
      try {
        const result = await runner.invoke({
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
          // Extracted layer set for this function (Docker runner mounts it at
          // /opt). Undefined for functions without layers; host runners ignore it.
          layers: layerOptDir ? { optDir: layerOptDir } : undefined,
          // When timeout enforcement is disabled, omit timeoutMs entirely so
          // the runner does not arm its termination timer.
          timeoutMs: noTimeout ? undefined : timeoutMs,
        })
        // Fire-and-forget the success outcome to the destination router. A
        // routing fault is the router's own responsibility to absorb; guard it
        // here too so it can never reject into the caller's invoke result.
        if (route) {
          Promise.resolve(
            route({
              functionName: deployedName,
              functionArn: context.invokedFunctionArn,
              destinations: fn.destinations,
              event,
              result,
            }),
          ).catch(() => {})
        }
        return result
      } catch (error) {
        // Fire-and-forget the failure outcome, then re-throw the original error
        // unchanged — the caller's reject is never delayed or swallowed.
        if (route) {
          Promise.resolve(
            route({
              functionName: deployedName,
              functionArn: context.invokedFunctionArn,
              destinations: fn.destinations,
              event,
              error,
            }),
          ).catch(() => {})
        }
        throw error
      } finally {
        const durationMs = performance.now() - startedAt
        logExecution(awsRequestId, durationMs)
      }
    },
  }
}
