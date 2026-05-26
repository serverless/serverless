import { spawn as nodeSpawn } from 'node:child_process'
import path from 'node:path'

import { buildLambdaRuntimeEnv } from './lambda-env.js'
import { ensureBuilt as defaultEnsureBuilt } from './go-builder.js'
import ServerlessError from '../../../../../serverless-error.js'

// A year — used as a sentinel "effectively unlimited" deadline when the caller
// does not supply a timeoutMs (the `--noTimeout` flag path). The invocation
// queue requires a finite timeoutMs to arm its per-invocation timer; this
// gives us a safe upper bound that no real test or local request will hit.
const NO_TIMEOUT_FALLBACK_MS = 365 * 24 * 60 * 60 * 1000

/**
 * @typedef {object} PoolEntry
 * @property {import('node:child_process').ChildProcessWithoutNullStreams} child
 * @property {'idle' | 'busy' | 'terminating'} state
 * @property {'invalidate' | 'terminate' | 'evict' | null} cancelReason
 *   Set before the deliberate `child.kill()` that drops this entry. Three
 *   shapes:
 *   - `'invalidate'`: user-requested invalidation (file changed, hot reload).
 *   - `'terminate'`: runner-wide shutdown.
 *   - `'evict'`: automatic idle eviction (`idleEvictionMs` elapsed). Kept
 *     distinct so future telemetry can tell user actions from automatic GC.
 *   Mirrors the python/ruby runner shape so future shared code (telemetry,
 *   audit) can read it uniformly.
 * @property {NodeJS.Timeout | null} pendingTimeout
 *   Armed by `_scheduleIdleEviction`; cleared on transition to busy, on
 *   invalidate/terminate, and on the 'exit'/'error' handlers (the
 *   process-already-gone case).
 * @property {string} binaryPath
 */

/**
 * Go child-process Lambda runner. Spawns a long-lived `bootstrap` binary per
 * functionKey and talks to it ONLY through the AWS Lambda Runtime API — the
 * child polls `GET /next`, posts to `POST /response` / `POST /error`, and the
 * runner enqueues invocations into the shared invocation queue that backs
 * those HTTP routes. The runner never touches the child's stdio for
 * request/response framing (only for log forwarding).
 *
 * The queue's pending/waiter rendezvous IS the readiness handshake: after
 * spawn we transition straight to `idle` and let the very next `enqueue()`
 * park as a pending until the bootstrap's first `/next` call drains it. No
 * separate `'spawning'` state is needed.
 *
 * Idle eviction: `idleEvictionMs` milliseconds after the last invoke settles
 * the child is killed and removed from the pool; the next invoke on that key
 * spawns fresh. Pass <= 0 to disable.
 *
 * Public shape mirrors createPythonRunner / createRubyRunner /
 * createInProcessRunner so the Lambda facade dispatches uniformly.
 *
 * @param {object} options
 * @param {number} options.idleEvictionMs  Milliseconds of idleness before the
 *   pool entry is evicted. <= 0 disables eviction.
 * @param {string} options.runtimeApiBase  Full URL (with scheme) of the
 *   Runtime API root — e.g. `http://localhost:3002/runtime`. Stripped down
 *   to `host:port/runtime/<functionKey>` for `AWS_LAMBDA_RUNTIME_API`, which
 *   the aws-lambda-go SDK expects in that no-scheme form.
 * @param {ReturnType<typeof import('./invocation-queue.js').createInvocationQueue>} options.runtimeApiQueue
 *   The shared invocation queue. The runner only enqueues; the HTTP routes
 *   drain pending, deliver inFlight, and settle on response/error.
 * @param {{ debug?: Function, notice?: Function, warning?: Function, error?: Function }} [options.log]
 *   Logger used for child stdout/stderr forwarding and lifecycle diagnostics.
 *   Missing methods are tolerated (optional chaining at call sites).
 * @param {string} [options.servicePath]  Absolute path to the user's service
 *   directory. Used as `cwd` for the spawned child and as the root for
 *   `sourceDir` / `sourceFile` derivation from `context.handler`. Defaults
 *   to `process.cwd()` for test ergonomics; production wiring sets it
 *   explicitly to `serverless.serviceDir`.
 * @param {string} [options.buildCacheRoot]  Where `ensureBuilt` writes the
 *   compiled binary cache. Defaults to `<servicePath>/.serverless-offline/builds`.
 * @param {Function} [options.spawnOverride]  Test seam for replacing
 *   `child_process.spawn`. Same signature: `(binaryPath, args, opts) => ChildProcess`.
 * @param {Function} [options.ensureBuilt]  Test seam for skipping the Go
 *   toolchain. Receives the same shape `go-builder.js#ensureBuilt` does and
 *   must return `{ binaryPath, fromCache }`.
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createGoRunner({
  idleEvictionMs,
  runtimeApiBase,
  runtimeApiQueue,
  log = {},
  servicePath = process.cwd(),
  buildCacheRoot,
  spawnOverride,
  ensureBuilt = defaultEnsureBuilt,
}) {
  if (!runtimeApiBase) {
    throw new Error('createGoRunner: runtimeApiBase is required')
  }
  if (!runtimeApiQueue) {
    throw new Error('createGoRunner: runtimeApiQueue is required')
  }

  const spawnFn = spawnOverride ?? nodeSpawn
  const resolvedBuildCacheRoot =
    buildCacheRoot ?? path.join(servicePath, '.serverless-offline', 'builds')

  /** @type {Map<string, PoolEntry>} */
  const pool = new Map()

  // Closure-level shutdown flag. Set by `terminate()` BEFORE iterating the
  // pool so a concurrent `_ensureEntry()` mid-await (between `ensureBuilt`
  // returning and `spawnFn` running) can short-circuit and not orphan a
  // freshly spawned child past shutdown.
  let terminated = false

  // Track in-flight `_ensureEntry` promises so `terminate()` can wait for
  // any pre-flag spawns to complete and then kill them. Each promise is
  // added on entry, removed on settle (success or failure).
  /** @type {Set<Promise<unknown>>} */
  const inFlightSpawns = new Set()

  /**
   * Strip scheme and trailing `/runtime` off `runtimeApiBase`, then append
   * the functionKey so the spawned child sees the per-function namespace
   * that `registerRuntimeApiRoutes` mounted under `/runtime/{functionKey}`.
   * The aws-lambda-go SDK joins this with `/2018-06-01/runtime/invocation/...`
   * so we MUST NOT include a scheme or trailing slash.
   *
   * @param {string} functionKey
   * @returns {string}
   */
  function _apiBaseFor(functionKey) {
    const trimmed = runtimeApiBase
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
    return `${trimmed}/${functionKey}`
  }

  /**
   * Forward child stdout/stderr to the supplied logger. Each chunk may
   * carry multiple lines; we trim the trailing newline so logger output
   * isn't double-spaced. Empty lines are dropped.
   *
   * @param {NodeJS.ReadableStream} stream
   * @param {string} functionKey
   * @param {'debug' | 'error'} level
   */
  function _forward(stream, functionKey, level) {
    if (!stream) return
    stream.on('data', (chunk) => {
      const text = chunk.toString().trimEnd()
      if (!text) return
      const emit = log?.[level]
      if (typeof emit === 'function') {
        emit(`[${functionKey}] ${text}`)
      }
    })
  }

  /**
   * Spawn-or-reuse the pool entry for `functionKey`. The 'terminating'
   * check guards against a stale entry — invalidate() removes it from the
   * pool eagerly but the 'exit' handler also cleans up; both paths are
   * idempotent so the worst case here is a one-tick race that resolves to
   * "spawn fresh".
   *
   * @param {string} functionKey
   * @param {object} args  The full invoke() args; we need context.handler
   *   to derive sourceDir / sourceFile.
   * @returns {Promise<PoolEntry>}
   */
  async function _ensureEntry(functionKey, args) {
    const existing = pool.get(functionKey)
    if (existing && existing.state !== 'terminating') {
      return existing
    }

    // Derive sourceDir / sourceFile from context.handler (the raw `src/main.handler`
    // string). handlerPath is also present but it's the load-handler-resolved
    // absolute path that points at the .go FILE; the Go builder needs the
    // package DIRECTORY, which only context.handler gives us unambiguously.
    const rawHandler = args?.context?.handler ?? ''
    const lastDot = rawHandler.lastIndexOf('.')
    const handlerStem =
      lastDot > 0 ? rawHandler.slice(0, lastDot) : rawHandler || 'bootstrap'
    const sourceDir = path.resolve(servicePath, path.dirname(handlerStem))
    const sourceFile = path.resolve(servicePath, `${handlerStem}.go`)

    const { binaryPath } = await ensureBuilt({
      functionKey,
      sourceDir,
      sourceFile,
      servicePath,
      buildCacheRoot: resolvedBuildCacheRoot,
    })

    // Recheck the shutdown flag AFTER the await — `terminate()` may have
    // run during the build. Without this guard a freshly-spawned child
    // would outlive terminate() and become an orphan process.
    if (terminated) {
      throw new ServerlessError(
        'Lambda runner terminated during invocation',
        'OFFLINE_WORKER_TERMINATED',
      )
    }

    const context = args?.context ?? {}
    const region = context.region ?? process.env.AWS_REGION ?? 'us-east-1'
    const functionName = context.functionName
    const memoryLimitInMB = String(context.memoryLimitInMB ?? 1024)
    const logGroupName = context.logGroupName ?? `/aws/lambda/${functionName}`
    const logStreamName = context.logStreamName ?? ''
    const lambdaEnv = buildLambdaRuntimeEnv({
      functionName,
      memoryLimitInMB,
      invokedFunctionArn: context.invokedFunctionArn,
      logGroupName,
      logStreamName,
      handler: context.handler,
      region,
    })

    const apiBase = _apiBaseFor(functionKey)
    const env = {
      ...process.env,
      ...lambdaEnv,
      ...(args.environment ?? {}),
      AWS_LAMBDA_RUNTIME_API: apiBase,
    }

    const child = spawnFn(binaryPath, [], {
      cwd: servicePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    /** @type {PoolEntry} */
    const entry = {
      child,
      // No 'spawning' enum — the queue's pending/waiter rendezvous handles
      // the readiness handshake implicitly.
      state: 'idle',
      cancelReason: null,
      pendingTimeout: null,
      binaryPath,
    }

    _forward(child.stdout, functionKey, 'debug')
    // Go panics and user-handler errors surface on stderr — log at
    // `error` level so stack traces are visible by default.
    _forward(child.stderr, functionKey, 'error')

    child.on('exit', (code, signal) => {
      // The 'exit' handler is the cleanup-of-last-resort. invalidate()
      // and terminate() also delete from the pool eagerly; both paths
      // must be idempotent so a second `pool.delete` here is safe.
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      // Drain any in-flight invocations on this functionKey. If the child
      // crashed we surface OFFLINE_WORKER_EXITED with the exit signature;
      // if we killed it on purpose (cancelReason set) we use the matching
      // OFFLINE_WORKER_TERMINATED so callers can distinguish the two.
      if (entry.cancelReason !== null) {
        runtimeApiQueue.rejectAll(
          functionKey,
          new ServerlessError(
            'Lambda runner terminated during invocation',
            'OFFLINE_WORKER_TERMINATED',
          ),
        )
      } else {
        runtimeApiQueue.rejectAll(
          functionKey,
          new ServerlessError(
            `Lambda bootstrap for ${functionKey} exited unexpectedly (code=${code}, signal=${signal})`,
            'OFFLINE_WORKER_EXITED',
          ),
        )
      }
      entry.state = 'terminating'
    })

    child.on('error', (err) => {
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      runtimeApiQueue.rejectAll(functionKey, err)
      entry.state = 'terminating'
      if (typeof log?.error === 'function') {
        log.error(`[${functionKey}] Go runtime spawn error: ${err.message}`)
      }
    })

    pool.set(functionKey, entry)
    return entry
  }

  /**
   * Arm the idle-eviction timer. The timer's job is to kill the child if
   * the entry sits in `idle` for `idleEvictionMs`; if anyone has flipped
   * the state back to `busy` (or to `terminating`) by the time we fire,
   * we bow out and let that path own the lifecycle.
   *
   * @param {string} functionKey
   * @param {PoolEntry} entry
   */
  function _scheduleIdleEviction(functionKey, entry) {
    if (idleEvictionMs == null || idleEvictionMs <= 0) return
    if (entry.pendingTimeout !== null) {
      clearTimeout(entry.pendingTimeout)
    }
    entry.pendingTimeout = setTimeout(() => {
      entry.pendingTimeout = null
      if (entry.state !== 'idle') return
      entry.state = 'terminating'
      entry.cancelReason = 'evict'
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      try {
        entry.child.kill('SIGTERM')
      } catch {
        // ignore — child may already be gone
      }
    }, idleEvictionMs)
  }

  return {
    /**
     * @param {object} args
     * @param {string} args.functionKey
     * @param {string} args.handlerPath  Unused by the Go runner (the binary
     *   is identified by functionKey + the build cache, not by the
     *   handler path). Accepted so the runner shape matches its siblings.
     * @param {string} args.handlerName  Unused (Go bootstraps register
     *   their handler internally via `lambda.Start`).
     * @param {unknown} args.event
     * @param {object} args.context
     * @param {Record<string, string>} [args.environment]
     * @param {number} [args.timeoutMs]  When omitted (user passed
     *   `--noTimeout`) we fall back to a one-year sentinel so the queue's
     *   per-invocation timer is armed with a finite value but effectively
     *   never fires.
     * @returns {Promise<unknown>}
     */
    async invoke(args) {
      const { functionKey } = args
      if (terminated) {
        throw new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        )
      }
      const spawnPromise = _ensureEntry(functionKey, args)
      inFlightSpawns.add(spawnPromise)
      let entry
      try {
        entry = await spawnPromise
      } finally {
        inFlightSpawns.delete(spawnPromise)
      }

      if (entry.state === 'terminating') {
        throw new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        )
      }

      entry.state = 'busy'
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }

      const invocation = runtimeApiQueue.enqueue(functionKey, {
        payload: args.event,
        timeoutMs: args.timeoutMs ?? NO_TIMEOUT_FALLBACK_MS,
        invokedFunctionArn: args.context?.invokedFunctionArn ?? '',
      })

      try {
        return await invocation
      } finally {
        // The entry may have been swapped out from under us (invalidate /
        // exit) — only flip back to idle if it's still the registered one.
        if (pool.get(functionKey) === entry && entry.state !== 'terminating') {
          entry.state = 'idle'
          _scheduleIdleEviction(functionKey, entry)
        }
      }
    },

    /**
     * Kill the child for a single functionKey and drop it from the pool.
     * The 'exit' handler completes the cleanup; this method must be
     * idempotent.
     *
     * @param {string} functionKey
     */
    invalidate(functionKey) {
      const entry = pool.get(functionKey)
      if (!entry) return
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      entry.state = 'terminating'
      entry.cancelReason = 'invalidate'
      pool.delete(functionKey)
      runtimeApiQueue.rejectAll(
        functionKey,
        new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        ),
      )
      try {
        entry.child.kill('SIGTERM')
      } catch {
        // ignore — child may already be gone
      }
    },

    /**
     * Kill every live child, reject every in-flight invocation, and wait
     * for each child to actually exit. Resolves once all 'exit' events
     * have fired.
     *
     * @returns {Promise<void>}
     */
    async terminate() {
      // Set the shutdown flag FIRST so any concurrent `_ensureEntry` mid-
      // await (waiting on `ensureBuilt`) can re-check it after the await
      // and bail out before spawning. Then drain any spawn promises that
      // were already past the build but haven't yet returned to invoke().
      terminated = true
      await Promise.allSettled(inFlightSpawns)

      const exits = []
      for (const [functionKey, entry] of pool.entries()) {
        if (entry.pendingTimeout !== null) {
          clearTimeout(entry.pendingTimeout)
          entry.pendingTimeout = null
        }
        entry.state = 'terminating'
        entry.cancelReason = 'terminate'
        runtimeApiQueue.rejectAll(
          functionKey,
          new ServerlessError(
            'Lambda runner terminated during invocation',
            'OFFLINE_WORKER_TERMINATED',
          ),
        )
        // Resolve the wait on either 'exit' or 'error' — if the child
        // never started we don't want terminate() to hang forever.
        exits.push(
          new Promise((resolve) => {
            if (entry.child.exitCode !== null || entry.child.signalCode) {
              resolve()
              return
            }
            entry.child.once('exit', () => resolve())
            entry.child.once('error', () => resolve())
          }),
        )
        try {
          entry.child.kill('SIGTERM')
        } catch {
          // ignore — child may already be gone
        }
      }
      pool.clear()
      await Promise.all(exits)
    },
  }
}
