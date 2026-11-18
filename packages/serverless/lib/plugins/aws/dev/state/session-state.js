/**
 * The running session's side of its on-disk record: the claim of `session.json` and the event
 * log (`openSessionState`), and the lifecycle records a session writes from its start to its end
 * (`createSessionLifecycle`). `session.ended` is always the last record; after it the session
 * file and the control token are deleted.
 */
import nodeFs from 'fs'
import path from 'path'
import { devDirOf, FILES, ownLogPidOf } from './paths.js'
import { claimSession } from './session-file.js'
import { openEventLog, scrubLine } from './events.js'
import { processAlive } from '../local/leftovers.js'
import { webAppWhy } from '../attach/output.js'

const sortedUnique = (values) =>
  [...new Set([].concat(values ?? []).map(String))].sort()

/**
 * The selection a session records: `--function` and `--skip-function`, sorted, and, when any is
 * given, the web app selectors (`web_apps`: `--web-app`, `--skip-web-app`, `--local-only`).
 */
export const selectionOf = (options = {}) => {
  const webApps = {
    only: sortedUnique(options['web-app']),
    skip: sortedUnique(options['skip-web-app']),
    local_only: sortedUnique(options['local-only']),
  }
  return {
    only: sortedUnique(options.function),
    skip: sortedUnique(options['skip-function']),
    ...(Object.values(webApps).some((names) => names.length) && {
      web_apps: webApps,
    }),
  }
}

/** A recorded selection as the options it came from. */
const optionsOf = (selection) => ({
  function: selection?.only,
  'skip-function': selection?.skip,
  'web-app': selection?.web_apps?.only,
  'skip-web-app': selection?.web_apps?.skip,
  'local-only': selection?.web_apps?.local_only,
})

/** Whether two sessions cover the same thing: stage, region, function and web app selection. */
export const sameScope = (a, b) =>
  a?.stage === b?.stage &&
  a?.region === b?.region &&
  JSON.stringify(selectionOf(optionsOf(a?.selection))) ===
    JSON.stringify(selectionOf(optionsOf(b?.selection)))

export const newSessionRecord = ({
  sessionId,
  pid,
  service,
  stage,
  region,
  owner,
  selection,
  detached = false,
  idleTimeoutS = null,
  startedAt,
  cliVersion = null,
  logFile = null,
  // The --aws-profile the session was started with: the restore it suggests uses it.
  awsProfile,
  // --take-over and --on-exit, as given: a second start compares its own with them.
  takeOver = false,
  onExit,
}) => ({
  v: 1,
  session_id: sessionId,
  pid,
  state: 'starting',
  service,
  stage,
  region,
  ...(awsProfile ? { aws_profile: awsProfile } : {}),
  owner,
  selection,
  detached,
  idle_timeout_s: idleTimeoutS,
  ...(takeOver ? { take_over: true } : {}),
  ...(onExit ? { on_exit: onExit } : {}),
  started_at: new Date(startedAt).toISOString(),
  ready_at: null,
  cli_version: cliVersion,
  events_file: FILES.events,
  log_file: logFile,
  // Set once the control endpoint listens, moments after the claim.
  control: null,
})

/**
 * A detached session's own log becomes session.log (the process keeps writing to the renamed
 * file). Only a name of that kind, in this directory, is taken; returns whether it was.
 */
const takeOverLog = ({ dir, name, fs }) => {
  if (ownLogPidOf(name) === null) return false
  const own = path.join(dir, name)
  const log = path.join(dir, FILES.log)
  try {
    fs.renameSync(own, log)
    return true
  } catch {
    // Windows replaces no file in a rename while another process has it open.
    try {
      fs.rmSync(log, { force: true })
      fs.renameSync(own, log)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Claims the service directory for `record` and opens its event log. Resolves
 * `{ claimed: true, dir, sessionFile, events }` or `{ claimed: false, existing }`; throws what the
 * claim throws (a file-system error, or `reason: 'session_running'`).
 */
export const openSessionState = async ({
  serviceDir,
  record,
  fs = nodeFs,
  now = Date.now,
  isAlive = processAlive,
  health,
  timers,
  onError = () => {},
  selfPid = process.pid,
  // The name of a detached session's own log, taken over as session.log once the claim is won.
  ownLog,
}) => {
  const dir = devDirOf(serviceDir)
  const claim = await claimSession({
    dir,
    record,
    isAlive,
    health,
    fs,
    timers,
    selfPid,
    now,
  })
  if (!claim.claimed) return { claimed: false, existing: claim.existing }
  if (ownLog && !takeOverLog({ dir, name: ownLog, fs })) {
    onError(new Error(`${ownLog} could not be renamed to ${FILES.log}`))
  }
  let events
  try {
    events = openEventLog({
      dir,
      sessionId: record.session_id,
      now,
      fs,
      onError,
    })
  } catch (error) {
    claim.release()
    throw error
  }
  return { claimed: true, dir, sessionFile: claim, events }
}

/** A session that could not write its record: everything it would write is dropped. */
export const noSessionState = () => ({
  claimed: true,
  dir: null,
  events: {
    emit: () => ({ seq: 0, cursor: null }),
    lastCursor: () => null,
    close() {},
  },
  sessionFile: {
    record: null,
    update: () => false,
    release() {},
  },
})

export const EMPTY_RESTORE = Object.freeze({
  restored: 0,
  unchanged: 0,
  skipped: 0,
  missing: 0,
  failed: 0,
})

/** The counts of a `restoreFunctions` result (or a restore cut short: missing lists count 0). */
export const restoreCounts = (result) =>
  Object.fromEntries(
    Object.keys(EMPTY_RESTORE).map((key) => [
      key,
      Array.isArray(result?.[key]) ? result[key].length : 0,
    ]),
  )

/**
 * The counts of the web apps in a restore result (its entries with `webApp`), or null when it has
 * none: `restoreCounts` counts them with the functions.
 */
export const webAppRestoreCounts = (result) => {
  const web = Object.fromEntries(
    Object.keys(EMPTY_RESTORE).map((key) => [
      key,
      Array.isArray(result?.[key])
        ? result[key].filter((entry) => entry?.webApp)
        : [],
    ]),
  )
  return Object.values(web).some((entries) => entries.length)
    ? restoreCounts(web)
    : null
}

/** A mode-table row as its `function.mode` record: notes by their codes. */
export const modeRecordOf = (row) => ({
  function: row.function,
  mode: row.mode,
  reason: row.reason,
  why: row.why,
  notes: row.notes?.length ? row.notes.map((note) => note.reason) : undefined,
})

/**
 * A web app row as its `web_app.mode` record: notes by their codes, `why` as `dev status` has it.
 */
export const webAppModeRecordOf = (row) => ({
  web_app: row.webApp,
  mode: row.mode,
  reason: row.reason,
  why: webAppWhy(row) || undefined,
  notes: row.notes?.length ? row.notes.map((note) => note.reason) : undefined,
})

/** How many web apps run in each mode, for `session.ready`'s `web_apps`. */
export const webAppModeCounts = (rows) =>
  Object.fromEntries(
    ['dev', 'local', 'deployed', 'skipped'].map((mode) => [
      mode,
      rows.filter((row) => row.mode === mode).length,
    ]),
  )

/**
 * The mode of a web app the session lost, by the state the attachment check found: taken by
 * another session, it is in Dev Mode elsewhere; otherwise its real URL serves the deployed code.
 */
const LOST_WEB_APP_MODES = {
  taken_over: 'skipped',
  taken_over_by_you: 'skipped',
  detached: 'deployed',
  function_deleted: 'deployed',
}

export const modeCounts = (rows) => ({
  dev: rows.filter((row) => row.mode === 'dev').length,
  deployed: rows.filter((row) => row.mode === 'deployed').length,
  skipped: rows.filter((row) => row.mode === 'skipped').length,
})

/**
 * The mode of a function the session lost, by the state the attachment check found: taken by
 * another session, it is in Dev Mode elsewhere (`skipped`, as when another session held it at
 * start); no longer attached, it runs the deployed code; still pointing at Dev Mode's wrapper, it
 * stays `dev` until it is restored.
 */
const LOST_MODES = {
  taken_over: 'skipped',
  taken_over_by_you: 'skipped',
  wrapper_replaced: 'deployed',
  detached: 'deployed',
  function_deleted: 'deployed',
  layer_missing: 'dev',
  env_unreadable: 'dev',
}

/**
 * The records a session writes about itself, each at most once where that matters:
 * `starting`, `modes(rows)` (the final table), `lost` (a function the session lost, which also
 * changes its row), `ready`, `failed` (only before ready), `stopping` (the first stop only), and
 * `ended`, which closes the log and deletes the session file.
 */
export const createSessionLifecycle = ({ state, now = Date.now }) => {
  const { events, sessionFile } = state
  let ready = false
  let stopping = false
  let ended = false
  let rows = []
  let webRows = []
  return {
    get isReady() {
      return ready
    },
    get rows() {
      return rows
    },
    /** The web app rows (`webModes`), none for a service without web apps. */
    get webRows() {
      return webRows
    },
    starting: (fields) => events.emit('session.starting', fields),
    modes(finalRows) {
      rows = finalRows
      for (const row of finalRows) {
        events.emit('function.mode', modeRecordOf(row))
      }
    },
    /** `state` is the attachment check's; `why` the function table's text for it. */
    lost({ name, state: lostState, why }) {
      rows = rows.map((row) =>
        row.function === name
          ? {
              function: name,
              mode: LOST_MODES[lostState] ?? row.mode,
              reason: lostState,
              why,
              notes: [],
            }
          : row,
      )
      events.emit('function.lost', { function: name, state: lostState })
    },
    /** The final web app table: one `web_app.mode` record per web app of the service. */
    webModes(finalRows) {
      webRows = finalRows
      for (const row of finalRows) {
        events.emit('web_app.mode', webAppModeRecordOf(row))
      }
    },
    /**
     * A web app the attachment check found changed (`detached`, `function_deleted`, `taken_over`,
     * or `taken_over_by_you` for another session of the same owner), by its key, with the `owner`
     * of the session that took it over; `why` the table's text for it. Its row changes too.
     */
    webAppLost({ webApp, state: lostState, owner, why }) {
      webRows = webRows.map((row) =>
        row.webApp === webApp
          ? {
              webApp,
              mode: LOST_WEB_APP_MODES[lostState] ?? row.mode,
              reason: lostState,
              why,
              notes: [],
            }
          : row,
      )
      events.emit('web_app.lost', {
        web_app: webApp,
        state: lostState,
        ...(lostState === 'taken_over' &&
          owner &&
          owner !== 'unknown' && { owner }),
      })
    },
    ready({ readyMs, attachMs }) {
      if (ready || ended) return
      ready = true
      events.emit('session.ready', {
        functions: modeCounts(rows),
        ...(webRows.length && { web_apps: webAppModeCounts(webRows) }),
        ready_ms: Math.round(readyMs),
        attach_ms: Math.round(attachMs),
      })
      sessionFile.update({
        state: 'on',
        ready_at: new Date(now()).toISOString(),
      })
    },
    failed({ reason, message, exitCode }) {
      if (ready || ended) return
      events.emit('session.failed', {
        reason,
        message: scrubLine(message),
        exit_code: exitCode,
      })
    },
    stopping(info) {
      if (stopping || ended || !info) return
      stopping = true
      events.emit('session.stopping', {
        trigger: info.trigger,
        signal: info.signal,
      })
      sessionFile.update({ state: 'stopping' })
    },
    ended({ exitCode, restore = EMPTY_RESTORE, webApps = null, kept = false }) {
      if (ended) return
      ended = true
      events.emit('session.ended', {
        exit_code: exitCode,
        restore: { ...EMPTY_RESTORE, ...restore },
        // The web apps among them, for a session that restored or failed to restore any.
        ...(webApps && { web_apps: { ...EMPTY_RESTORE, ...webApps } }),
        kept,
      })
      events.close()
      sessionFile.release()
    },
  }
}
