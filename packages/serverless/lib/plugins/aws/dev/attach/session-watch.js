/**
 * While the session waits, the attached functions and web apps are read every watchIntervalMs and
 * each one found changed is reported once and not read again; it stays in the restore set, and
 * restore on exit removes whatever of Dev Mode is left on it. The watch only reads, one attempt per
 * function and no retries, and a failing check never stops the session. A function whose read
 * failed is skipped until the next check (a debug line); the check counts as failed only when no
 * function could be read, or when it did not finish within one interval; until the reads of such a
 * check settle, no other check starts (and each tick counts as failed). Each failed check is a
 * debug line, and WATCH_FAILURES_BEFORE_WARNING of them in a row add one warning, once per session.
 * Web apps are read on the same timer and by the same rules, each one found changed reported once.
 */
import { checkAttachments } from './attach.js'
import { checkWebAppAttachments } from '../web/attach.js'
import { isAccessDenied, isCredentialError } from './aws.js'
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
  // The web apps this session attached: `{ key, functionName, localOnly? }`. None by default.
  webApps = [],
  // Told of each web app found changed, after its line: `{ webApp, state, owner? }`, where state
  // is `detached`, `function_deleted` or `taken_over`.
  onWebAppLost = () => {},
}) => {
  const reported = new Set()
  const reportedWebApps = new Set()
  const watchRead = {
    getFunction: (name) => clients.lambda.getFunctionOnce(name),
  }
  const runningCheck = {}
  let checking = false
  // The reads of a check that timed out, until they settle: no other check starts meanwhile.
  let unsettled = null
  let failuresInARow = 0
  let warnedAboutFailures = false
  // What the checks read, as the lines name it: functions, web apps or both.
  const watched = () => ({
    functions: attached.size > 0 || webApps.length === 0,
    webApps: webApps.length > 0,
  })
  // `failure` is an error or a text.
  const watchFailed = (failure) => {
    failuresInARow += 1
    logger.debug(
      `Dev Mode could not check ${out.restoresWhat(watched(), 'the attached')}: ${failure?.message ?? failure}`,
    )
    if (
      failuresInARow >= WATCH_FAILURES_BEFORE_WARNING &&
      !warnedAboutFailures &&
      !isStopping()
    ) {
      warnedAboutFailures = true
      logger.warning(
        out.watchFailingLine({
          count: failuresInARow,
          error: failure,
          what: watched(),
        }),
      )
    }
  }
  // Another session of the same person (a second terminal, an agent next to them) took it.
  const shownAs = (change) =>
    change.state === 'taken_over' && change.owner === owner
      ? { ...change, state: 'taken_over_by_you' }
      : change
  // The functions and the web apps are read together; the check fails only when neither could be.
  const readAll = async (names, apps) => {
    const [functions, web] = await Promise.allSettled([
      names.length
        ? checkAttachments({ lambda: watchRead, names, sessionId })
        : [],
      apps.length
        ? checkWebAppAttachments({
            lambdaWeb: clients.lambdaWeb,
            webApps: apps,
            sessionId,
          })
        : [],
    ])
    const errors = [functions, web]
      .filter(({ status }) => status === 'rejected')
      .map(({ reason }) => reason)
    const readAny = [functions, web].some(
      ({ status, value }) => status === 'fulfilled' && value.length > 0,
    )
    if (errors.length && !readAny) {
      throw (
        errors.find(isCredentialError) ??
        errors.find(isAccessDenied) ??
        errors[0]
      )
    }
    // A part that failed while the other was read: its items are skipped until the next check.
    return {
      functions:
        functions.status === 'fulfilled'
          ? functions.value
          : names.map((name) => ({
              name,
              state: 'unchecked',
              error: functions.reason,
            })),
      web:
        web.status === 'fulfilled'
          ? web.value
          : apps.map(({ key }) => ({
              webApp: key,
              state: 'unchecked',
              error: web.reason,
            })),
    }
  }
  const reportWebApp = (change) => {
    if (change.state === 'attached') return
    if (change.state === 'unchecked') {
      logger.debug(
        `Dev Mode could not check the web app ${change.webApp}: ${change.error?.message ?? change.error}`,
      )
      return
    }
    reportedWebApps.add(change.webApp)
    // As for a function: another session of the same owner is `taken_over_by_you`.
    const shown = shownAs(change)
    logger.warning(
      out.leftDevModeLine(
        { ...shown, name: change.webApp, webApp: true, you: owner },
        scope,
      ),
    )
    try {
      onWebAppLost({
        webApp: change.webApp,
        state: shown.state,
        ...(change.owner && { owner: change.owner }),
      })
    } catch {
      // The record is best effort; the line was said.
    }
  }
  const check = async () => {
    const names = [...attached].filter((name) => !reported.has(name))
    const apps = webApps.filter(({ key }) => !reportedWebApps.has(key))
    if (checking || isStopping() || (names.length === 0 && apps.length === 0)) {
      return
    }
    if (unsettled) {
      watchFailed(
        `AWS Lambda did not answer within ${watchIntervalMs / 1000} s`,
      )
      return
    }
    checking = true
    try {
      const reads = readAll(names, apps)
      const read = await within(reads, watchIntervalMs, timers, runningCheck)
      if (read === CANCELLED) return
      if (read === TIMED_OUT) {
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
      for (const change of read.functions) {
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
      for (const change of read.web) reportWebApp(change)
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
