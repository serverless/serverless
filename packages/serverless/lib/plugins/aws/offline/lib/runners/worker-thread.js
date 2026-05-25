import { Worker } from 'node:worker_threads'
import ServerlessError from '../../../../../serverless-error.js'
import {
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  DEFAULT_MAX_CONCURRENT_INVOCATIONS,
} from '../constants.js'

const workerEntryPath = new URL('./worker-entry.js', import.meta.url)

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
 * `terminateIdleLambdaTime` seconds of inactivity.
 *
 * @param {object} options
 * @param {string} options.servicePath                  Absolute path to the Serverless service root.
 * @param {number} [options.terminateIdleLambdaTime]    Idle eviction timeout in seconds (default: 60).
 * @param {number} [options.maxConcurrentInvocations]   Max concurrent workers per functionKey (default: 100).
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createWorkerThreadRunner({
  servicePath,
  terminateIdleLambdaTime = DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
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
        entry._rejectReady(err)
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
          }, terminateIdleLambdaTime * 1000).unref()
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
   * Terminate a worker entry, clearing its timers.
   * Also cancels a pending workerReady so any invoke() awaiting it unblocks.
   *
   * @param {WorkerEntry} entry
   * @returns {Promise<void>}
   */
  async function _terminateEntry(entry) {
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = null
    }
    entry.state = 'terminating'
    // If the entry is being terminated before the worker sent 'ready',
    // reject workerReady so any invoke() awaiting it can detect the cancellation.
    if (entry._rejectReady) {
      entry._rejectReady(new Error('Worker terminated before ready'))
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
     * by later invocations. They are evicted after `terminateIdleLambdaTime`
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
        // If the entry is cancelled (invalidated/terminated) before it sends
        // 'ready', workerReady rejects and we retry with a fresh entry.
        try {
          await entry.workerReady
        } catch {
          // The worker was cancelled before it became ready.
          // The 'error'/'exit' handlers already removed it from the set.
          // Retry — the outer loop will use an idle entry or spawn a fresh one.
          continue
        }

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
          terminatePromises.push(_terminateEntry(entry).catch(() => {}))
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
