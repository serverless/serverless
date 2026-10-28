/**
 * The end of a Dev Mode session: every function an update was sent to is restored, within a time
 * limit after which the session names what is left and exits 3; after `--on-exit remove`, the
 * service is removed once someone confirms it.
 */
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { forcedExit } from '@serverless/util/src/forced-exit/index.js'
import { restoreFunctions } from './attach.js'
import * as out from './output.js'
import { OFF_UNCHANGED, TIMED_OUT, within } from './session-support.js'

/**
 * `touched` holds the functions an update was sent to, by deployed name; restore adds every one it
 * leaves without Dev Mode to `settled`. `signalled()` returns the signal that stopped the session.
 * Once `isExiting()` (a forced exit began) no function update of the restore starts; a restore
 * that runs out of time calls `onExiting(3)` after its lines, then exits.
 */
export const createRestore = ({
  clients,
  // The session's `{ stage, region, aws_profile }`: a restore the report suggests names them.
  scope,
  logger,
  main,
  // Turns a deployed name into the name the lines show (the function's key).
  nameOf = (name) => name,
  sessionId,
  sleep,
  now,
  timers,
  restoreTimeoutMs,
  processRef,
  touched,
  settled,
  signalled,
  isExiting = () => false,
  onExiting = () => {},
  // The session's web apps (session-web.js createWebAttach), restored alongside the functions.
  webApps = null,
}) => {
  // Restore runs at most once per session: a failure after it (a failed --on-exit remove) must
  // not restore and report a second time. `beforeReport()` runs after the functions are restored
  // and before "Dev Mode off" (the relay's accepted invocations finish there); it never fails the
  // restore.
  let restoring = null
  const restoreAttached = ({ beforeReport } = {}) => {
    restoring ??= restoreOnce(beforeReport)
    return restoring
  }
  const settle = async (beforeReport) => {
    try {
      await beforeReport?.()
    } catch (error) {
      logger.debug(
        `Dev Mode could not wait for the invocations it accepted: ${error?.message ?? error}`,
      )
    }
  }
  const restoreOnce = async (beforeReport) => {
    const names = [...touched]
    const webKeys = webApps?.pending() ?? []
    if (names.length === 0 && webKeys.length === 0) {
      await settle(beforeReport)
      if (signalled()) {
        main.remove()
        logger.success(OFF_UNCHANGED)
      }
      return { failed: [] }
    }
    const restoreStarted = now()
    let webDone = 0
    let functionsDone = 0
    const progressOf = () =>
      out.restoringProgress({
        done: functionsDone + webDone,
        total: names.length + webKeys.length,
        stopping: Boolean(signalled()),
        webApps: webKeys.length,
      })
    main.notice(progressOf())
    // A forced exit names what is still attached and exits: from then on no update starts (one
    // already sent finishes), so that list stays true.
    const lambda = {
      getFunction: (name) => clients.lambda.getFunction(name),
      updateFunctionConfiguration: (params) =>
        isExiting()
          ? Promise.reject(new Error('Dev Mode is exiting'))
          : clients.lambda.updateFunctionConfiguration(params),
    }
    const functionsRestored = restoreFunctions({
      lambda,
      names,
      onlySession: sessionId,
      sleep,
      now,
      onProgress: ({ done, total, name, outcome }) => {
        if (outcome.status !== 'failed') settled.add(name)
        functionsDone = done
        main.notice(progressOf())
      },
    })
    // Web apps go back at the same time; the result is the functions', then the web apps'.
    const restored = webKeys.length
      ? Promise.all([
          functionsRestored,
          webApps.restore({
            onProgress: ({ done }) => {
              webDone = done
              main.notice(progressOf())
            },
          }),
        ]).then(([functions, web]) =>
          Object.fromEntries(
            Object.keys(functions).map((key) => [
              key,
              [...functions[key], ...(web[key] ?? [])],
            ]),
          ),
        )
      : functionsRestored
    const result = await within(restored, restoreTimeoutMs, timers)
    main.remove()
    if (result === TIMED_OUT) {
      const left = [
        ...names.filter((name) => !settled.has(name)),
        ...(webApps?.pending() ?? []).map(out.webAppName),
      ]
      for (const line of out.restoreTimeoutLines(left, restoreTimeoutMs)) {
        logger.warning(line)
      }
      onExiting(3)
      // The CLI sends what the end of the command sends, then exits; nothing after this runs.
      await forcedExit({ code: 3, processRef, timers })
      return { failed: left, timedOut: true }
    }
    await settle(beforeReport)
    // A section of its own: after the restore's spinner (whose blank line it keeps), or after the
    // lines of an invocation that ended meanwhile.
    logger.gap?.()
    for (const [level, text] of out.restoreReportLines({
      result,
      seconds: (now() - restoreStarted) / 1000,
      scope,
      nameOf,
    })) {
      logger[level](text)
    }
    return result
  }
  return { restoreAttached }
}

/**
 * Removes the service after `--on-exit remove`, only when a person at a terminal confirms it. Once
 * a forced exit began nothing is asked: the CLI is on its way out.
 */
export const removeService = async ({
  serverless,
  logger,
  confirm,
  service,
  stage,
  region,
  hungUp,
  isExiting = () => false,
}) => {
  if (isExiting()) return
  if (!logger.isInteractive() || hungUp) {
    logger.warning(out.removalSkippedLine())
    return
  }
  let confirmed = false
  try {
    confirmed = await confirm({
      message: `Remove "${service.service}" from stage "${stage}" in "${region}"?`,
      initial: false,
    })
  } catch {
    confirmed = false
  }
  if (!confirmed) {
    logger.notice('Removal skipped. Your functions were restored.')
    return
  }
  await serverless.pluginManager.spawn('remove')
  logger.success(`Removed "${service.service}" from stage "${stage}"`)
}
