/**
 * `serverless dev wait`: waits until this directory's Dev Mode session reaches a point, then prints
 * that event record and its cursor. `--for ready` and `--for ended` return at once when that is
 * already true; `--for invocation`, `--for request` and `--for reload` match the next
 * `invocation.end` / `request.end` (of a web app) / `reload.end` after now, or after `--after
 * <cursor>` (exclusive), including records written before the command started. The result's cursor
 * is the matched record's, so `--after` it continues right after it. `--for ended` answers with the
 * end's own status: exit 0 for a clean end, the end's exit code otherwise. The wait reads
 * .serverless/dev/session.ndjson; while it waits for anything but the end it tells the session
 * every 30 s that it is in use, so a detached session does not stop for being idle.
 */
import fs from 'fs'
import { ServerlessError } from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { progress as defaultProgress } from '@serverless/util/src/logger/index.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import { connectToSession } from '../control/client.js'
import { shortId } from '../local/invocation-output.js'
import { processAlive } from '../local/leftovers.js'
import { formatCursor, parseCursor } from '../state/cursor.js'
import { devDirOf } from '../state/paths.js'
import {
  currentSessionId,
  followRecords,
  readRecords,
  readSessionRecords,
} from '../state/read.js'
import { isStartingRecord, readSession } from '../state/session-file.js'
import { durationText, parseDuration } from './duration.js'
import {
  envelope,
  errorResult,
  isRestoreNext,
  restoreCommand,
  restoreLine,
  restoreNext,
} from './envelope.js'
import { endStatusOf } from './session-end.js'
import { cliCommand, shownPath } from './cli-names.js'
import { runningCounts } from '../attach/output.js'
import { getWebAppsConfig } from '../../lib/web-apps.js'

export const WAIT_DEFAULT_MS = 100_000
export const WAIT_MAX_MS = 60 * 60_000
export const WAIT_FOR = ['ready', 'invocation', 'request', 'reload', 'ended']
/** How often a wait checks that the session process is still there. */
export const PRESENCE_POLL_MS = 1_000
/** How often an open wait tells the session it is in use. */
export const TOUCH_INTERVAL_MS = 30_000
/**
 * A touch is one attempt that ends within 2 s, so it never outlives the wait by more: a session
 * still starting is connected to with no second health check, each call within half of that.
 */
const TOUCH_CALL_MS = 1_000
/**
 * How long a failed start's `session.ended` is looked for: the session writes it right after its
 * `session.failed`, and a wait can read between the two.
 */
export const ENDED_WAIT_MS = 250
const ENDED_POLL_MS = 50

const START = Object.freeze({
  get command() {
    return cliCommand('dev --detach')
  },
  when: 'to start a session',
})

/**
 * Whether a record is the session's terminal record: a failed start ends with `session.failed`
 * (its `session.ended` follows it), any other end with `session.ended`. The first such record of a
 * session is its end, wherever the end is looked for.
 */
const isTerminal = (record) =>
  record.type === 'session.failed' || record.type === 'session.ended'
export const terminalOf = (records) => records.find(isTerminal)

/**
 * Timers that end together: `after(ms, fn)` and `every(ms, fn)` start one, `end()` clears every
 * one started, so a wait leaves none behind whichever way it ends.
 */
const waiting = (timers) => {
  const clears = []
  return {
    after(ms, fn) {
      const handle = timers.setTimeout(fn, ms)
      clears.push(() => timers.clearTimeout(handle))
    },
    every(ms, fn) {
      const handle = timers.setInterval(fn, ms)
      clears.push(() => timers.clearInterval(handle))
    },
    end() {
      for (const clear of clears.splice(0)) clear()
    },
  }
}

const parseWaitFor = (value) => {
  if (WAIT_FOR.includes(value)) return value
  throw new ServerlessError(
    `Option "--for" must be one of: ${WAIT_FOR.join(', ')}.`,
    'DEV_MODE_INVALID_WAIT_FOR',
    { stack: false },
  )
}

/** Whether a record is what `--for <kind>` (and `--function` or `--web-app`) waits for. */
export const matcherFor = ({ kind, functions = [], webApps = [] }) => {
  const wanted = new Set(functions)
  const forFunction = (name) => wanted.size === 0 || wanted.has(name)
  const apps = new Set(webApps)
  switch (kind) {
    case 'request':
      return (record) =>
        record.type === 'request.end' &&
        (apps.size === 0 || apps.has(record.web_app))
    case 'ready':
      return (record) => record.type === 'session.ready'
    case 'ended':
      return isTerminal
    case 'invocation':
      return (record) =>
        record.type === 'invocation.end' && forFunction(record.function)
    default:
      // A reload of the functions (`functions`) or of a web app's server (`web_apps`).
      return (record) =>
        record.type === 'reload.end' &&
        ((wanted.size === 0 && apps.size === 0) ||
          (record.functions ?? []).some((name) => wanted.has(name)) ||
          (record.web_apps ?? []).some((key) => apps.has(key)))
  }
}

const WHAT = {
  ready: () => 'Dev Mode to be ready',
  ended: () => 'the session to end',
  invocation: (functions) =>
    functions.length
      ? `the next invocation of ${functions.join(' or ')}`
      : 'the next invocation',
  reload: (functions, webApps = []) =>
    functions.length || webApps.length
      ? `the next reload of ${[...functions, ...webApps].join(' or ')}`
      : 'the next reload',
  request: (functions, webApps) =>
    webApps.length
      ? `the next request to ${webApps.join(' or ')}`
      : 'the next web app request',
}

/** A record as a result carries it: its file as it is reached from where the CLI runs. */
const shownRecord = (record) =>
  record?.file ? { ...record, file: shownPath(record.file) } : record

/** One record as a person reads it. */
export const describeRecord = (record) => {
  switch (record.type) {
    case 'session.ready': {
      const { dev = 0, deployed = 0, skipped = 0 } = record.functions ?? {}
      const web = record.web_apps
      // Web apps, for a service with web apps: those in dev or local mode run on this machine.
      const running = web ? (web.dev ?? 0) + (web.local ?? 0) : 0
      const counts = runningCounts({
        devCount: dev,
        total: dev + deployed + skipped,
        ...(web && {
          webApps: {
            running,
            total: running + (web.deployed ?? 0) + (web.skipped ?? 0),
          },
        }),
      })
      return `Dev Mode is on: ${counts} run on this machine (session ${record.session_id}).`
    }
    case 'invocation.end':
      return [
        `${record.function} · ${shortId(record.request_id)} · ${record.outcome}${record.status_code ? ` · ${record.status_code}` : ''} · ${record.duration_ms} ms${record.source === 'replay' ? ' · replay' : ''}`,
        record.file && shownPath(record.file),
      ]
        .filter(Boolean)
        .join('\n')
    case 'request.end':
      return [
        [
          record.web_app,
          `${record.method ?? ''} ${record.path ?? ''}`.trim(),
          shortId(record.request_id),
          record.outcome,
          record.status_code ? String(record.status_code) : null,
          `${record.duration_ms} ms`,
          record.source && record.source !== 'relay' ? record.source : null,
        ]
          .filter(Boolean)
          .join(' · '),
        record.file && shownPath(record.file),
      ]
        .filter(Boolean)
        .join('\n')
    case 'reload.end':
      return record.ok
        ? `Reloaded ${(record.functions ?? [])
            .concat((record.web_apps ?? []).map((key) => `web app ${key}`))
            .join(', ')} (${record.ms} ms).`
        : `The reload failed: ${record.error ?? 'see the session output'}.`
    case 'session.failed':
      return record.message
        ? `Dev Mode did not start: ${record.message}`
        : 'Dev Mode did not start.'
    case 'session.ended': {
      const restore = record.restore ?? {}
      const exit =
        record.exit_code === undefined || record.exit_code === null
          ? ''
          : ` (exit ${record.exit_code})`
      return `Dev Mode off${exit}: ${restore.restored ?? 0} restored, ${restore.failed ?? 0} not restored${record.kept ? (record.web_apps ? '; what it attached was kept in Dev Mode' : '; functions were kept in Dev Mode') : ''}.`
    }
    default:
      return record.type
  }
}

/**
 * Follows the session's records after `afterSeq` until `match` takes one (→ `{ record }`),
 * `stopOn` says the session ended (→ `{ ended: record }`), `gone()` says its process is gone
 * (→ `{ ended: null }`, after one last `read({ dir, sessionId, fs })`), or `timeoutMs` passes
 * (→ `{ timedOut: true }`). `touch`, when given, runs every `touchMs`. Every outcome carries
 * `lastSeq`, the seq of the last record seen, and leaves no timer behind.
 */
export const waitForRecord = ({
  dir,
  sessionId,
  afterSeq,
  match,
  stopOn = isTerminal,
  timeoutMs,
  gone,
  touch,
  deps,
}) =>
  new Promise((resolve) => {
    const { fs: fsRef, timers, follow, read, presenceMs, touchMs } = deps
    const controller = new AbortController()
    const clock = waiting(timers)
    let last = afterSeq
    let settled = false
    const finish = (outcome) => {
      if (settled) return
      settled = true
      clock.end()
      controller.abort()
      resolve({ ...outcome, lastSeq: last })
    }
    const consider = (record) => {
      if (settled || record.session_id !== sessionId || !(record.seq > last)) {
        return
      }
      last = record.seq
      if (match(record)) finish({ record })
      else if (stopOn(record)) finish({ ended: record })
    }
    clock.after(timeoutMs, () => finish({ timedOut: true }))
    if (touch) {
      // Not awaited: a touch that fails or hangs never holds the wait up.
      clock.every(touchMs, () => {
        Promise.resolve()
          .then(touch)
          .catch(() => {})
      })
    }
    if (gone) {
      let checking = false
      clock.every(presenceMs, async () => {
        if (settled || checking) return
        checking = true
        try {
          if (!(await gone())) return
          // The last records may have been written just before the process went.
          try {
            for (const record of await read({ dir, sessionId, fs: fsRef })) {
              consider(record)
            }
          } catch {
            // Nothing more to read.
          }
          finish({ ended: null })
        } catch {
          // A check that fails says nothing; the next one asks again.
        } finally {
          checking = false
        }
      })
    }
    Promise.resolve()
      .then(() =>
        follow({
          dir,
          afterSeq,
          sessionId,
          onRecord: consider,
          timers,
          signal: controller.signal,
          fs: fsRef,
        }),
      )
      .catch((error) => finish({ error }))
  })

/**
 * Runs `dev wait`: `{ result, human }`. A spinner says what it waits for meanwhile, and goes
 * before the result is printed.
 */
export const runDevWait = async (args) => {
  const spinner = (args.deps?.progress ?? defaultProgress).get('main')
  try {
    return await waitForSession({ ...args, spinner })
  } finally {
    spinner.remove()
  }
}

const waitForSession = async ({
  serviceDir,
  options = {},
  spinner,
  serverless,
  deps = {},
}) => {
  const {
    fs: fsRef = fs,
    timers = GLOBAL_TIMERS,
    connect = connectToSession,
    isAlive = processAlive,
    follow = followRecords,
    read = readRecords,
    presenceMs = PRESENCE_POLL_MS,
    touchMs = TOUCH_INTERVAL_MS,
    endedWaitMs = ENDED_WAIT_MS,
  } = deps
  // The records of one session, from the current event file or its renamed one.
  const readOfSession = deps.read ?? readSessionRecords
  const dir = devDirOf(serviceDir)
  // A person is told to run `dev restore` whenever it is the next step.
  const done = (fields, human = fields.message) => {
    const restore = fields.next?.find(isRestoreNext)
    return {
      result: envelope(fields),
      human:
        restore && !String(human).includes(restore.command)
          ? `${human}\n${restoreLine(restore.command)}`
          : human,
    }
  }
  try {
    const kind = parseWaitFor(options.for)
    const timeoutMs =
      options.timeout === undefined
        ? WAIT_DEFAULT_MS
        : parseDuration(options.timeout, {
            option: 'timeout',
            maxMs: WAIT_MAX_MS,
          })
    const functions = [...new Set([].concat(options.function ?? []))]
    const webApps = [...new Set([].concat(options['web-app'] ?? []))]
    // A filter of another kind of event would only wait for the time limit.
    if (
      (webApps.length && kind !== 'request' && kind !== 'reload') ||
      (functions.length && kind === 'request')
    ) {
      throw new ServerlessError(
        'Option "--web-app" goes with "--for request" or "--for reload"; "--function" goes with "--for invocation" or "--for reload".',
        'DEV_MODE_INVALID_OPTION_COMBINATION',
        { stack: false },
      )
    }
    // A name serverless.yml does not have would only wait for the time limit.
    const names = serverless?.service?.getAllFunctions?.()
    if (names) {
      const unknown = functions.find((name) => !names.includes(name))
      if (unknown !== undefined) {
        throw new ServerlessError(
          `Function "${unknown}" is not in serverless.yml.`,
          'DEV_MODE_UNKNOWN_FUNCTION',
          { stack: false },
        )
      }
    }
    if (webApps.length && serverless?.service) {
      const known = Object.keys(getWebAppsConfig(serverless))
      const unknown = webApps.find((name) => !known.includes(name))
      if (unknown !== undefined) {
        throw new ServerlessError(
          `Web app "${unknown}" is not in this service. Web apps: ${known.join(', ') || 'none'}.`,
          'DEV_MODE_UNKNOWN_WEB_APP',
          { stack: false },
        )
      }
    }
    const after =
      options.after === undefined ? null : parseCursor(String(options.after))
    const match = matcherFor({ kind, functions, webApps })

    // A cursor of another session: an earlier one here while its records are kept (they name its
    // service and stage), else one this directory knows nothing of, such as the session of
    // another service running at the same time.
    const otherSession = async () => {
      const startOf = async (sessionId) => {
        try {
          return (
            (await readOfSession({ dir, sessionId, fs: fsRef })).find(
              (record) => record.type === 'session.starting',
            ) ?? null
          )
        } catch {
          // Unknown, like a session whose records are gone.
          return null
        }
      }
      const earlier = await startOf(after.sessionId)
      const service =
        serverless?.service?.service ??
        (fileSession ? (await startOf(fileSession))?.service : undefined)
      const message = earlier
        ? `The cursor ${options.after} belongs to an earlier Dev Mode session${earlier.service ? ` of ${earlier.service}` : ''}${earlier.stage ? ` (stage ${earlier.stage})` : ''}. Take a cursor of the current one from "${cliCommand('dev status --json')}".`
        : `The cursor ${options.after} belongs to another Dev Mode session, not to the ${service ? `session of ${service} running here` : 'one running here'}. Take a cursor of this one from "${cliCommand('dev status --json')}".`
      return done({
        status: 'error',
        reason: 'cursor_from_other_session',
        message,
        next: [
          {
            command: cliCommand('dev status --json'),
            when: 'to get a cursor of the running session',
          },
        ],
      })
    }
    const fileSession = await currentSessionId({ dir, fs: fsRef })
    if (after && fileSession && after.sessionId !== fileSession) {
      return await otherSession()
    }
    const records = fileSession
      ? (await read({ dir, fs: fsRef })).filter(
          (record) => record.session_id === fileSession,
        )
      : []
    const lastOf = (list) => list[list.length - 1]
    // A session's `session.starting` (in the event file, else its renamed one), whose stage and
    // region the restore a result suggests names; null when it cannot be read.
    const scopeOf = async (sessionId) => {
      const isStart = (record) =>
        record.type === 'session.starting' && record.session_id === sessionId
      const here = records.find(isStart)
      if (here) return here
      try {
        return (
          (await readOfSession({ dir, sessionId, fs: fsRef })).find(isStart) ??
          null
        )
      } catch {
        return null
      }
    }
    const cursorOf = (record) =>
      record ? formatCursor(record.session_id, record.seq) : undefined
    // The `session.ended` of a session's terminal record: the record itself, or, after a failed
    // start, the one the session writes right after its `session.failed` (from its log, renamed
    // or not); null when its process went before writing it. Only it says what was restored.
    const endedOf = async (record) => {
      if (record.type === 'session.ended') return record
      const lookUp = async () => {
        try {
          const recordsOfIt = await readOfSession({
            dir,
            sessionId: record.session_id,
            fs: fsRef,
          })
          return (
            recordsOfIt.find(
              (item) =>
                item.type === 'session.ended' &&
                item.session_id === record.session_id,
            ) ?? null
          )
        } catch {
          return null
        }
      }
      // Read right after the `session.failed`, its `session.ended` may not be written yet.
      for (let waited = 0; ; waited += ENDED_POLL_MS) {
        const hit = await lookUp()
        if (hit || waited >= endedWaitMs) return hit
        await new Promise((resolve) =>
          timers.setTimeout(
            resolve,
            Math.min(ENDED_POLL_MS, endedWaitMs - waited),
          ),
        )
      }
    }
    // Every match answers with its own cursor: `--after` it continues right after it.
    // `--for ended` answers with the end's own status: ok only for a clean end.
    const found = async (record) =>
      done(
        {
          ...(kind === 'ended'
            ? endStatusOf(
                record,
                await endedOf(record),
                await scopeOf(record.session_id),
              )
            : { status: 'ok' }),
          event: shownRecord(record),
          cursor: cursorOf(record),
        },
        describeRecord(record),
      )
    // An end that left a function in Dev Mode (its `session.ended` says so) has `dev restore` next.
    const sessionEnded = async (record, cursor) =>
      record
        ? done(
            {
              status: 'error',
              reason: 'session_ended',
              message: 'The Dev Mode session ended before that happened.',
              event: shownRecord(record),
              cursor,
              next: (await endedOf(record))?.restore?.failed
                ? [restoreNext(await scopeOf(record.session_id))]
                : undefined,
            },
            `The Dev Mode session ended before that happened.\n${describeRecord(record)}`,
          )
        : done({
            status: 'error',
            reason: 'session_ended',
            message:
              'The Dev Mode session process ended without its final record; functions it attached may still be in Dev Mode.',
            cursor,
            next: [restoreNext(await scopeOf(fileSession))],
          })
    const notRunning = () =>
      done({
        status: 'error',
        reason: 'session_not_running',
        message: 'Dev Mode is not running in this directory.',
        cursor: cursorOf(lastOf(records)),
        next: [START],
      })

    // A session file whose session does not answer, as `dev stop` reads it: its process is gone,
    // or its control endpoint does not answer (its pid may be another process by now), and its
    // log has no end. Functions it attached may still be in Dev Mode.
    const stale = (record, recordsOfIt) =>
      done({
        status: 'error',
        reason: 'restore_incomplete',
        message:
          record.control && isAlive(Number(record.pid))
            ? `The Dev Mode session here (pid ${record.pid}) does not answer on its control endpoint: it is no longer running. ${restoreLine(restoreCommand(record))}`
            : `The Dev Mode session here (pid ${record.pid}) ended without restoring its functions.`,
        cursor: cursorOf(lastOf(recordsOfIt)),
        next: [restoreNext(record)],
      })

    // With --after, what the file already holds answers first: it happened, running session or
    // not. The first match after the cursor wins; an end before any match ends the wait.
    if (after && kind !== 'ready') {
      const later = records.filter((record) => record.seq > after.seq)
      const hit = later.find(match)
      if (hit) return await found(hit)
      const end = terminalOf(later)
      if (end) return await sessionEnded(end, cursorOf(end))
    }

    const client = await connect({ serviceDir, fs: fsRef, isAlive, timers })
    let live = client?.record ?? null
    if (!live) {
      const record = await Promise.resolve()
        .then(() => readSession({ dir, fs: fsRef }))
        .catch(() => null)
      if (
        record &&
        (isStartingRecord(record) || record.control_unavailable === true) &&
        isAlive(Number(record.pid))
      ) {
        // Still starting: no control endpoint yet (`control: null`); its live pid says it is there.
        live = record
      } else if (record) {
        const recordsOfIt = await Promise.resolve()
          .then(() =>
            readSessionRecords({
              dir,
              sessionId: record.session_id,
              fs: fsRef,
            }),
          )
          .catch(() => [])
        // A session that wrote its end and has not removed its file yet has ended.
        if (!terminalOf(recordsOfIt)) return await stale(record, recordsOfIt)
      }
    }
    if (kind === 'ended') {
      const end = terminalOf(records)
      if (end && (!live || live.session_id === fileSession))
        return await found(end)
    }
    if (!live) return await notRunning()
    const sessionId = live.session_id
    // The event file still holds the previous session until a new one opens its own.
    const own = sessionId === fileSession ? records : []
    if (after && after.sessionId !== sessionId) {
      // A cursor of a session that is not the running one.
      if (after.sessionId !== fileSession) return await otherSession()
      // It names the last session, and a new one runs (its event file is not open yet): the
      // last one has ended.
      const end = terminalOf(records)
      if (end && kind === 'ended') return await found(end)
      return await sessionEnded(end ?? null, cursorOf(end ?? lastOf(records)))
    }
    if (kind === 'ready') {
      const hit = own.find(match)
      if (hit) return await found(hit)
      const end = terminalOf(own)
      if (end) return await sessionEnded(end, cursorOf(end))
      // Not ready yet, or its ready record is still being written: follow the file for it.
    }
    const afterSeq = Math.max(after?.seq ?? 0, lastOf(own)?.seq ?? 0)
    let toucher = client
    spinner.notice(
      `Waiting for ${WHAT[kind](functions, webApps)} (up to ${durationText(timeoutMs)})`,
    )
    const outcome = await waitForRecord({
      dir,
      sessionId,
      afterSeq,
      match,
      timeoutMs,
      // Waiting for the end leaves the session free to stop for being idle. A session still
      // starting is touched once its control endpoint listens.
      touch:
        kind === 'ended'
          ? undefined
          : async () => {
              toucher ??= await connect({
                serviceDir,
                fs: fsRef,
                isAlive,
                timers,
                retryMs: 0,
                timeoutMs: TOUCH_CALL_MS,
              })
              if (toucher?.record?.session_id === sessionId) {
                await toucher.touch()
              } else {
                toucher = null
              }
            },
      gone: async () => {
        const current = await readSession({ dir, fs: fsRef })
        return (
          !current ||
          current.session_id !== sessionId ||
          !isAlive(Number(current.pid))
        )
      },
      deps: {
        fs: fsRef,
        timers,
        follow,
        // The last read looks in the session's rotated file too, when a new session started.
        read: readOfSession,
        presenceMs,
        touchMs,
      },
    })
    // The last record of this session seen; none yet while a new session has not written one
    // (a cursor of the previous session would be refused by the next wait).
    const cursor =
      outcome.lastSeq > 0 ? formatCursor(sessionId, outcome.lastSeq) : undefined
    if (outcome.record) return await found(outcome.record)
    if (outcome.error) throw outcome.error
    if (outcome.timedOut) {
      const again = [
        cliCommand(`dev wait --for ${kind}`),
        ...functions.map((name) => `--function ${name}`),
        ...webApps.map((name) => `--web-app ${name}`),
        ...(cursor ? [`--after ${cursor}`] : []),
      ].join(' ')
      return done({
        status: 'timeout',
        reason: 'timeout',
        message: `Nothing matched within ${durationText(timeoutMs)}; the session is still running.`,
        cursor,
        next: [
          { command: again, when: 'to keep waiting without missing an event' },
        ],
      })
    }
    if (outcome.ended) {
      return await sessionEnded(outcome.ended, cursorOf(outcome.ended))
    }
    // The process went without its end record, as `dev stop` reports it: functions it attached
    // may still be in Dev Mode.
    return done({
      status: 'error',
      reason: 'restore_incomplete',
      message: `The Dev Mode session here (pid ${live.pid}) ended without restoring its functions.`,
      cursor,
      next: [restoreNext(live)],
    })
  } catch (error) {
    // A bad option, a malformed cursor and any unexpected error alike: status and exit code
    // follow the reason (`errorResult`), so nothing that went wrong exits 0.
    return done(errorResult(error))
  }
}
