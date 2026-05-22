/**
 * Central lifecycle owner for sls offline.
 *
 * Owns process lifecycle logging (`starting`, `ready`, `stopping`) and a
 * keep-alive heartbeat that prevents Node from exiting the event loop
 * before SIGINT/SIGTERM arrives. Long-running resources registered later
 * (e.g., Hapi servers, runners, watchers) keep the loop alive on their
 * own; the heartbeat then becomes redundant but harmless.
 *
 * Teardown contract:
 * - Callbacks run in reverse registration order (LIFO).
 * - If a callback throws, remaining callbacks still run; the first error
 *   is re-thrown after all teardown completes.
 * - shutdown() is idempotent — calling it twice runs teardown once.
 */
export function createOrchestrator({ logger }) {
  const teardowns = []
  let didShutdown = false
  let keepAlive = null

  return {
    async start({ onReady }) {
      logger.notice('starting')
      // Keep the event loop alive while we wait for a shutdown signal.
      // The interval body is a no-op; the interval handle itself is what
      // anchors the loop. Long delay → negligible CPU cost.
      keepAlive = setInterval(() => {}, 1 << 30)
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
      if (keepAlive) {
        clearInterval(keepAlive)
        keepAlive = null
      }
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
