import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { log } from '@serverless/util'
import { buildLambdaRuntimeEnv } from './lambda-env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WRAPPER = path.resolve(__dirname, 'wrappers/python/invoke.py')
const ENVELOPE_KEY = '__offline_payload__'
const DEFAULT_TERMINATE_IDLE_LAMBDA_TIME = 60_000

const logger = log.get('sls:offline:python')

/**
 * @typedef {object} PoolEntry
 * @property {import('node:child_process').ChildProcessWithoutNullStreams} child
 * @property {import('node:readline').Interface} rl
 * @property {NodeJS.Timeout | null} idleTimer
 * @property {{ resolve: (v: unknown) => void, reject: (e: Error) => void } | null} pending
 * @property {Buffer[]} stderrChunks
 * @property {'spawning' | 'idle' | 'busy' | 'terminating'} state
 * @property {Promise<void>} exited  Resolves when the child process emits 'exit'.
 */

/**
 * Python child-process Lambda runner. Maintains a pool of long-lived
 * `python3` processes keyed by functionKey — one child per key, reused
 * across invocations so module-level Python state (cached imports,
 * counters, connection pools) survives between requests. Mirrors the
 * worker-thread runner's pool semantics on a smaller surface (no
 * concurrency cap yet — single in-flight per key, which matches real
 * Lambda's per-execution-environment model).
 *
 * Idle eviction: `terminateIdleLambdaTime` ms after the last invoke
 * settles, the child is killed and removed from the pool; the next
 * invoke on that key spawns fresh. Set to 0 or a negative number to
 * disable eviction (children live until terminate()/invalidate()).
 *
 * The wrapper (lib/runners/wrappers/python/invoke.py) reads one JSON
 * event per line from stdin and writes one JSON envelope per result
 * line to stdout. Non-envelope stdout lines are handler print()/log
 * output — forwarded to the offline logger at notice level. stderr is
 * forwarded at error level and also buffered for the
 * exit-without-envelope diagnostic.
 *
 * Public shape mirrors createWorkerThreadRunner / createInProcessRunner
 * so the Lambda facade picks between runners without further changes.
 *
 * @param {object} [options]
 * @param {number} [options.terminateIdleLambdaTime]  Default 60_000 ms.
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createPythonRunner({
  terminateIdleLambdaTime = DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
} = {}) {
  /** @type {Map<string, PoolEntry>} */
  const pool = new Map()

  /**
   * Spawn a fresh Python child and wire all event handlers.
   *
   * The wrapper takes a module path WITHOUT the .py extension and does
   * `import_module(arg.replace(os.sep, '.'))` after appending '.' to
   * sys.path. Passing an absolute path verbatim produces a leading-dot
   * name (".Users.foo.bar") that Python treats as a relative import.
   * Spawn the child with cwd = the handler's directory and pass the
   * bare module basename so the wrapper's `sys.path.append('.')` finds it.
   *
   * @param {string} functionKey
   * @param {string} handlerPath
   * @param {string} handlerName
   * @param {Record<string, string>} env  Merged with process.env for the child.
   * @returns {PoolEntry}
   */
  function _spawn(functionKey, handlerPath, handlerName, env) {
    const handlerDir = path.dirname(handlerPath)
    const handlerModule = path.basename(handlerPath).replace(/\.py$/, '')

    const child = spawn(
      'python3',
      ['-u', WRAPPER, handlerModule, handlerName],
      {
        cwd: handlerDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      },
    )

    const rl = createInterface({ input: child.stdout })

    /** @type {PoolEntry} */
    const entry = {
      child,
      rl,
      idleTimer: null,
      pending: null,
      stderrChunks: [],
      state: 'spawning',
      exited: null,
    }

    entry.exited = new Promise((resolveExit) => {
      child.once('exit', (code) => {
        // Drop this entry from the pool (only if it's still the one
        // registered — invalidate()/terminate() may have replaced or
        // removed it already).
        if (pool.get(functionKey) === entry) {
          pool.delete(functionKey)
        }
        _clearEviction(entry)
        try {
          rl.close()
        } catch {
          // ignore
        }

        // If an invocation was in flight, reject it with a diagnostic
        // that includes any buffered stderr — matches the pre-pool
        // (T4) error message.
        if (entry.pending !== null) {
          const stderr = Buffer.concat(entry.stderrChunks).toString().trim()
          const { reject } = entry.pending
          entry.pending = null
          reject(
            new Error(
              `Python handler process exited with code ${code} before returning a result.${
                stderr ? `\nstderr:\n${stderr}` : ''
              }`,
            ),
          )
        }

        entry.state = 'terminating'
        resolveExit()
      })
    })

    rl.on('line', (line) => {
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        // Not JSON → handler print()/log line. Forward as notice so
        // users see Python `print('debugging x')` in the same offline
        // log stream as the rest of the request lifecycle.
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
        const { resolve } = entry.pending
        entry.pending = null
        // Reset the stderr buffer so a later exit diagnostic doesn't
        // include leftover noise from this completed invocation.
        entry.stderrChunks = []
        entry.state = 'idle'
        resolve(parsed[ENVELOPE_KEY])
        _scheduleEviction(functionKey, entry)
        return
      }
      // JSON-but-not-our-envelope: treat as handler log output.
      if (line.length > 0) logger.notice(line)
    })

    child.stderr.on('data', (d) => {
      const chunk = d.toString()
      entry.stderrChunks.push(d)
      // Forward each line; trim the final newline so logger output
      // doesn't double-space.
      for (const line of chunk.split('\n')) {
        if (line.length > 0) logger.error(line)
      }
    })

    child.once('error', (err) => {
      if (entry.pending !== null) {
        const { reject } = entry.pending
        entry.pending = null
        reject(err)
      }
      entry.state = 'terminating'
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      _clearEviction(entry)
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
   * disabled (terminateIdleLambdaTime <= 0).
   *
   * @param {string} functionKey
   * @param {PoolEntry} entry
   */
  function _scheduleEviction(functionKey, entry) {
    if (terminateIdleLambdaTime <= 0) return
    _clearEviction(entry)
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null
      if (entry.state !== 'idle') return
      entry.state = 'terminating'
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      try {
        entry.child.kill()
      } catch {
        // ignore — child may already be gone
      }
    }, terminateIdleLambdaTime)
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
     * @param {object} args
     * @param {string} args.functionKey
     * @param {string} args.handlerPath  Absolute path to the .py file.
     * @param {string} args.handlerName
     * @param {unknown} args.event
     * @param {object} args.context
     * @param {Record<string, string>} [args.environment]  User-level env vars
     *   merged ON TOP of the AWS_LAMBDA_* runtime block at spawn time.
     * @returns {Promise<unknown>}
     */
    async invoke({
      functionKey,
      handlerPath,
      handlerName,
      event,
      context,
      environment,
    }) {
      let entry = pool.get(functionKey)
      if (!entry || entry.state === 'terminating') {
        // Env is captured at spawn time and stable for the child's
        // lifetime — matches real Lambda's per-execution-env model.
        // The pool's per-key isolation means each function gets its
        // own snapshot of the runtime block + user env.
        const region = context?.region ?? process.env.AWS_REGION ?? 'us-east-1'
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
        })
        entry = _spawn(functionKey, handlerPath, handlerName, {
          ...lambdaEnv,
          ...(environment ?? {}),
        })
        pool.set(functionKey, entry)
      }
      _clearEviction(entry)
      entry.state = 'busy'

      return new Promise((resolve, reject) => {
        entry.pending = { resolve, reject }
        try {
          entry.child.stdin.write(JSON.stringify({ event, context }))
          entry.child.stdin.write('\n')
        } catch (err) {
          // Synchronous write failure (e.g. child already dead) — reject
          // and let the stdin/error handlers do their cleanup.
          if (entry.pending !== null) {
            entry.pending = null
            reject(err)
          }
        }
      })
    },

    /**
     * Kill the child for a single functionKey and drop it from the pool.
     * A subsequent invoke on the same key spawns fresh.
     *
     * @param {string} functionKey
     */
    invalidate(functionKey) {
      const entry = pool.get(functionKey)
      if (!entry) return
      pool.delete(functionKey)
      _clearEviction(entry)
      entry.state = 'terminating'
      try {
        entry.child.kill()
      } catch {
        // ignore
      }
    },

    /**
     * Kill every live child and wait for each to exit.
     *
     * @returns {Promise<void>}
     */
    async terminate() {
      const exits = []
      for (const entry of pool.values()) {
        _clearEviction(entry)
        entry.state = 'terminating'
        exits.push(entry.exited)
        try {
          entry.child.kill()
        } catch {
          // ignore
        }
      }
      pool.clear()
      await Promise.all(exits)
    },
  }
}
