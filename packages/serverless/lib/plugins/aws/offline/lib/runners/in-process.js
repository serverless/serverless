import { randomBytes } from 'node:crypto'
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
 *   4. calls handler(event, context),
 *   5. restores the snapshot (in a finally so a thrown handler still cleans up),
 *   6. returns its promise.
 *
 * Diverges from the community plugin (serverless-offline InProcessRunner)
 * which simply Object.assign's env once and never restores: our offline
 * server stays alive across many invocations of potentially many different
 * functions, so leaking would cross-pollute each call's AWS_LAMBDA_* values
 * and user environment into both the server itself and the next handler.
 *
 * Subsequent tasks build out Lambda context inflation (T6), callback
 * handling + Promise.race (T7), and timeout enforcement (T8).
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
    async invoke({ handlerPath, handlerName, event, context, environment }) {
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

      Object.assign(process.env, fullEnv)
      try {
        const handler = await loadHandler(handlerPath, handlerName)
        return await handler(event, context)
      } finally {
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
     * Hot-reload is a known M5a limitation.
     *
     * @param {string} _functionKey
     */
    invalidate(_functionKey) {},
    /**
     * No-op: nothing to terminate (no worker, no socket).
     *
     * @returns {Promise<void>}
     */
    async terminate() {},
  }
}
