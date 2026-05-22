import { Worker } from 'node:worker_threads'
import ServerlessError from '../../../../../serverless-error.js'
import { DEFAULT_TERMINATE_IDLE_LAMBDA_TIME } from '../constants.js'

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
 * Keeps one warm `worker_threads.Worker` per `functionKey`, reusing it across
 * invocations. Workers are evicted (terminated) after `terminateIdleLambdaTime`
 * seconds of inactivity. This eliminates the per-invocation worker-startup cost
 * (~50–200 ms) at the expense of keeping idle workers alive.
 *
 * **Concurrency note**: concurrent invocations on the same `functionKey` are
 * serialized — they run one at a time on the single warm worker for that
 * function. A future update will introduce per-function worker pools to support
 * concurrent invocations.
 *
 * @param {object} options
 * @param {string} options.servicePath              Absolute path to the Serverless service root.
 * @param {number} [options.terminateIdleLambdaTime] Idle eviction timeout in seconds (default: 60).
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createWorkerThreadRunner({
  servicePath,
  terminateIdleLambdaTime = DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
} = {}) {
  /**
   * Pool of warm workers, keyed by functionKey.
   *
   * @type {Map<string, WorkerEntry>}
   *
   * WorkerEntry shape:
   * {
   *   state: 'idle' | 'busy' | 'terminating',
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
   *   waiters: Array<() => void>,          // callbacks waiting for the entry to go idle
   * }
   */
  const pool = new Map()

  // ---------------------------------------------------------------------------
  // Private: spawn a new WorkerEntry
  // ---------------------------------------------------------------------------

  /**
   * Spawn a new worker for the given function and return its entry.
   * The caller is responsible for inserting the entry into the pool.
   *
   * @param {object} params
   * @param {string} params.functionKey
   * @param {string} params.handlerPath
   * @param {string} params.handlerName
   * @returns {WorkerEntry}
   */
  function _spawnEntry({ functionKey, handlerPath, handlerName }) {
    const worker = new Worker(workerEntryPath, {
      workerData: { handlerPath, handlerName, servicePath },
    })

    /** @type {WorkerEntry} */
    const entry = {
      state: 'idle',
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
      waiters: [],
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
        pool.delete(functionKey)
        entry.state = 'terminating'
        rej(err)
        for (const next of entry.waiters.splice(0)) next()
      } else {
        pool.delete(functionKey)
        entry.state = 'terminating'
        for (const next of entry.waiters.splice(0)) next()
      }
    })

    // Set up the persistent per-invocation message handler for this worker.
    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        if (entry._resolveReady) {
          entry._resolveReady()
          entry._resolveReady = null
          entry._rejectReady = null
        }
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
          pool.delete(functionKey)
          _terminateEntry(entry).catch(() => {})
        } else {
          entry.state = 'idle'
          // Schedule idle eviction. unref() allows the process to exit
          // cleanly even if the timer is still pending.
          entry.idleTimer = setTimeout(() => {
            pool.delete(functionKey)
            _terminateEntry(entry).catch(() => {})
          }, terminateIdleLambdaTime * 1000).unref()
        }

        // Resolve or reject the caller.
        if (msg.type === 'success') {
          resolve(msg.value)
        } else {
          reject(rebuildError(msg.error))
        }

        // Notify the next waiting invocation (if any).
        const next = entry.waiters.shift()
        if (next) next()
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
    if (entry.pendingTimeout !== null) {
      clearTimeout(entry.pendingTimeout)
      entry.pendingTimeout = null
    }
    entry.state = 'terminating'
    // If the entry is being terminated before the worker sent 'ready',
    // reject workerReady so any invoke() awaiting it can detect the cancellation.
    if (entry._rejectReady) {
      entry._rejectReady(new Error('Worker terminated before ready'))
      entry._resolveReady = null
      entry._rejectReady = null
    }
    // Wake any waiters so they can re-check and spawn a fresh entry.
    for (const next of entry.waiters.splice(0)) next()
    await entry.worker.terminate()
  }

  // ---------------------------------------------------------------------------
  // Runner object
  // ---------------------------------------------------------------------------

  const runner = {
    /**
     * Invoke a Node handler in a pooled worker_threads.Worker.
     *
     * The worker is kept alive after each invocation and reused on the next
     * call with the same `functionKey`. It is evicted after
     * `terminateIdleLambdaTime` seconds of inactivity.
     *
     * Concurrent invocations on the same `functionKey` are serialized.
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
        let entry = pool.get(functionKey)

        // Evict stale entry when handler path/name changed (e.g. config reload).
        if (
          entry &&
          (entry.handlerPath !== handlerPath ||
            entry.handlerName !== handlerName)
        ) {
          pool.delete(functionKey)
          await _terminateEntry(entry)
          entry = null
        }

        // Spin a fresh entry if none exists.
        if (!entry) {
          entry = _spawnEntry({ functionKey, handlerPath, handlerName })
          pool.set(functionKey, entry)
        }

        // Wait for the worker to signal it has imported the handler.
        // If the entry is cancelled (invalidated/terminated) before it sends
        // 'ready', workerReady rejects and we retry with a fresh entry.
        try {
          await entry.workerReady
        } catch {
          // The worker was cancelled before it became ready.
          // If this entry is still in the pool (shouldn't be, but guard),
          // remove it and try again.
          if (pool.get(functionKey) === entry) {
            pool.delete(functionKey)
          }
          // Retry — the outer loop will spin a fresh entry.
          continue
        }

        // After workerReady resolves, verify the entry is still in the pool.
        // invalidate() may have evicted it while we were awaiting.
        if (pool.get(functionKey) !== entry) {
          // Entry was evicted; retry with whatever is in the pool now (or fresh).
          continue
        }

        // Serialize concurrent invocations on the same functionKey.
        while (entry.state === 'busy') {
          await new Promise((resolve) => {
            entry.waiters.push(resolve)
          })
          // After waking, re-check that this entry is still the active one.
          if (pool.get(functionKey) !== entry) {
            // Entry was replaced (e.g. invalidated); restart the outer loop.
            break
          }
        }

        // If the entry is no longer in the pool (replaced while we waited),
        // restart the outer loop to get the new entry.
        if (pool.get(functionKey) !== entry) {
          continue
        }

        // If the entry was terminated while we waited (e.g. by a timeout),
        // restart to spawn a fresh one.
        if (entry.state === 'terminating') {
          continue
        }

        // Cancel idle eviction — the worker is about to be used.
        if (entry.idleTimer !== null) {
          clearTimeout(entry.idleTimer)
          entry.idleTimer = null
        }

        entry.state = 'busy'

        return new Promise((resolve, reject) => {
          entry.pendingResult = { resolve, reject }

          if (timeoutMs != null) {
            entry.pendingTimeout = setTimeout(() => {
              entry.pendingTimeout = null
              entry.pendingResult = null
              pool.delete(functionKey)
              _terminateEntry(entry).catch(() => {})
              reject(
                new ServerlessError(
                  `Lambda invocation timed out after ${timeoutMs} ms`,
                  'OFFLINE_HANDLER_TIMEOUT',
                ),
              )
              // Wake up any waiters so they can spawn a fresh worker.
              for (const next of entry.waiters.splice(0)) next()
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
     * Mark a function's worker as stale and terminate it.
     *
     * If the worker is currently idle (or initializing), it is terminated
     * immediately and the pool entry is removed. The next `invoke()` call for
     * this `functionKey` will spawn a fresh worker that imports the current
     * code on disk.
     *
     * If the worker is busy, it is marked for termination after the current
     * invocation completes — the in-flight invocation is not interrupted.
     *
     * @param {string} functionKey
     */
    invalidate(functionKey) {
      const entry = pool.get(functionKey)
      if (!entry) return

      if (entry.state === 'busy') {
        // Let the current invocation finish; then terminate.
        entry.terminateAfterCurrent = true
      } else {
        // Idle or still initializing — terminate immediately.
        pool.delete(functionKey)
        _terminateEntry(entry).catch(() => {})
      }
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
      const entries = [...pool.values()]
      pool.clear()
      await Promise.all(entries.map((e) => _terminateEntry(e).catch(() => {})))
    },
  }

  return runner
}
