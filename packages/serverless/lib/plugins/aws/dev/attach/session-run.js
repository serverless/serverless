/**
 * A Dev Mode session once its functions are attached: the laptop runtime and the relay start, the
 * ready lines are printed, the session waits for a stop, and then ends in this order: stop
 * accepting, restore (or keep), let the accepted invocations finish, "Dev Mode off", stop the
 * laptop runtime, say goodbye and disconnect, sweep the session's payload objects.
 */
import { DRAIN_MS, openRelayRun } from './session-relay.js'
import { removeService } from './session-restore.js'
import * as out from './output.js'
import {
  EMPTY_RESTORE,
  restoreCounts,
  webAppRestoreCounts,
} from '../state/session-state.js'
import { newBrokerLine } from '../relay/messages.js'
import { versionMismatches } from '../local/adapters/index.js'
import { versionMismatchLine } from '../local/messages.js'
import { mcpServersOf } from '../local/mcp.js'
import { createInvocationRecorder } from '../state/invocations.js'
import { recordFilesOf } from '../state/record-files.js'
import {
  DETAILED_OFF,
  DETAILED_ON,
  KEYS_HINT,
  KEY_HELP,
  hotkeysEnabled,
  keysHint,
  statusKeyLines,
} from '../local/hotkeys.js'

/**
 * What the ready lines say of the service's web apps (`webApps`: `{ rows, state, urlOf, total }`,
 * the final web app rows, the state of their servers by key, a web app's real URL and how many the
 * service has; null without web apps): the rows as the table shows them, how many run here, and
 * those that run here with their mode, the URL on this machine and their real URL, for the `web
 * apps:` lines (`out.endpointLines`).
 */
const readyWebApps = (webApps) => {
  if (!webApps) return null
  const running = webApps.rows.filter(
    (row) => row.mode === 'dev' || row.mode === 'local',
  )
  return {
    rows: webApps.rows.map((row) =>
      out.withLiveNotes(row, webApps.state?.get(row.webApp)),
    ),
    counts: { running: running.length, total: webApps.total },
    running: running.map((row) => ({
      name: row.webApp,
      mode: row.mode,
      localUrl: webApps.state?.get(row.webApp)?.localUrl,
      url: webApps.urlOf?.(row.webApp),
    })),
  }
}

/**
 * What a running session holds: its AWS IoT Core connection, the relay's part of the session and
 * the laptop runtime, each set once it exists, whether its stop began, and the steps that end
 * them, each run at most once and never throwing.
 */
export const createRunState = ({ logger, ctx, detailed = false }) => {
  const { lifecycle, stops } = ctx
  const run = {
    relayConnection: null,
    relayRun: null,
    laptop: null,
    // The web apps' servers and local listeners (session-web.js createWebRuntime), when any run.
    web: null,
    // Detailed output (`--detailed`, the `v` key), for the invocations' lines and the web
    // requests'.
    detailed: Boolean(detailed),
  }
  // How the stop came, for its `session.stopping` record: a signal, a request (`dev stop`, the
  // idle timeout, a hotkey), or null before any stop.
  run.stopInfo = () => {
    const how = stops.trigger()
    return how ? { trigger: how.trigger, signal: how.signal } : null
  }
  // The stop begins (once): no relay or connection line any more, and no new request runs here.
  // Its record is written the first time `info` says how it came.
  let stopBegun = false
  run.isStopping = () => stopBegun
  run.beginStop = (info = run.stopInfo()) => {
    lifecycle.stopping(info)
    if (stopBegun) return
    stopBegun = true
    run.relayConnection?.quiet?.()
    run.relayRun?.quiet()
    run.laptop?.stopAccepting?.()
    // A Ctrl+C reaches the web apps' servers on Windows first: none is started again after it.
    if (info?.trigger === 'signal') void run.web?.stopServers()
  }
  // Ends the laptop runtime once (on every exit path; a failure is a debug line).
  let laptopStopped = null
  run.stopLaptop = () => {
    laptopStopped ??= run.laptop
      ? run.laptop
          .stop()
          .catch((error) =>
            logger.debug(
              `Dev Mode could not stop the local runtime cleanly: ${error?.message ?? error}`,
            ),
          )
      : Promise.resolve()
    return laptopStopped
  }
  // Before "Dev Mode off": the accepted invocations and web requests finish. Invocations that
  // outlive the drain are ended with the laptop runtime; web requests that outlive it are aborted
  // (their local server's response is no longer read) and their callers are answered by the bridge
  // once the session's goodbye ("gone") arrives.
  run.finishLaptop = async () => {
    try {
      await Promise.all([
        run.laptop?.drain?.(DRAIN_MS),
        run.relayRun?.drain?.(DRAIN_MS),
      ])
    } finally {
      await run.stopLaptop()
      await run.web?.stop()
    }
  }
  // Every exit path ends here: the laptop runtime, then the goodbye and disconnect, then the
  // sweep of the session's payload objects. Neither of the last two throws.
  run.teardown = async () => {
    run.beginStop()
    await run.stopLaptop()
    await run.web?.stop()
    await run.relayConnection?.stop()
    await run.relayRun?.stop()
  }
  return run
}

/**
 * Warns about local interpreter versions that differ from the deployed runtimes, opens the
 * relay's part of the session and starts the laptop runtime (its first build runs there), into
 * `run`. With `web` (web apps run here: `{ runtime, relay, start }`, see session-web.js), the
 * relay gets the web apps' part (`relay`), and their servers and local listeners start
 * (`runtime.start(start)`); a session of web apps alone starts no laptop runtime.
 */
export const startRunning = async ({
  run,
  rows,
  lives,
  localRuntimes,
  deployedName,
  openSideChannel,
  startLaptop,
  provider,
  serverless,
  options,
  sessionId,
  sessionKey,
  s3,
  logger,
  timers,
  now,
  processRef,
  ctx,
  // The session's spinner, which shows while it stops and restores.
  spinner,
  web = null,
}) => {
  const devKeys = rows
    .filter((row) => row.mode === 'dev')
    .map((row) => row.function)
  for (const mismatch of versionMismatches({
    functions: devKeys.map((key) => ({
      key,
      runtime: lives.get(key)?.Runtime,
    })),
    localRuntimes,
  })) {
    logger.warning(versionMismatchLine(mismatch))
  }
  run.relayRun = await openRelayRun({
    connection: run.relayConnection,
    openSideChannel,
    provider,
    serverless,
    sessionId,
    sessionKey,
    s3,
    deployedNames: new Map(devKeys.map((key) => [deployedName(key), key])),
    logger,
    timers,
    now,
    record: (type, fields) => ctx.state.events.emit(type, fields),
    ...(web && { web: web.relay }),
  })
  if (web) run.web = web.runtime
  if (devKeys.length || !web) {
    await startFunctions({
      run,
      devKeys,
      lives,
      localRuntimes,
      deployedName,
      startLaptop,
      provider,
      serverless,
      options,
      logger,
      timers,
      now,
      processRef,
      ctx,
      spinner,
      webApps: Boolean(web),
      webStarts: web
        ? (web.start?.rows ?? [])
            .map((row) => web.start.details?.get(row.webApp)?.start)
            .filter(Boolean)
        : [],
    })
  }
  // Without functions here, the web apps' part tells of a configuration file save.
  if (web) {
    await web.runtime.start({
      ...web.start,
      watchConfig: devKeys.length === 0,
    })
  }
}

/** The laptop runtime of the attached functions (`devKeys`), into `run.laptop`. */
const startFunctions = async ({
  run,
  devKeys,
  lives,
  localRuntimes,
  deployedName,
  startLaptop,
  provider,
  serverless,
  options,
  logger,
  timers,
  now,
  processRef,
  ctx,
  spinner,
  webApps = false,
  webStarts = [],
}) => {
  // Every invocation that runs here gets its file and records (when the session has a record).
  const { state, live } = ctx
  const mcp = mcpServersOf(serverless)
  live.recorder =
    state.recorder ??
    (state.dir
      ? createInvocationRecorder({
          dir: state.dir,
          now,
          events: state.events,
          // Shared with the web request recorder: one limit for both kinds of files.
          files: recordFilesOf(state, {
            onError: (error) =>
              logger.debug(
                `Dev Mode could not remove an old request file: ${error?.message ?? error}`,
              ),
          }),
          functions: new Map(
            devKeys.map((key) => [
              key,
              {
                name: deployedName(key),
                memoryMb: lives.get(key)?.MemorySize ?? null,
              },
            ]),
          ),
          mcpFunctions: new Set(devKeys.filter((key) => mcp.has(key))),
          stage: provider?.getStage?.() ?? null,
          onError: (error) =>
            logger.debug(
              `Dev Mode could not write an invocation file: ${error?.message ?? error}`,
            ),
          onWarning: (line) => logger.warning(line),
        })
      : null)
  run.laptop = await startLaptop({
    serverless,
    options,
    functions: devKeys.map((key) => ({ key, live: lives.get(key) })),
    localRuntimes,
    logger,
    timers,
    now,
    processRef,
    relay: run.relayRun.relay,
    events: ctx.state.events,
    recorder: live.recorder,
    // The reload spinner leaves the terminal in its normal mode: the keys take it back.
    onSpinnerDone: () => live.reclaimKeys?.(),
    spinner,
    webApps,
    webStarts,
  })
}

/**
 * Prints the ready lines (with the service's endpoints, `endpointRows`, see endpointListsOf),
 * then waits for
 * a stop while the attached functions are watched every
 * watchIntervalMs (the watch also keeps the process alive meanwhile). A person at a terminal gets
 * single-key commands meanwhile (see ../local/hotkeys.js); the terminal is back in its normal mode
 * as soon as the wait ends, however it ends.
 */
export const waitForStop = async ({
  rows,
  endpointRows,
  attachedCount,
  total,
  started,
  attachStarted,
  brokerIsNew,
  // The session widened the role's trust for web apps now (an existing role).
  brokerWidened = false,
  watch,
  watchIntervalMs,
  stops,
  onReady,
  logger,
  timers,
  now,
  ctx,
  run,
  options = {},
  processRef = process,
  startKeys,
  // The service's web apps (see readyWebApps); null without any.
  webApps = null,
}) => {
  const web = readyWebApps(webApps)
  const leftovers = rows.filter(
    (row) =>
      row.mode === 'dev' &&
      row.notes.some((note) => note.reason === 'reattached'),
  )
  if (leftovers.length) logger.debug(out.leftoverLine(leftovers, now()))
  logger.debug(
    `Dev Mode attached ${out.functionsWord(attachedCount)} in ${((now() - attachStarted) / 1000).toFixed(1)}s`,
  )
  // Sections, each after one blank line: the ready line, the function table when it says more,
  // the endpoints, then the hints.
  const gap = () => (logger.gap ? logger.gap() : logger.blankLine?.())
  gap()
  logger.success(
    out.startupSummary({
      devCount: attachedCount,
      total,
      seconds: (now() - started) / 1000,
      ...(web && { webApps: web.counts }),
    }),
  )
  const webRows = web?.rows ?? []
  if (out.tableWorthShowing(rows, webRows)) {
    gap()
    logger.notice(out.renderModeTable(rows, webRows))
  }
  const sections = out.endpointLines({
    ...endpointRows,
    webApps: web?.running ?? [],
  })
  if (sections.length) gap()
  for (const section of sections) logger.notice(section)
  ctx.lifecycle.ready({
    readyMs: now() - started,
    attachMs: now() - attachStarted,
  })
  gap()
  if (brokerIsNew || brokerWidened) {
    logger.aside(
      newBrokerLine({
        widened: brokerWidened && !brokerIsNew,
        functions: attachedCount > 0,
        webApps: Boolean(web?.counts.running),
      }),
    )
  }
  const keysOn =
    typeof startKeys === 'function' &&
    hotkeysEnabled({
      options,
      stdin: processRef.stdin,
      isInteractive: logger.isInteractive(),
    })
  // What a stop restores: the functions attached, the web apps that run here.
  const restores = web?.counts.running
    ? { functions: attachedCount > 0, webApps: true }
    : null
  if (restores)
    logger.aside(keysOn ? keysHint(restores) : out.stopHint(restores))
  else logger.aside(keysOn ? KEYS_HINT : out.STOP_HINT)
  const watchTimer = timers.setInterval(watch.check, watchIntervalMs)
  let keys = null
  try {
    onReady()
    // A detached session's idle timer runs from ready to the first stop.
    ctx.live.idle?.start()
    if (keysOn) {
      keys = startSessionKeys({
        startKeys,
        processRef,
        logger,
        run,
        ctx,
        now,
      })
      ctx.live.reclaimKeys = () => keys?.reclaim?.()
    }
    await stops.stopped
  } finally {
    ctx.live.reclaimKeys = null
    timers.clearInterval(watchTimer)
    watch.cancel()
    ctx.live.idle?.stop()
    // The terminal is back to normal the moment the stop begins, whatever ended the wait.
    keys?.close()
  }
}

/** The session's keys; a terminal that refuses raw mode leaves the session without them. */
const startSessionKeys = ({
  startKeys,
  processRef,
  logger,
  run,
  ctx,
  now = Date.now,
}) => {
  try {
    return startKeys({
      stdin: processRef.stdin,
      processRef,
      logger,
      actions: {
        help: () => logger.aside(KEY_HELP),
        // The functions rebuild and reload; the web apps' servers start again.
        reload: () =>
          Promise.all([run.laptop?.reloadNow?.(), run.web?.reloadAll?.()]),
        // One setting for the invocations' lines and the web requests'.
        detailed: () => {
          run.detailed = !run.detailed
          run.laptop?.setDetailed?.(run.detailed)
          logger.notice(run.detailed ? DETAILED_ON : DETAILED_OFF)
        },
        status: async () => {
          const [summary, details, table] = statusKeyLines({
            status: await ctx.live.status(),
            workers: run.laptop?.runtime?.workers?.() ?? [],
            nowMs: now(),
          })
          logger.gap?.()
          logger.notice(summary)
          logger.aside(details)
          if (table) logger.notice(table)
          logger.gap?.()
        },
        // Like the first Ctrl+C: a requested stop, which also counts as the first stop.
        quit: () => ctx.live.requestStop({ trigger: 'hotkey' }),
        // Raw mode turns Ctrl+C into a key: it goes on as the signal it would have been.
        interrupt: () => processRef.emit('SIGINT', 'SIGINT'),
      },
    })
  } catch (error) {
    logger.debug(
      `Dev Mode could not read single keys from this terminal: ${error?.message ?? error}`,
    )
    return null
  }
}

/**
 * The end of a session that attached functions: from here every relayed request is left to the
 * deployed code, and the accepted ones finish (or are ended) before "Dev Mode off". `--on-exit
 * keep` (or `dev stop --keep`) leaves the functions attached; otherwise they are restored, and
 * `--on-exit remove` then removes the service. Returns the exit code: 3 when a function could not
 * be attached or restored.
 */
export const endSession = async ({
  run,
  options,
  restoreAttached,
  attached,
  attachFailed,
  serverless,
  service,
  stage,
  region,
  confirm,
  stops,
  logger,
  ctx,
  isExiting,
  // With --on-exit keep: removes what the web app attaches that did not finish created, and
  // resolves how many could not be removed (none without web apps).
  keepAttachedWebApps = async () => 0,
  // How many web apps stay attached with --on-exit keep.
  keptWebApps = () => 0,
}) => {
  run.beginStop()
  // `dev stop --keep` asks for what `--on-exit keep` does.
  if (options['on-exit'] === 'keep' || stops.trigger()?.keep === true) {
    await run.finishLaptop()
    const notRemoved = await keepAttachedWebApps()
    const webApps = keptWebApps()
    if (attached.size || webApps) {
      logger.success(out.keptLine(attached.size, webApps))
    }
    ctx.ending.kept = true
    ctx.ending.restore = { ...EMPTY_RESTORE }
    return attachFailed || notRemoved ? 3 : 0
  }
  const result = await restoreAttached({ beforeReport: run.finishLaptop })
  ctx.ending.restore = restoreCounts(result)
  ctx.ending.webApps = webAppRestoreCounts(result)
  if (options['on-exit'] === 'remove' && result.failed.length === 0) {
    await removeService({
      serverless,
      logger,
      confirm,
      service,
      stage,
      region,
      hungUp: stops.hungUp(),
      isExiting,
    })
  }
  return result.failed.length || attachFailed ? 3 : 0
}
