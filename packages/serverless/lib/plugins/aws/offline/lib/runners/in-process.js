import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { buildLambdaRuntimeEnv } from './lambda-env.js'
import { loadHandler } from './load-handler.js'

// ---------------------------------------------------------------------------
// Helpers
//
// These mirror worker-entry.js verbatim. Extracting to a shared module would
// touch a third file and risk refactor noise — deferred to M5-FOLLOWUPS.
// ---------------------------------------------------------------------------

/**
 * Generates a random hex string. Default 16 bytes → 32-char hex string,
 * matching the format real Lambda log stream IDs use.
 *
 * @param {number} bytes
 * @returns {string}
 */
function randomHexId(bytes = 16) {
  return randomBytes(bytes).toString('hex')
}

/**
 * Formats a Date as YYYY/MM/DD using UTC components.
 * Real Lambda log stream names start with this prefix.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatLogStreamDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

/**
 * In-process Node Lambda runner — opt-in via the `useInProcess` flag.
 *
 * Runs handlers DIRECTLY in the offline server's process: no worker_thread,
 * no IPC, no per-functionKey isolation pool. Each `invoke()`:
 *   1. dynamically imports the handler module (cached after first call by
 *      Node's ESM loader),
 *   2. snapshots the keys it's about to write onto process.env,
 *   3. applies the Lambda runtime env block + user environment,
 *   4. builds an inflated Lambda context (getRemainingTimeInMillis closure,
 *      legacy done/fail/succeed methods, settle-once callback),
 *   5. races handler(event, inflatedContext, callback)'s promise return vs
 *      the callback's resolution (first to settle wins),
 *   6. restores the snapshot (in a finally so a thrown handler still cleans up).
 *
 * Timeout enforcement (T8) adds a setTimeout-backed rejection to the race.
 *
 * Diverges from the community plugin (serverless-offline InProcessRunner)
 * in three documented ways:
 *
 *  - Env snapshot/restore (vs community's single Object.assign that never
 *    restores). Our offline server stays alive across many invocations of
 *    potentially many different functions, so leaking would cross-pollute
 *    each call's AWS_LAMBDA_* values and user env into both the server
 *    itself and the next handler.
 *
 *  - Sync returns are wrapped in `Promise.resolve(ret)` and entered into
 *    the race. Community plugin only races thenables, which works for its
 *    fixtures but would hang our sync-return tests. Semantically equivalent
 *    to real AWS Lambda Node 18+ runtime, where `return x` and
 *    `return Promise.resolve(x)` behave identically.
 *
 *  - `context.callbackWaitsForEmptyEventLoop` is NOT honored. The flag's
 *    purpose (drain pending timers/sockets before returning) doesn't fit a
 *    single-process runner with no worker to terminate. Handlers that rely
 *    on this flag should pick the worker-thread runner (the default).
 *
 * Public shape mirrors createWorkerThreadRunner so the Lambda facade in
 * lambda-function.js picks between runners without further changes.
 *
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createInProcessRunner() {
  return {
    /**
     * @param {object} args
     * @param {string} args.functionKey
     * @param {string} args.handlerPath
     * @param {string} args.handlerName
     * @param {unknown} args.event
     * @param {object} args.context
     * @param {Record<string, string>} [args.environment]
     * @param {number} [args.timeoutMs]
     * @returns {Promise<unknown>}
     */
    async invoke({
      handlerPath,
      handlerName,
      event,
      context,
      environment,
      timeoutMs,
    }) {
      const region = context?.region ?? process.env.AWS_REGION ?? 'us-east-1'
      const functionName = context?.functionName
      const memoryLimitInMB = String(context?.memoryLimitInMB ?? 1024)
      const logGroupName =
        context?.logGroupName ?? `/aws/lambda/${functionName}`
      const logStreamName =
        context?.logStreamName ??
        `${formatLogStreamDate(new Date())}/[$LATEST]${randomHexId()}`

      const lambdaEnv = buildLambdaRuntimeEnv({
        functionName,
        memoryLimitInMB,
        invokedFunctionArn: context?.invokedFunctionArn,
        logGroupName,
        logStreamName,
        handler: context?.handler,
        region,
      })
      const fullEnv = { ...lambdaEnv, ...(environment ?? {}) }

      // Snapshot prior values so we can restore (or delete) them in `finally`.
      // `undefined` here means "key was not set before" — we delete on restore
      // rather than assigning the string "undefined".
      /** @type {Record<string, string | undefined>} */
      const snapshot = {}
      for (const key of Object.keys(fullEnv)) {
        snapshot[key] = process.env[key]
      }

      // Inflate the Lambda context with runtime-injected methods that the
      // facade's plain context dict doesn't have:
      //   - getRemainingTimeInMillis() — monotonic via performance.now()
      //   - legacy succeed/fail/done — all route through the callback closure
      // The settle-once `callback` lets handlers using the legacy
      // (event, context, callback) signature resolve the invoke. We race the
      // callback resolution vs the handler's promise return (community
      // plugin parity — see InProcessRunner.js lines 46–96). T8 adds a
      // timeout candidate to the race.
      const timeoutMsForContext = context?.timeoutMs ?? 6000
      const startedAt = performance.now()
      let settled = false
      let callbackResolve
      let callbackReject
      const callbackPromise = new Promise((res, rej) => {
        callbackResolve = res
        callbackReject = rej
      })
      const callback = (err, data) => {
        if (settled) return
        settled = true
        if (err) {
          callbackReject(err instanceof Error ? err : new Error(String(err)))
        } else {
          callbackResolve(data)
        }
      }

      const inflatedContext = {
        ...context,
        // Fields the worker runner also exposes; AWS always populates them.
        functionVersion: context?.functionVersion ?? '$LATEST',
        logGroupName,
        logStreamName,
        getRemainingTimeInMillis() {
          const left = timeoutMsForContext - (performance.now() - startedAt)
          return left > 0 ? Math.floor(left) : 0
        },
        succeed(res) {
          callback(null, res)
        },
        fail(err) {
          callback(err)
        },
        done(err, data) {
          callback(err, data)
        },
      }

      // Timeout candidate for the race: armed only when timeoutMs is set.
      // The Lambda facade omits timeoutMs under `--noTimeout`; in that mode
      // we must not arm the timer (it would force-reject otherwise-valid
      // long-running handlers).
      let timeoutId
      const timeoutPromise =
        timeoutMs == null
          ? null
          : new Promise((_res, rej) => {
              timeoutId = setTimeout(() => {
                rej(
                  new Error(
                    `Task timed out after ${(timeoutMs / 1000).toFixed(2)} seconds`,
                  ),
                )
              }, timeoutMs)
            })

      Object.assign(process.env, fullEnv)
      try {
        const handler = await loadHandler(handlerPath, handlerName)
        const ret = handler(event, inflatedContext, callback)
        const candidates = [callbackPromise]
        // Include handler's return value in the race:
        //   - thenable (async handler / explicit Promise) → push directly
        //   - non-thenable, non-undefined sync return → wrap so the race sees
        //     it. (Real Lambda treats a sync return identically to
        //     Promise.resolve(value).)
        //   - undefined sync return → handler MUST use callback; nothing to push.
        if (ret !== undefined) {
          if (ret !== null && typeof ret.then === 'function') {
            candidates.push(ret)
          } else {
            candidates.push(Promise.resolve(ret))
          }
        }
        if (timeoutPromise !== null) candidates.push(timeoutPromise)
        return await Promise.race(candidates)
      } finally {
        // Clear the pending timer so it doesn't keep the event loop alive
        // after the race has resolved by some other candidate.
        if (timeoutId !== undefined) clearTimeout(timeoutId)
        for (const [key, prior] of Object.entries(snapshot)) {
          if (prior === undefined) {
            delete process.env[key]
          } else {
            process.env[key] = prior
          }
        }
      }
    },
    /**
     * No-op for in-process: module cache is owned by Node's ESM loader.
     * Hot-reload is a known limitation of this runner. Argument name kept
     * for sibling-runner parity (worker-thread, python, ruby, go, java
     * all expose the same shape).
     *
     * @param {string} functionKey
     */
    // eslint-disable-next-line no-unused-vars
    invalidate(functionKey) {},
    /**
     * No-op: nothing to terminate (no worker, no socket).
     *
     * @returns {Promise<void>}
     */
    async terminate() {},
  }
}
