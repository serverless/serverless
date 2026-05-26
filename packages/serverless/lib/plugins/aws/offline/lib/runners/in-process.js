import { loadHandler } from './load-handler.js'

/**
 * In-process Node Lambda runner — opt-in via the `useInProcess` flag.
 *
 * Runs handlers DIRECTLY in the offline server's process: no worker_thread,
 * no IPC, no per-functionKey isolation pool. Each `invoke()`:
 *   1. dynamically imports the handler module (cached after first call by
 *      Node's ESM loader),
 *   2. calls handler(event, context),
 *   3. returns its promise.
 *
 * Subsequent tasks build out env save/apply/restore (T5), Lambda context
 * inflation (T6), callback handling + Promise.race (T7), and timeout
 * enforcement (T8). This skeleton intentionally has none of that yet —
 * keep the slice small so each subsequent task lands one observable
 * behavior on top.
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
    async invoke({ handlerPath, handlerName, event, context }) {
      const handler = await loadHandler(handlerPath, handlerName)
      return handler(event, context)
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
