import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { log } from '@serverless/util'

import { buildLambdaRuntimeEnv } from './lambda-env.js'
import { createUtf8Decoder } from './utf8-decoder.js'
import {
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  DEFAULT_MAX_CONCURRENT_INVOCATIONS,
} from '../constants.js'
import ServerlessError from '../../../../../serverless-error.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WRAPPER = path.resolve(__dirname, 'wrappers/ruby/invoke.rb')
const ENVELOPE_KEY = '__offline_payload__'

const logger = log.get('sls:offline:ruby')

/**
 * @typedef {object} PoolEntry
 * @property {import('node:child_process').ChildProcessWithoutNullStreams} child
 * @property {import('node:readline').Interface} rl
 * @property {NodeJS.Timeout | null} idleTimer
 * @property {NodeJS.Timeout | null} pendingTimeout
 * @property {{ resolve: (v: unknown) => void, reject: (e: Error) => void } | null} pending
 * @property {Buffer[]} stderrChunks
 * @property {'idle' | 'busy' | 'terminating'} state
 * @property {'invalidate' | 'terminate' | null} cancelReason
 *   Set before the deliberate `child.kill()` that drops this entry, so the
 *   'exit' handler picks the right error envelope for any in-flight invoke.
 *   `'terminate'` produces ServerlessError(OFFLINE_WORKER_TERMINATED). `'invalidate'` is
 *   tagged symmetrically with the worker-thread runner but currently falls
 *   through to the generic exit diagnostic.
 * @property {Promise<void>} exited  Resolves when the child process emits 'exit'.
 */

/**
 * Ruby child-process Lambda runner. Keeps a pool of long-lived `ruby`
 * processes keyed by functionKey, reused across invocations so module-level
 * Ruby state (global $vars, cached requires, connection pools) survives
 * between requests. Mirrors the Python runner's pool semantics one-for-one;
 * the only protocol differences are language (no `-u` flag — the wrapper
 * `$stdout.flush`es explicitly) and file extension (`.rb` vs `.py`).
 *
 * Concurrent invocations on the same functionKey run in parallel — each gets
 * its own child process (or reuses an idle one). A single child handles one
 * invocation at a time (its stdin/stdout protocol is sequential), so the pool
 * holds a Set of children per key and grows on demand up to
 * `maxConcurrentInvocations`; beyond that, new invocations wait for a slot to
 * free up. This matches real Lambda's per-execution-environment model, where
 * concurrent requests are served by separate sandboxes.
 *
 * Idle eviction: `idleEvictionMs` milliseconds after an invoke settles on a
 * given child, that child is killed and removed from the pool; the next
 * invoke that needs it spawns fresh. Set to 0 or a negative number to
 * disable eviction (children live until terminate()/invalidate()).
 *
 * The wrapper (lib/runners/wrappers/ruby/invoke.rb) reads one JSON event
 * per line from stdin and writes one JSON envelope per result line to
 * stdout. Non-envelope stdout lines are handler puts()/log output —
 * forwarded to the offline logger at notice level. stderr is forwarded
 * at error level and also buffered for the exit-without-envelope
 * diagnostic.
 *
 * Public shape mirrors createPythonRunner / createWorkerThreadRunner /
 * createInProcessRunner so the Lambda facade dispatches by runtime.
 *
 * @param {object} [options]
 * @param {number} [options.idleEvictionMs]  Default 60_000 ms (60 seconds).
 *   Pass <= 0 to disable eviction. Milliseconds — unit is explicit in the
 *   name to disambiguate from the user-facing `terminateIdleLambdaTime`
 *   which is in seconds.
 * @param {number} [options.maxConcurrentInvocations]  Max concurrent children
 *   per functionKey (default: 100).
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createRubyRunner({
  idleEvictionMs = DEFAULT_TERMINATE_IDLE_LAMBDA_TIME * 1000,
  maxConcurrentInvocations = DEFAULT_MAX_CONCURRENT_INVOCATIONS,
} = {}) {
  /**
   * Pool of warm children, keyed by functionKey. Each value is a Set of
   * PoolEntry objects — a function can have several concurrent children, one
   * per in-flight invocation, up to maxConcurrentInvocations.
   *
   * @type {Map<string, Set<PoolEntry>>}
   */
  const pool = new Map()

  /**
   * Invocations blocked at the concurrency cap for a given functionKey.
   * Each entry: { resolve: () => void }
   *
   * @type {Map<string, Array<{ resolve: () => void }>>}
   */
  const capWaiters = new Map()

  /**
   * Wake one cap-level waiter for a functionKey (a slot just freed up).
   *
   * @param {string} functionKey
   */
  function _wakeCapWaiter(functionKey) {
    const waiters = capWaiters.get(functionKey)
    if (waiters && waiters.length > 0) {
      waiters.shift().resolve()
    }
  }

  /**
   * Remove an entry from its functionKey's set, dropping the set from the
   * pool when it becomes empty.
   *
   * @param {string} functionKey
   * @param {PoolEntry} entry
   */
  function _removeFromPool(functionKey, entry) {
    const set = pool.get(functionKey)
    if (!set) return
    set.delete(entry)
    if (set.size === 0) pool.delete(functionKey)
  }

  /**
   * Spawn a fresh Ruby child and wire all event handlers. The new entry is
   * added to the functionKey's set immediately so the concurrency cap is
   * enforced correctly while the child boots.
   *
   * The wrapper does `require("./#{handler_path}")` — Ruby's `require`
   * is relative to the current working directory, so spawn the child
   * with cwd = the handler's directory and pass just the basename
   * (no .rb extension).
   *
   * @param {string} functionKey
   * @param {string} handlerPath
   * @param {string} handlerName
   * @param {Record<string, string>} env  Merged with process.env for the child.
   * @param {Set<PoolEntry>} set  The set to add this entry to.
   * @returns {PoolEntry}
   */
  function _spawn(functionKey, handlerPath, handlerName, env, set) {
    const handlerDir = path.dirname(handlerPath)
    const handlerModule = path.basename(handlerPath).replace(/\.rb$/, '')

    const child = spawn('ruby', [WRAPPER, handlerModule, handlerName], {
      cwd: handlerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })

    const rl = createInterface({ input: child.stdout })

    /** @type {PoolEntry} */
    const entry = {
      child,
      rl,
      idleTimer: null,
      pendingTimeout: null,
      pending: null,
      stderrChunks: [],
      state: 'idle',
      cancelReason: null,
      exited: null,
    }

    set.add(entry)

    entry.exited = new Promise((resolveExit) => {
      child.once('exit', (code) => {
        // Drop this entry from the pool and free up its concurrency slot.
        _removeFromPool(functionKey, entry)
        _clearEviction(entry)
        // Disarm the timeout timer if it's still pending — without this,
        // a slow handler that crashes BEFORE its timeoutMs would leave a
        // stale timer that wakes later, finds entry.pending = null (we
        // null it below) and silently no-ops, but keeps an event-loop
        // handle alive for up to timeoutMs.
        if (entry.pendingTimeout !== null) {
          clearTimeout(entry.pendingTimeout)
          entry.pendingTimeout = null
        }
        try {
          rl.close()
        } catch {
          // ignore
        }

        // If an invocation was in flight, reject it. The 'terminate'
        // branch produces ServerlessError(OFFLINE_WORKER_TERMINATED) to
        // match the worker-thread runner. Other paths fall through to the
        // generic diagnostic with any buffered stderr.
        if (entry.pending !== null) {
          const { reject } = entry.pending
          entry.pending = null
          if (entry.cancelReason === 'terminate') {
            reject(
              new ServerlessError(
                'Lambda runner terminated during invocation',
                'OFFLINE_WORKER_TERMINATED',
              ),
            )
          } else {
            const stderr = Buffer.concat(entry.stderrChunks).toString().trim()
            reject(
              new Error(
                `Ruby handler process exited with code ${code} before returning a result.${
                  stderr ? `\nstderr:\n${stderr}` : ''
                }`,
              ),
            )
          }
        }

        entry.state = 'terminating'
        // The set shrank — a blocked invocation can now claim a slot.
        _wakeCapWaiter(functionKey)
        resolveExit()
      })
    })

    rl.on('line', (line) => {
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        // Not JSON → handler puts()/log line. Forward as notice so
        // users see Ruby `puts 'debugging x'` in the same offline log
        // stream as the rest of the request lifecycle.
        if (line.length > 0) logger.notice(line)
        return
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        Object.hasOwn(parsed, ENVELOPE_KEY)
      ) {
        if (entry.pending === null) {
          // Stray envelope (no invocation in flight) — ignore.
          return
        }
        if (entry.pendingTimeout !== null) {
          clearTimeout(entry.pendingTimeout)
          entry.pendingTimeout = null
        }
        const { resolve } = entry.pending
        entry.pending = null
        // Reset the stderr buffer so a later exit diagnostic doesn't
        // include leftover noise from this completed invocation.
        entry.stderrChunks = []
        entry.state = 'idle'
        resolve(parsed[ENVELOPE_KEY])
        _scheduleEviction(functionKey, entry)
        // The child is idle again — let a blocked invocation reuse it.
        _wakeCapWaiter(functionKey)
        return
      }
      // JSON-but-not-our-envelope: treat as handler log output.
      if (line.length > 0) logger.notice(line)
    })

    const decodeStderr = createUtf8Decoder()
    child.stderr.on('data', (d) => {
      entry.stderrChunks.push(d)
      // Decode through a persistent decoder so a multi-byte character split
      // across two `data` events is reassembled rather than corrupted. Forward
      // each line; trim the final newline so logger output doesn't double-space.
      const chunk = decodeStderr(d)
      for (const line of chunk.split('\n')) {
        if (line.length > 0) logger.error(line)
      }
    })

    child.once('error', (err) => {
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      if (entry.pending !== null) {
        const { reject } = entry.pending
        entry.pending = null
        reject(err)
      }
      entry.state = 'terminating'
      _removeFromPool(functionKey, entry)
      _clearEviction(entry)
      _wakeCapWaiter(functionKey)
      try {
        child.kill()
      } catch {
        // ignore
      }
    })

    child.stdin.on('error', (err) => {
      if (entry.pending !== null) {
        const { reject } = entry.pending
        entry.pending = null
        reject(err)
      }
    })

    return entry
  }

  /**
   * Arm the idle-eviction timer for an entry. No-op if eviction is
   * disabled (idleEvictionMs <= 0).
   *
   * @param {string} functionKey
   * @param {PoolEntry} entry
   */
  function _scheduleEviction(functionKey, entry) {
    if (idleEvictionMs <= 0) return
    _clearEviction(entry)
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null
      if (entry.state !== 'idle') return
      entry.state = 'terminating'
      _removeFromPool(functionKey, entry)
      try {
        entry.child.kill()
      } catch {
        // ignore — child may already be gone
      }
    }, idleEvictionMs)
  }

  /**
   * Cancel any pending idle-eviction timer on the entry.
   *
   * @param {PoolEntry} entry
   */
  function _clearEviction(entry) {
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = null
    }
  }

  return {
    /**
     * Invoke a Ruby handler in a pooled child process.
     *
     * Concurrent invocations on the same `functionKey` run in parallel — each
     * gets its own child (or reuses an idle one), up to
     * `maxConcurrentInvocations`. Beyond that, the invocation waits for a slot
     * to free up. This matches real Lambda's per-execution-environment model.
     *
     * @param {object} args
     * @param {string} args.functionKey
     * @param {string} args.handlerPath  Absolute path to the .rb file.
     * @param {string} args.handlerName  Either a bare method (`handler`) or
     *   `Module::Class.method` form — the wrapper resolves both.
     * @param {unknown} args.event
     * @param {object} args.context
     * @param {Record<string, string>} [args.environment]  User-level env vars
     *   merged ON TOP of the AWS_LAMBDA_* runtime block at spawn time.
     * @param {number} [args.timeoutMs]  When set, the invoke is raced against
     *   a setTimeout — on expiry the child is killed, the pool entry dropped,
     *   and the promise rejects with ServerlessError(OFFLINE_HANDLER_TIMEOUT).
     *   Also translated to seconds (`timeout`) for the wrapper's
     *   get_remaining_time_in_millis.
     * @returns {Promise<unknown>}
     */
    async invoke({
      functionKey,
      handlerPath,
      handlerName,
      event,
      context,
      environment,
      timeoutMs,
    }) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let set = pool.get(functionKey)
        if (!set) {
          set = new Set()
          pool.set(functionKey, set)
        }

        // Find an existing idle child to reuse.
        let entry = null
        for (const e of set) {
          if (e.state === 'idle') {
            entry = e
            break
          }
        }

        // No idle child — honour the concurrency cap before spawning a new one.
        if (!entry && set.size >= maxConcurrentInvocations) {
          await new Promise((resolve) => {
            let waiters = capWaiters.get(functionKey)
            if (!waiters) {
              waiters = []
              capWaiters.set(functionKey, waiters)
            }
            waiters.push({ resolve })
          })
          // Re-evaluate from the top: an idle child may now be available, or a
          // slot may have freed up so we can spawn.
          continue
        }

        if (!entry) {
          // Env captured at spawn time and stable for the child's lifetime —
          // matches real Lambda's per-execution-env model. Per-key isolation
          // means each function gets its own snapshot of the runtime block +
          // user env.
          const region =
            context?.region ?? process.env.AWS_REGION ?? 'us-east-1'
          const functionName = context?.functionName
          const memoryLimitInMB = String(context?.memoryLimitInMB ?? 1024)
          const logGroupName =
            context?.logGroupName ?? `/aws/lambda/${functionName}`
          const logStreamName = context?.logStreamName ?? ''
          const lambdaEnv = buildLambdaRuntimeEnv({
            functionName,
            memoryLimitInMB,
            invokedFunctionArn: context?.invokedFunctionArn,
            logGroupName,
            logStreamName,
            handler: context?.handler,
            region,
            isOffline: context?.isOffline,
            endpointUrl: context?.endpointUrl,
            accessKeyId: context?.accessKeyId,
            secretAccessKey: context?.secretAccessKey,
            authorizer: context?.authorizer,
          })
          entry = _spawn(
            functionKey,
            handlerPath,
            handlerName,
            { ...lambdaEnv, ...(environment ?? {}) },
            set,
          )
        }

        _clearEviction(entry)
        entry.state = 'busy'

        // Translate the JS-side context to the camelCase keys the wrapper's
        // FakeLambdaContext reads. The wrapper already accepts camelCase
        // verbatim, so the only field that needs adapting is the
        // user-facing `timeoutMs` (milliseconds) → wrapper-side `timeout`
        // (seconds, used by get_remaining_time_in_millis).
        const wrapperContext = {
          ...context,
          ...(timeoutMs != null ? { timeout: timeoutMs / 1000 } : {}),
        }

        return new Promise((resolve, reject) => {
          entry.pending = { resolve, reject }
          if (timeoutMs != null) {
            entry.pendingTimeout = setTimeout(() => {
              entry.pendingTimeout = null
              entry.pending = null
              entry.state = 'terminating'
              _removeFromPool(functionKey, entry)
              _wakeCapWaiter(functionKey)
              try {
                entry.child.kill()
              } catch {
                // ignore
              }
              reject(
                new ServerlessError(
                  `Task timed out after ${(timeoutMs / 1000).toFixed(2)} seconds`,
                  'OFFLINE_HANDLER_TIMEOUT',
                ),
              )
            }, timeoutMs)
          }
          try {
            entry.child.stdin.write(
              JSON.stringify({ event, context: wrapperContext }),
            )
            entry.child.stdin.write('\n')
          } catch (err) {
            // Synchronous write failure (e.g. child already dead) — reject
            // and let the stdin/error handlers do their cleanup.
            if (entry.pendingTimeout !== null) {
              clearTimeout(entry.pendingTimeout)
              entry.pendingTimeout = null
            }
            if (entry.pending !== null) {
              entry.pending = null
              reject(err)
            }
          }
        })
      }
    },

    /**
     * Kill every child for a single functionKey and drop them from the pool.
     * A subsequent invoke on the same key spawns fresh.
     *
     * @param {string} functionKey
     */
    invalidate(functionKey) {
      const set = pool.get(functionKey)
      if (!set) return
      pool.delete(functionKey)
      for (const entry of set) {
        entry.cancelReason = 'invalidate'
        _clearEviction(entry)
        // Symmetric with terminate(): clear any armed timeout so it can't fire
        // after we've killed the child and rejected the pending invoke.
        if (entry.pendingTimeout !== null) {
          clearTimeout(entry.pendingTimeout)
          entry.pendingTimeout = null
        }
        entry.state = 'terminating'
        try {
          entry.child.kill()
        } catch {
          // ignore
        }
      }
      // Wake any waiters so their invoke() can spawn fresh against the now-
      // empty key.
      _wakeCapWaiter(functionKey)
    },

    /**
     * Kill every live child and wait for each to exit.
     *
     * @returns {Promise<void>}
     */
    async terminate() {
      const exits = []
      for (const set of pool.values()) {
        for (const entry of set) {
          entry.cancelReason = 'terminate'
          entry.state = 'terminating'
          _clearEviction(entry)
          // Clear any in-flight timeout timer so it can't fire after the
          // kill and produce a stray OFFLINE_HANDLER_TIMEOUT alongside the
          // terminate rejection.
          if (entry.pendingTimeout !== null) {
            clearTimeout(entry.pendingTimeout)
            entry.pendingTimeout = null
          }
          exits.push(entry.exited)
          try {
            entry.child.kill()
          } catch {
            // ignore
          }
        }
      }
      pool.clear()
      // Wake all cap-waiters so their blocked invoke() calls can retry against
      // the now-empty pool.
      for (const [, waiters] of capWaiters) {
        while (waiters.length) waiters.shift().resolve()
      }
      capWaiters.clear()
      await Promise.all(exits)
    },
  }
}
