/**
 * While the session waits, the attached functions are read every watchIntervalMs and each one
 * found changed is reported once and not read again; it stays in the restore set, and restore on
 * exit removes whatever of Dev Mode is left on it. The watch only reads, one attempt per function
 * and no retries, and a failing check never stops the session. A function whose read failed is
 * skipped until the next check (a debug line); the check counts as failed only when no function
 * could be read, or when it did not finish within one interval; until the reads of such a check
 * settle, no other check starts (and each tick counts as failed). Each failed check is a debug
 * line, and WATCH_FAILURES_BEFORE_WARNING of them in a row add one warning, once per session.
 */
import { checkAttachments } from './attach.js'
import * as out from './output.js'
import { CANCELLED, TIMED_OUT, within } from './session-support.js'

/** Attachment checks that fail in a row before the session says so once. */
export const WATCH_FAILURES_BEFORE_WARNING = 3

/**
 * `attached` holds the functions this session attached, by deployed name; `isStopping()` tells
 * whether a stop has come, after which nothing is checked or reported.
 */
export const createAttachmentWatch = ({
  clients,
  // The session's `{ stage, region, aws_profile }`: a restore a line suggests names them.
  scope,
  logger,
  sessionId,
  owner,
  // The name a line shows for a deployed name (the function's key).
  nameOf = (name) => name,
  attached,
  timers,
  watchIntervalMs,
  isStopping,
  // Told of each function found changed, after its line: `{ name, state, owner? }`.
  onLost = () => {},
}) => {
  const reported = new Set()
  const watchRead = {
    getFunction: (name) => clients.lambda.getFunctionOnce(name),
  }
  const runningCheck = {}
  let checking = false
  // The reads of a check that timed out, until they settle: no other check starts meanwhile.
  let unsettled = null
  let failuresInARow = 0
  let warnedAboutFailures = false
  // `failure` is an error or a text.
  const watchFailed = (failure) => {
    failuresInARow += 1
    logger.debug(
      `Dev Mode could not check the attached functions: ${failure?.message ?? failure}`,
    )
    if (
      failuresInARow >= WATCH_FAILURES_BEFORE_WARNING &&
      !warnedAboutFailures &&
      !isStopping()
    ) {
      warnedAboutFailures = true
      logger.warning(
        out.watchFailingLine({ count: failuresInARow, error: failure }),
      )
    }
  }
  // Another session of the same person (a second terminal, an agent next to them) took it.
  const shownAs = (change) =>
    change.state === 'taken_over' && change.owner === owner
      ? { ...change, state: 'taken_over_by_you' }
      : change
  const check = async () => {
    const names = [...attached].filter((name) => !reported.has(name))
    if (checking || isStopping() || names.length === 0) return
    if (unsettled) {
      watchFailed(
        `AWS Lambda did not answer within ${watchIntervalMs / 1000} s`,
      )
      return
    }
    checking = true
    try {
      const reads = checkAttachments({ lambda: watchRead, names, sessionId })
      const changes = await within(reads, watchIntervalMs, timers, runningCheck)
      if (changes === CANCELLED) return
      if (changes === TIMED_OUT) {
        unsettled = reads
        const settled = () => {
          if (unsettled === reads) unsettled = null
        }
        reads.then(settled, settled)
        watchFailed(
          `AWS Lambda did not answer within ${watchIntervalMs / 1000} s`,
        )
        return
      }
      failuresInARow = 0
      // A stop may have come while the functions were read: they are being restored now.
      if (isStopping()) return
      for (const change of changes) {
        if (change.state === 'attached') continue
        if (change.state === 'unchecked') {
          logger.debug(
            `Dev Mode could not check ${change.name}: ${change.error?.message ?? change.error}`,
          )
          continue
        }
        reported.add(change.name)
        const shown = shownAs(change)
        logger.warning(
          out.leftDevModeLine({ ...shown, name: nameOf(shown.name) }, scope),
        )
        try {
          onLost(shown)
        } catch {
          // The record is best effort; the line was said.
        }
      }
    } catch (error) {
      watchFailed(error ?? String(error))
    } finally {
      checking = false
    }
  }
  /** Settles a check still running at once, so the session leaves no timer behind. */
  const cancel = () => runningCheck.cancel?.()
  return { check, cancel }
}
