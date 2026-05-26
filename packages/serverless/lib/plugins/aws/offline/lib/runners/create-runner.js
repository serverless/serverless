import { createInProcessRunner } from './in-process.js'
import { createWorkerThreadRunner } from './worker-thread.js'

/**
 * Choose between the in-process and worker-thread runner based on the
 * resolved `useInProcess` option. Pure: no side effects beyond calling
 * the chosen factory.
 *
 * The in-process runner trades isolation + hot-reload for lower per-
 * invocation overhead and direct stack traces, and is opt-in via the
 * `--useInProcess` CLI flag (or `offline.useInProcess: true` in YAML).
 * Default remains the worker-thread runner for backward compatibility
 * with the community plugin's isolation semantics.
 *
 * @param {object} params
 * @param {boolean} params.useInProcess
 * @param {number} params.terminateIdleLambdaTime  Forwarded to the worker-thread
 *   runner only; the in-process runner has no idle workers to terminate.
 * @returns {{ invoke: Function, invalidate: Function, terminate: Function }}
 */
export function createRunner({ useInProcess, terminateIdleLambdaTime }) {
  if (useInProcess) {
    return createInProcessRunner()
  }
  return createWorkerThreadRunner({
    servicePath: '',
    terminateIdleLambdaTime,
  })
}
