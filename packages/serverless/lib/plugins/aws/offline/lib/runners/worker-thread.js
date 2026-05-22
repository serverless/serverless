import { Worker } from 'node:worker_threads'
import ServerlessError from '../../../../../serverless-error.js'

const workerEntryPath = new URL('./worker-entry.js', import.meta.url)

/**
 * Create a worker-thread Lambda runner.
 *
 * Each invocation spawns a fresh `worker_threads.Worker` that loads the
 * handler module in isolation, calls it with the supplied event and context,
 * and returns the result.  The worker is terminated (and the associated
 * resources released) before `invoke` resolves or rejects.
 *
 * @param {object} _options
 * @param {string} _options.servicePath  Absolute path to the Serverless service root.
 * @returns {{ invoke(args: object): Promise<unknown>, terminate(): Promise<void> }}
 */
export function createWorkerThreadRunner({ servicePath: _servicePath } = {}) {
  return {
    /**
     * Invoke a Node handler in a fresh worker_threads.Worker.
     *
     * @param {object} args
     * @param {string} args.handlerPath   Absolute path to the handler module.
     * @param {string} args.handlerName   Exported function name within that module.
     * @param {object} args.event         The event JSON passed to the handler.
     * @param {object} args.context       The Lambda context object passed to the handler.
     * @param {object} args.environment   Env vars to set inside the worker.
     * @param {number} args.timeoutMs     Hard timeout — terminate worker if exceeded.
     * @returns {Promise<unknown>}        The handler's return value.
     * @throws {ServerlessError}          OFFLINE_HANDLER_TIMEOUT if the timeout is exceeded.
     * @throws                            Any error thrown by the handler (rethrown with stack).
     */
    async invoke({
      handlerPath,
      handlerName,
      event = {},
      context = {},
      environment = {},
      timeoutMs,
    }) {
      const worker = new Worker(workerEntryPath, {
        workerData: { handlerPath, handlerName, event, context, environment },
      })

      return new Promise((resolve, reject) => {
        let timer = null
        let settled = false

        const settle = (fn) => {
          if (settled) return
          settled = true
          if (timer !== null) {
            clearTimeout(timer)
            timer = null
          }
          // Ask the worker to stop; we don't need to await termination
          // here because the promise chain below handles cleanup.
          worker.terminate().then(
            () => fn(),
            () => fn(),
          )
        }

        if (timeoutMs != null) {
          timer = setTimeout(() => {
            if (settled) return
            settled = true
            timer = null
            worker.terminate().then(
              () =>
                reject(
                  new ServerlessError(
                    `Lambda invocation timed out after ${timeoutMs} ms`,
                    'OFFLINE_HANDLER_TIMEOUT',
                  ),
                ),
              () =>
                reject(
                  new ServerlessError(
                    `Lambda invocation timed out after ${timeoutMs} ms`,
                    'OFFLINE_HANDLER_TIMEOUT',
                  ),
                ),
            )
          }, timeoutMs)
        }

        worker.on('message', (msg) => {
          if (msg.type === 'success') {
            settle(() => resolve(msg.value))
          } else if (msg.type === 'error') {
            const err = new Error(msg.error.message)
            err.name = msg.error.name
            err.stack = msg.error.stack
            settle(() => reject(err))
          }
        })

        worker.on('error', (err) => {
          settle(() => reject(err))
        })
      })
    },

    /**
     * Tear down the runner.
     *
     * No-op in this implementation — each invocation creates and disposes
     * its own worker.  Reserved for future warm-pool runners.
     *
     * @returns {Promise<void>}
     */
    async terminate() {},
  }
}
