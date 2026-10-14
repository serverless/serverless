/**
 * A command that ends the process itself, without returning to the CLI (Dev Mode's second Ctrl+C,
 * or a restore that ran out of time), calls `forcedExit` instead of `process.exit`. The CLI
 * registers one handler for the command it runs (`onForcedExit`): it gets the exit code and sends
 * what the end of the command would have sent. The exit waits for it at most FORCED_EXIT_WAIT_MS;
 * without a handler it exits at once.
 */

/** How long a forced exit waits for the handler. */
export const FORCED_EXIT_WAIT_MS = 2_000

let handler = null
let pending = null

/**
 * Registers the handler a forced exit runs, `(exitCode) => Promise`, replacing any other. Returns
 * a function that removes it again (if it is still the one registered).
 */
export const onForcedExit = (fn) => {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

/** The forced exit under way, as a promise that settles right before the exit; or null. */
export const forcedExitPending = () => pending

/**
 * Exits with `code`, after the registered handler finished or FORCED_EXIT_WAIT_MS passed. A
 * second call while one is under way waits for the first. Never rejects.
 */
export const forcedExit = ({
  code,
  processRef = process,
  waitMs = FORCED_EXIT_WAIT_MS,
  timers = { setTimeout, clearTimeout },
}) => {
  if (pending) return pending
  const run = handler
  if (!run) {
    processRef.exit(code)
    return Promise.resolve()
  }
  let timer
  const waited = new Promise((resolve) => {
    timer = timers.setTimeout(resolve, waitMs)
  })
  const sent = Promise.resolve()
    .then(() => run(code))
    .catch(() => {})
  pending = Promise.race([sent, waited]).then(() => {
    timers.clearTimeout(timer)
    pending = null
    processRef.exit(code)
  })
  return pending
}
