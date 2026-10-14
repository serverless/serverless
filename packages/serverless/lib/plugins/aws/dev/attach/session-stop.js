/**
 * How a Dev Mode session stops. The first Ctrl+C or SIGTERM, or a requested stop (`dev stop`, the
 * idle timeout, a hotkey), settles `stopped` and the session restores; a second signal (more than
 * SIGNAL_MERGE_MS later) exits at once, with code 3 and the names of the functions still attached
 * when there are any (0 otherwise, and 0 during the first deployment, which attached nothing).
 * The exit is a forced exit: the CLI first sends what the end of the command sends, for at most
 * two seconds. A hang-up is remembered: from then on there is no terminal to write to or to ask
 * in.
 */
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { forcedExit } from '@serverless/util/src/forced-exit/index.js'
import * as out from './output.js'
import { installStopHandlers } from './signals.js'
import { GLOBAL_TIMERS, guardStreams } from './session-support.js'

/**
 * `isDeploying()` tells whether the first deployment of the stage is running; `unsettled()` names
 * the functions a second signal would leave attached.
 */
export const createStopControl = ({
  processRef,
  logger,
  // The session's spinner, and what it says from the first stop on (`stoppingText(request)`).
  main = { notice() {}, remove() {} },
  stoppingText = () => '',
  isDeploying,
  unsettled,
  stage,
  // The session's `{ stage, region, aws_profile }`: a restore a line suggests names them.
  scope,
  now = Date.now,
  timers = GLOBAL_TIMERS,
  // `onExiting(code)` runs once a forced exit begins, after its lines and before the exit waits
  // for the CLI: from then on the session changes and prints nothing more.
  onExiting = () => {},
  // Runs once, right before the stop handlers go in: whatever handled signals until then stops.
  beforeHandling = () => {},
}) => {
  // How the stop came: `{ trigger: 'signal', signal }`, or `{ trigger, keep? }` from `request`.
  let stopRequest = null
  let resolveStop
  const stopped = new Promise((resolve) => {
    resolveStop = resolve
  })
  // A hang-up can come at any point, also after Ctrl+C started the stop: from then on there is no
  // terminal to write to or to ask in.
  let hungUp = false
  const onHangUp = () => {
    hungUp = true
  }
  // The first stop, however it came, settles `stopped` and says so; later ones change nothing.
  const begin = (request) => {
    if (stopRequest) return false
    stopRequest = request
    resolveStop()
    main.notice(stoppingText(request))
    return true
  }
  let stopHandling = null
  const handleStops = () => {
    if (stopHandling) return
    beforeHandling()
    const releaseStreams = guardStreams(processRef)
    processRef.on('SIGHUP', onHangUp)
    const dispose = installStopHandlers({
      processRef,
      now,
      onStop: (signal) => {
        begin({ trigger: 'signal', signal })
      },
      onForce: () => {
        main.remove()
        if (isDeploying()) {
          logger.warning(out.forceExitDuringDeployLine(stage))
          onExiting(0)
          return forcedExit({ code: 0, processRef, timers })
        }
        // What is still attached now: the restore starts nothing after these lines, so they stay
        // true (an update already sent may still finish).
        const left = unsettled()
        for (const line of out.forceExitLines(left)) logger.warning(line)
        const code = left.length ? 3 : 0
        onExiting(code)
        return forcedExit({ code, processRef, timers })
      },
      onError: (error) => logger.error(out.stopFailedLine(error, scope)),
    })
    // markStopped: a stop requested without a signal counts as the first one (see signals.js).
    stopHandling = { dispose, markStopped: dispose.markStopped, releaseStreams }
    // A stop requested before the handlers were installed is the first stop for them too.
    if (stopRequest) stopHandling.markStopped()
  }
  // Set once the session has ended (`finish`, then `done`): a stop asked for after that (a late
  // `dev stop`) changes and prints nothing.
  let ended = false
  const finish = () => {
    ended = true
  }
  const done = () => {
    finish()
    if (!stopHandling) return
    stopHandling.dispose()
    processRef.off('SIGHUP', onHangUp)
    // After a hang-up the terminal stays gone for the rest of the run.
    if (!hungUp) stopHandling.releaseStreams()
  }
  return {
    handleStops,
    /** The session has ended: later stop requests are ignored; the signal handlers stay. */
    finish,
    done,
    stopped,
    /** Truthy once a stop came: the signal's name, or the trigger of a requested stop. */
    signal: () => stopRequest?.signal ?? stopRequest?.trigger ?? null,
    /** How the stop came (null before): `{ trigger, signal?, keep? }`. */
    trigger: () => stopRequest,
    /**
     * A stop that is not a signal (`dev stop`, the idle timeout, a hotkey): the same path as the
     * first Ctrl+C, and the first stop for the signal handlers (the next Ctrl+C after the merge
     * window forces). Works before `handleStops`; returns whether it was the first stop.
     */
    request: (request) => {
      if (ended) return false
      const first = begin(request)
      if (first) stopHandling?.markStopped()
      return first
    },
    hungUp: () => hungUp,
  }
}
