/**
 * Two-stage stop: the first SIGINT, SIGTERM or SIGHUP asks the session to restore and exit; a
 * later SIGINT or SIGTERM forces an exit without waiting (the session restores what it can and
 * names the rest). A hang-up only means the terminal went away, never that the person wants to
 * skip restoring, so SIGHUP can start a stop but never forces one. `onStop` and `onForce` each
 * fire at most once. The returned disposer removes the handlers; its `markStopped()` records a
 * stop that came another way as the first one.
 *
 * Any stop signal within SIGNAL_MERGE_MS of the first is the same stop: one stop request often
 * arrives twice (a supervisor that signals the process and its process group, or a terminal and a
 * supervisor each sending one), and a second copy must never skip the restore.
 */
import { stopFailedLine } from './output.js'

const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']
const FORCE_SIGNALS = new Set(['SIGINT', 'SIGTERM'])
/** Stop signals this soon after the first one are the same stop. */
export const SIGNAL_MERGE_MS = 500

// One set of handlers per process: a second install would fire every callback twice per signal.
const installed = new WeakMap()

/**
 * What happens when a callback fails and the caller gave no `onError`: a failed `onStop` means
 * restoring never started, so the person is told on stderr how to restore. Never throws: stderr
 * may be gone with the terminal.
 */
const reportOnStderr = (processRef) => (error) => {
  try {
    const stderr = processRef.stderr ?? process.stderr
    stderr.write(`${stopFailedLine(error)}\n`)
  } catch {
    // Nothing left to report to.
  }
}

export const installStopHandlers = ({
  onStop,
  onForce,
  onError,
  processRef = process,
  now = Date.now,
}) => {
  if (installed.has(processRef)) return installed.get(processRef)
  let stoppedAt = null
  let forced = false
  const report = onError ?? reportOnStderr(processRef)
  const fail = (error) => {
    try {
      report(error)
    } catch {
      // Nothing left to report to; the stop carries on.
    }
  }
  // A throw inside a signal listener would surface as an uncaught exception, and a rejected
  // promise from an async callback as an unhandled rejection; either ends the process in the
  // middle of restoring, so both go to onError instead.
  const call = (callback, signal) => {
    try {
      const result = callback(signal)
      if (typeof result?.then === 'function') result.then(undefined, fail)
    } catch (error) {
      fail(error)
    }
  }
  // A real signal always carries its name. While the CLI's spinner runs in a terminal, it reads
  // stdin in raw mode and passes Ctrl+C on as a SIGINT event with no name: that is a SIGINT too.
  const handler = (signal = 'SIGINT') => {
    if (stoppedAt === null) {
      stoppedAt = now()
      call(onStop, signal)
    } else if (now() - stoppedAt <= SIGNAL_MERGE_MS) {
      // The same stop, delivered again.
    } else if (!forced && FORCE_SIGNALS.has(signal)) {
      forced = true
      call(onForce, signal)
    }
  }
  const dispose = () => {
    for (const signal of STOP_SIGNALS) processRef.off(signal, handler)
    if (installed.get(processRef) === dispose) installed.delete(processRef)
  }
  // A stop that came another way (`dev stop`, the idle timeout, a hotkey) is the first stop: a
  // signal within SIGNAL_MERGE_MS of it is the same stop, a later SIGINT or SIGTERM forces.
  dispose.markStopped = () => {
    stoppedAt ??= now()
  }
  for (const signal of STOP_SIGNALS) processRef.on(signal, handler)
  installed.set(processRef, dispose)
  return dispose
}
