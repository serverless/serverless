/**
 * Central lifecycle owner for sls offline.
 *
 * M0 orchestrator owns only its own start/ready/shutdown logging. Later
 * milestones register long-running pieces (HTTP server, AWS-API server,
 * runners, watchers, pollers) by appending teardown callbacks via
 * `onShutdown()`. SIGINT/SIGTERM handlers (wired in index.js) call
 * `shutdown()` once.
 *
 * Teardown contract:
 * - Callbacks run in reverse registration order (LIFO) so dependencies
 *   tear down after their dependents.
 * - If a callback throws, remaining callbacks still run; the first error
 *   is re-thrown after all teardown completes.
 * - shutdown() is idempotent — calling it twice runs teardown once.
 */
export function createOrchestrator({ logger }) {
  const teardowns = []
  let didShutdown = false

  return {
    async start({ onReady }) {
      logger.notice('starting')
      await onReady()
      logger.notice('ready')
    },

    onShutdown(callback) {
      teardowns.push(callback)
    },

    async shutdown() {
      if (didShutdown) return
      didShutdown = true
      logger.notice('stopping')
      let firstError
      for (let i = teardowns.length - 1; i >= 0; i--) {
        try {
          await teardowns[i]()
        } catch (err) {
          if (!firstError) firstError = err
        }
      }
      if (firstError) throw firstError
    },
  }
}
