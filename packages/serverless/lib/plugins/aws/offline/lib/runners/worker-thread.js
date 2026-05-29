import { Worker } from 'node:worker_threads'
import ServerlessError from '../../../../../serverless-error.js'
import {
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  DEFAULT_MAX_CONCURRENT_INVOCATIONS,
} from '../constants.js'

const workerEntryPath = new URL('./worker-entry.js', import.meta.url)

/**
 * Names of parent process.env entries that are forwarded into every worker.
 * Restricted to operating-system / runtime essentials so that secrets stored
 * in the parent shell environment (CI tokens, SSH agent values, etc.) cannot
 * leak into Lambda handlers.
 *
 * Native modules (`sharp`, `sqlite3`, …) typically need `PATH` for executable
 * lookups and `HOME` for cache directories; `NODE_PATH`/`NODE_OPTIONS` keep
 * Node's own module resolution working; locale variables prevent C extensions
 * from defaulting to ASCII.
 *
 * @type {string[]}
 */
const BASE_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NODE_PATH',
  'NODE_OPTIONS',
  // AWS region / endpoint env vars that OfflinePlugin sets on the parent
  // before any worker is spawned. Forwarded so handler code that constructs
  // an SDK client picks up the local emulator endpoint and the configured
  // provider.region without us having to plumb every var via context.
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'IS_OFFLINE',
]

/**
 * Build the base `env` map to hand to `new Worker(..., { env })`. Only entries
 * present on the parent's `process.env` and on the allowlist are copied.
 *
 * @returns {Record<string, string>}
 */
function buildBaseEnv() {
  /** @type {Record<string, string>} */
  const base = {}
  for (const name of BASE_ENV_ALLOWLIST) {
    const value = process.env[name]
    if (value !== undefined) base[name] = value
  }
  return base
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reconstruct an Error from the plain object sent over the structured-clone
 * channel from the worker.
 *
 * @param {{ name: string, message: string, stack: string }} errorData
 * @returns {Error}
 */
function rebuildError({ name, message, stack }) {
  const err = new Error(message)
  err.name = name
  err.stack = stack
  return err
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a pooled worker-thread Lambda runner.
 *
 * Keeps a set of warm `worker_threads.Worker` instances per `functionKey`,
 * reusing idle ones across invocations. Concurrent invocations on the same
 * `functionKey` run in parallel (each gets its own worker), matching real
 * Lambda's concurrency model. Workers are evicted (terminated) after
 * `idleEvictionMs` milliseconds of inactivity.
 *
 * @param {object} options
 * @param {string} options.servicePath                  Absolute path to the Serverless service root.
 * @param {number} [options.idleEvictionMs]             Idle eviction timeout in milliseconds (default: 60_000).
 *   Pass <= 0 to disable eviction entirely. Unit is milliseconds — the user-
 *   facing `offline.terminateIdleLambdaTime` (seconds) is converted at the
 *   `createRunner` boundary.
 * @param {number} [options.maxConcurrentInvocations]   Max concurrent workers per functionKey (default: 100).
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createWorkerThreadRunner({
  servicePath,
  idleEvictionMs = DEFAULT_TERMINATE_IDLE_LAMBDA_TIME * 1000,
  maxConcurrentInvocations = DEFAULT_MAX_CONCURRENT_INVOCATIONS,
} = {}) {
  /**
   * Pool of warm workers, keyed by functionKey.
   *
   * Each value is a Set of WorkerEntry objects. A function can have multiple
   * concurrent workers — one per in-flight invocation, up to maxConcurrentInvocations.
   *
   * @type {Map<string, Set<WorkerEntry>>}
   *
   * WorkerEntry shape:
   * {
   *   state: 'spawning' | 'idle' | 'busy' | 'terminating',
   *   worker: Worker,
   *   workerReady: Promise<void>,          // resolves once the worker sends 'ready'
   *   _resolveReady: () => void,           // resolves workerReady
   *   _rejectReady: (err: Error) => void,  // rejects workerReady (cancelled entry)
   *   idleTimer: NodeJS.Timeout | null,    // eviction timer when idle
   *   pendingResult: { resolve, reject } | null,
   *   pendingTimeout: NodeJS.Timeout | null,
   *   handlerPath: string,
   *   handlerName: string,
   *   terminateAfterCurrent: boolean,      // set by invalidate() while busy
   * }
   */
  const pool = new Map()

  /**
   * Waiters blocked at the concurrency cap for a given functionKey.
   * Each entry: { resolve: () => void }
   *
   * @type {Map<string, Array<{ resolve: () => void }>>}
   */
  const capWaiters = new Map()

  // ---------------------------------------------------------------------------
  // Private: wake a cap-level waiter for a functionKey
  // ---------------------------------------------------------------------------

  function _wakeCapWaiter(functionKey) {
    const waiters = capWaiters.get(functionKey)
    if (waiters && waiters.length > 0) {
      waiters.shift().resolve()
    }
  }

  // ---------------------------------------------------------------------------
  // Private: spawn a new WorkerEntry and add it to the set for functionKey
  // ---------------------------------------------------------------------------

  /**
   * Spawn a new worker for the given function and return its entry.
   * Automatically adds the entry to pool.get(functionKey).
   *
   * @param {object} params
   * @param {string} params.functionKey
   * @param {string} params.handlerPath
   * @param {string} params.handlerName
   * @param {Set<WorkerEntry>} params.set  The set to add this entry to.
   * @returns {WorkerEntry}
   */
  function _spawnEntry({ functionKey, handlerPath, handlerName, set }) {
    const worker = new Worker(workerEntryPath, {
      workerData: { handlerPath, handlerName, servicePath },
      // Replace the worker's process.env entirely instead of inheriting the
      // parent's. Without this the parent's secrets (CI tokens, SSH agent,
      // shell credentials, etc.) leak into every Lambda handler — production
      // Lambda would never see them. Only operating-system essentials needed
      // for Node module loading and native bindings are copied through; the
      // per-invocation runtime env (provider/function `environment:`, AWS_*,
      // Lambda env vars) is applied by the worker on each message.
      env: buildBaseEnv(),
    })

    /** @type {WorkerEntry} */
    const entry = {
      state: 'spawning',
      worker,
      workerReady: null, // set below
      _resolveReady: null,
      _rejectReady: null,
      idleTimer: null,
      pendingResult: null,
      pendingTimeout: null,
      handlerPath,
      handlerName,
      terminateAfterCurrent: false,
    }

    // Build the workerReady promise: resolves when the worker sends 'ready';
    // rejects if the worker errors out before that, or if the entry is
    // cancelled via _rejectReady (e.g. by invalidate() or terminate()).
    entry.workerReady = new Promise((resolve, reject) => {
      entry._resolveReady = resolve
      entry._rejectReady = reject
    })
    // Prevent unhandled rejection if nobody is awaiting workerReady.
    entry.workerReady.catch(() => {})

    // Add to the set immediately so the cap is enforced correctly.
    set.add(entry)

    // Worker-level error before 'ready' is handled here.
    worker.once('error', (err) => {
      if (entry._rejectReady) {
        // A worker that errors before it ever became ready failed to
        // initialize (worker bootstrap threw). This is deterministic, so tag
        // it for the invoke loop to propagate rather than respawn-and-retry
        // forever against the same broken setup.
        entry._rejectReady(
          new ServerlessError(
            err && err.message != null ? err.message : String(err),
            'OFFLINE_WORKER_ERROR',
          ),
        )
        entry._resolveReady = null
        entry._rejectReady = null
      }
      // Also reject any in-flight invocation.
      if (entry.pendingResult !== null) {
        if (entry.pendingTimeout !== null) {
          clearTimeout(entry.pendingTimeout)
          entry.pendingTimeout = null
        }
        const { reject: rej } = entry.pendingResult
        entry.pendingResult = null
        entry.state = 'terminating'
        set.delete(entry)
        if (set.size === 0) pool.delete(functionKey)
        _wakeCapWaiter(functionKey)
        rej(err)
      } else {
        entry.state = 'terminating'
        set.delete(entry)
        if (set.size === 0) pool.delete(functionKey)
        _wakeCapWaiter(functionKey)
      }
    })

    // Handle clean worker self-exit (process.exit(0)) that the worker posts
    // 'shutdown-after-invocation' before triggering.  We mark the entry as
    // terminating so the subsequent 'exit' event is treated as expected.
    let selfExitExpected = false

    // Set up the persistent per-invocation message handler for this worker.
    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        if (entry._resolveReady) {
          entry.state = 'idle'
          entry._resolveReady()
          entry._resolveReady = null
          entry._rejectReady = null
        }
        return
      }

      // Load-phase failure: the worker reports an error MESSAGE (the handler
      // module threw on import, or the named export is missing) before it ever
      // became ready. No invocation is in flight yet, so reject the readiness
      // promise with a clear, non-retryable error and drop the entry — without
      // this the awaiting invoke() would hang forever, since the worker exits
      // immediately afterwards and the per-invocation timeout is only armed
      // once the worker is ready.
      if (msg.type === 'error' && entry._rejectReady) {
        const cause = rebuildError(msg.error)
        entry._rejectReady(
          new ServerlessError(
            cause.message || 'Failed to load Lambda handler',
            'OFFLINE_HANDLER_LOAD_FAILED',
          ),
        )
        entry._resolveReady = null
        entry._rejectReady = null
        entry.state = 'terminating'
        set.delete(entry)
        if (set.size === 0) pool.delete(functionKey)
        _wakeCapWaiter(functionKey)
        return
      }

      if (msg.type === 'shutdown-after-invocation') {
        // The worker called process.exit(0) after honoring
        // callbackWaitsForEmptyEventLoop = false.  Mark the entry so the
        // 'exit' listener below drops it quietly without firing errors.
        // Also cancel any idle eviction timer that the success-message handler
        // may have armed just before this message arrived.
        selfExitExpected = true
        if (entry.idleTimer !== null) {
          clearTimeout(entry.idleTimer)
          entry.idleTimer = null
        }
        entry.state = 'terminating'
        set.delete(entry)
        if (set.size === 0) pool.delete(functionKey)
        _wakeCapWaiter(functionKey)
        return
      }

      if (msg.type === 'success' || msg.type === 'error') {
        // Guard: if a timeout already settled this invocation, pendingResult
        // will be null and there is nothing left to do.
        if (entry.pendingResult === null) {
          return
        }

        // Clear the invocation timeout.
        if (entry.pendingTimeout !== null) {
          clearTimeout(entry.pendingTimeout)
          entry.pendingTimeout = null
        }

        const { resolve, reject } = entry.pendingResult
        entry.pendingResult = null

        // If invalidate() was called while busy, terminate after settling
        // rather than returning to the pool.
        const shouldTerminate = entry.terminateAfterCurrent
        entry.terminateAfterCurrent = false

        if (shouldTerminate) {
          entry.state = 'terminating'
          set.delete(entry)
          if (set.size === 0) pool.delete(functionKey)
          _terminateEntry(entry).catch(() => {})
          _wakeCapWaiter(functionKey)
        } else {
          entry.state = 'idle'
          // Schedule per-entry idle eviction. unref() allows the process to
          // exit cleanly even if the timer is still pending.
          entry.idleTimer = setTimeout(() => {
            set.delete(entry)
            if (set.size === 0) pool.delete(functionKey)
            _terminateEntry(entry).catch(() => {})
            _wakeCapWaiter(functionKey)
          }, idleEvictionMs).unref()
          // Wake a cap-waiter — the slot is now idle and available for reuse.
          _wakeCapWaiter(functionKey)
        }

        // Resolve or reject the caller.
        if (msg.type === 'success') {
          resolve(msg.value)
        } else {
          reject(rebuildError(msg.error))
        }
      }
    })

    // Handle unexpected worker exit (crash, OOM, etc.).
    // When `selfExitExpected` is true the exit was triggered by the worker
    // itself after honoring `callbackWaitsForEmptyEventLoop = false` — the
    // result has already been posted and the parent already removed the entry
    // from the set (or is about to via the message handler).  Drop quietly.
    worker.once('exit', (code) => {
      if (selfExitExpected) {
        // Expected self-exit: ensure the entry is no longer in the set.
        set.delete(entry)
        if (set.size === 0) pool.delete(functionKey)
        entry.state = 'terminating'
        _wakeCapWaiter(functionKey)
        return
      }

      // Unexpected exit (code !== 0, or code === 0 but no shutdown-after-invocation).
      if (entry.state !== 'terminating') {
        const exitErr = new ServerlessError(
          `Worker for "${functionKey}" exited unexpectedly with code ${code}`,
          'OFFLINE_WORKER_EXITED',
        )
        set.delete(entry)
        if (set.size === 0) pool.delete(functionKey)
        entry.state = 'terminating'
        _wakeCapWaiter(functionKey)
        // Worker died before it ever signalled readiness — fail the invoke()
        // awaiting workerReady instead of letting it hang.
        if (entry._rejectReady) {
          entry._rejectReady(exitErr)
          entry._resolveReady = null
          entry._rejectReady = null
        }
        if (entry.pendingResult !== null) {
          if (entry.pendingTimeout !== null) {
            clearTimeout(entry.pendingTimeout)
            entry.pendingTimeout = null
          }
          const { reject: rej } = entry.pendingResult
          entry.pendingResult = null
          rej(exitErr)
        }
      }
    })

    return entry
  }

  // ---------------------------------------------------------------------------
  // Private: terminate a WorkerEntry cleanly
  // ---------------------------------------------------------------------------

  /**
   * Tear down a worker entry.
   *
   * The `reason` argument distinguishes the two contexts this is called from:
   * - `'invalidate'` (default) — bundler told us the handler source changed,
   *   or the worker errored out before becoming ready. The pending invoke()
   *   that was awaiting this entry should RETRY against a fresh worker, so
   *   we reject workerReady with a plain Error the invoke loop swallows.
   * - `'terminate'` — the public `terminate()` method is shutting the runner
   *   down. The pending invoke() should NOT silently retry against a new
   *   worker; the caller asked for everything to stop. Reject workerReady
   *   with a tagged ServerlessError that the invoke loop propagates.
   *
   * @param {WorkerEntry} entry
   * @param {'invalidate' | 'terminate'} reason
   * @returns {Promise<void>}
   */
  async function _terminateEntry(entry, reason = 'invalidate') {
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = null
    }
    entry.state = 'terminating'
    // If the entry is being terminated before the worker sent 'ready',
    // reject workerReady so any invoke() awaiting it can detect the cancellation.
    if (entry._rejectReady) {
      const rejectErr =
        reason === 'terminate'
          ? new ServerlessError(
              'Lambda runner terminated during invocation',
              'OFFLINE_WORKER_TERMINATED',
            )
          : new Error('Worker terminated before ready')
      entry._rejectReady(rejectErr)
      entry._resolveReady = null
      entry._rejectReady = null
    }
    // Reject any in-flight invocation so its promise does not hang.
    if (entry.pendingResult) {
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      const { reject } = entry.pendingResult
      entry.pendingResult = null
      reject(
        new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        ),
      )
    } else if (entry.pendingTimeout !== null) {
      clearTimeout(entry.pendingTimeout)
      entry.pendingTimeout = null
    }
    await entry.worker.terminate()
  }

  // ---------------------------------------------------------------------------
  // Runner object
  // ---------------------------------------------------------------------------

  const runner = {
    /**
     * Invoke a Node handler in a pooled worker_threads.Worker.
     *
     * Concurrent invocations on the same `functionKey` run in parallel — each
     * gets its own worker (or reuses an idle one). This matches real Lambda's
     * concurrency model. Up to `maxConcurrentInvocations` workers are allowed
     * per functionKey; beyond that, new invocations wait for a slot to free up.
     *
     * Workers are kept alive after each invocation and are available for reuse
     * by later invocations. They are evicted after `idleEvictionMs`
     * seconds of inactivity.
     *
     * @param {object} args
     * @param {string} args.functionKey  Unique key per function (typically the function name).
     * @param {string} args.handlerPath  Absolute path to the handler module.
     * @param {string} args.handlerName  Exported function name within that module.
     * @param {object} args.event        The event JSON passed to the handler.
     * @param {object} args.context      The Lambda context object passed to the handler.
     * @param {object} args.environment  Env vars to set inside the worker.
     * @param {number} args.timeoutMs    Hard timeout — terminate worker if exceeded.
     * @returns {Promise<unknown>}       The handler's return value.
     * @throws {ServerlessError}         OFFLINE_HANDLER_TIMEOUT if the timeout is exceeded.
     * @throws                           Any error thrown by the handler (rethrown with stack).
     */
    async invoke({
      functionKey,
      handlerPath,
      handlerName,
      event = {},
      context = {},
      environment = {},
      timeoutMs,
    }) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let set = pool.get(functionKey)
        if (!set) {
          set = new Set()
          pool.set(functionKey, set)
        }

        // Evict stale entries (different handlerPath/handlerName) lazily.
        // This handles config reloads where the handler file changed.
        const staleEntries = []
        for (const e of set) {
          if (
            e.state !== 'terminating' &&
            (e.handlerPath !== handlerPath || e.handlerName !== handlerName)
          ) {
            staleEntries.push(e)
          }
        }
        for (const e of staleEntries) {
          set.delete(e)
          _terminateEntry(e).catch(() => {})
        }
        if (staleEntries.length > 0 && set.size === 0) {
          pool.delete(functionKey)
        }

        // Find an existing IDLE entry for this functionKey.
        let entry = null
        for (const e of set) {
          if (
            e.state === 'idle' &&
            e.handlerPath === handlerPath &&
            e.handlerName === handlerName
          ) {
            entry = e
            break
          }
        }

        // Check concurrency cap before spawning.
        if (!entry && set.size >= maxConcurrentInvocations) {
          // Wait for some entry to free up a slot.
          await new Promise((resolve) => {
            let waiters = capWaiters.get(functionKey)
            if (!waiters) {
              waiters = []
              capWaiters.set(functionKey, waiters)
            }
            waiters.push({ resolve })
          })
          // Re-check pool after waking (the set reference may have been replaced).
          continue
        }

        // No idle entry — spawn a new one.
        if (!entry) {
          // Re-fetch set in case pool was rebuilt during a prior await.
          let currentSet = pool.get(functionKey)
          if (!currentSet) {
            currentSet = new Set()
            pool.set(functionKey, currentSet)
          }
          entry = _spawnEntry({
            functionKey,
            handlerPath,
            handlerName,
            set: currentSet,
          })
          // Update local `set` reference so the cap check below is consistent.
          set = currentSet
        }

        // Wait for the worker to signal it has imported the handler.
        // If the entry is cancelled before it sends 'ready', workerReady
        // rejects. We distinguish the two cancellation reasons:
        //  - Runner shutdown (`terminate()`): propagate the tagged error so
        //    the caller knows the invocation was aborted — silently retrying
        //    against a fresh worker that gets spawned by a never-resolving
        //    loop after teardown would surprise the caller.
        //  - Anything else (invalidate, worker spawn error): retry the loop
        //    so the invocation lands on a healthy worker.
        // Bound the readiness wait with the invocation timeout so a handler
        // whose module never finishes importing (e.g. an unresolved top-level
        // await) fails with a timeout instead of hanging the request forever.
        // Only wrap when a timeout is configured — awaiting workerReady directly
        // otherwise keeps the original microtask timing the pool relies on
        // (a reused idle worker must reach 'busy' in the same tick as before).
        let readyTimer = null
        try {
          if (timeoutMs == null) {
            await entry.workerReady
          } else {
            await new Promise((resolve, reject) => {
              entry.workerReady.then(resolve, reject)
              readyTimer = setTimeout(() => {
                reject(
                  new ServerlessError(
                    `Lambda invocation timed out after ${timeoutMs} ms`,
                    'OFFLINE_HANDLER_TIMEOUT',
                  ),
                )
              }, timeoutMs)
            })
          }
        } catch (readyErr) {
          if (readyTimer !== null) clearTimeout(readyTimer)
          if (readyErr?.code === 'OFFLINE_HANDLER_TIMEOUT') {
            // The worker never finished importing the handler in time — tear it
            // down so it does not linger, then surface the timeout.
            const timedOutSet = pool.get(functionKey)
            if (timedOutSet) {
              timedOutSet.delete(entry)
              if (timedOutSet.size === 0) pool.delete(functionKey)
            }
            _terminateEntry(entry).catch(() => {})
            _wakeCapWaiter(functionKey)
            throw readyErr
          }
          // Deterministic failures (handler load error, unexpected worker exit,
          // runner shutdown) propagate to the caller instead of retrying — a
          // broken handler would otherwise respawn-and-fail forever.
          if (
            readyErr?.code === 'OFFLINE_HANDLER_LOAD_FAILED' ||
            readyErr?.code === 'OFFLINE_WORKER_EXITED' ||
            readyErr?.code === 'OFFLINE_WORKER_ERROR' ||
            readyErr?.code === 'OFFLINE_WORKER_TERMINATED'
          ) {
            throw readyErr
          }
          // The worker was cancelled before it became ready (e.g. invalidate()).
          // The 'error'/'exit' handlers already removed it from the set.
          // Retry — the outer loop will use an idle entry or spawn a fresh one.
          continue
        }
        if (readyTimer !== null) clearTimeout(readyTimer)

        // After workerReady resolves, verify the entry is still in the set.
        // invalidate() may have evicted it while we were awaiting.
        const currentSet = pool.get(functionKey)
        if (!currentSet || !currentSet.has(entry)) {
          // Entry was evicted; retry.
          continue
        }

        // Guard: entry may have been marked terminating between ready and here.
        if (entry.state === 'terminating') {
          continue
        }

        // Cancel idle eviction — the worker is about to be used.
        if (entry.idleTimer !== null) {
          clearTimeout(entry.idleTimer)
          entry.idleTimer = null
        }

        entry.state = 'busy'

        // Capture the set reference for use in the timeout closure below.
        const entrySet = currentSet

        return new Promise((resolve, reject) => {
          entry.pendingResult = { resolve, reject }

          if (timeoutMs != null) {
            entry.pendingTimeout = setTimeout(() => {
              entry.pendingTimeout = null
              entry.pendingResult = null
              entrySet.delete(entry)
              if (entrySet.size === 0) pool.delete(functionKey)
              _terminateEntry(entry).catch(() => {})
              _wakeCapWaiter(functionKey)
              reject(
                new ServerlessError(
                  `Lambda invocation timed out after ${timeoutMs} ms`,
                  'OFFLINE_HANDLER_TIMEOUT',
                ),
              )
            }, timeoutMs)
          }

          entry.worker.postMessage({
            type: 'invoke',
            event,
            context,
            environment,
          })
        })
      }
    },

    /**
     * Mark all workers for a function as stale and terminate them.
     *
     * Idle workers are terminated immediately. Busy workers are marked for
     * termination after their current invocation completes — in-flight calls
     * are not interrupted.
     *
     * @param {string} functionKey
     */
    invalidate(functionKey) {
      const set = pool.get(functionKey)
      if (!set) return

      for (const entry of set) {
        if (entry.state === 'idle' || entry.state === 'spawning') {
          // Terminate immediately.
          set.delete(entry)
          _terminateEntry(entry).catch(() => {})
        } else if (entry.state === 'busy') {
          // Let the current invocation finish; then terminate.
          entry.terminateAfterCurrent = true
        }
        // 'terminating' entries are already on their way out — skip.
      }

      if (set.size === 0 || [...set].every((e) => e.state === 'terminating')) {
        pool.delete(functionKey)
      }

      // Wake cap-waiters so they can try again (the pool shrank).
      _wakeCapWaiter(functionKey)
    },

    /**
     * Tear down all workers in the pool and clear all timers.
     *
     * Safe to call multiple times (idempotent). After `terminate()` returns,
     * the runner can still accept new `invoke()` calls — each will spawn a
     * fresh worker.
     *
     * @returns {Promise<void>}
     */
    async terminate() {
      const terminatePromises = []

      for (const [, set] of pool) {
        for (const entry of set) {
          terminatePromises.push(
            _terminateEntry(entry, 'terminate').catch(() => {}),
          )
        }
        set.clear()
      }
      pool.clear()

      // Wake all cap-waiters so their invoke() calls can fail-fast or retry.
      for (const [, waiters] of capWaiters) {
        while (waiters.length) waiters.shift().resolve()
      }
      capWaiters.clear()

      await Promise.all(terminatePromises)
    },
  }

  return runner
}
