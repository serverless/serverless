/**
 * `serverless dev stop [--keep] [--timeout <duration>] [--json]`: asks the session running in this
 * service directory (detached or in another terminal) to stop over its control endpoint, the same
 * way a first Ctrl+C does, then waits until its log says `session.ended` and reports the restore.
 * With `--keep` the session leaves its functions in Dev Mode (`--on-exit keep`). No session: exit 0.
 *
 * Only a session it can identify is stopped. A session file whose endpoint does not answer names a
 * session that is gone (its pid may be another process by now): nothing is signalled, and the
 * result says to run `dev restore`. A session still starting (no endpoint yet, its state
 * `starting`, claimed less than START_GRACE_MS ago) is given up to START_WAIT_MS to open it; if it
 * does not, and it still counts as starting, it gets SIGTERM on Linux and macOS: before its first
 * change in AWS that ends it at once with nothing restored, after it a first Ctrl+C. A record without
 * an endpoint that is not starting (an old one, or one whose endpoint could not open) is never
 * signalled. On Windows no signal is ever sent (it would end the process without restoring). This
 * process is never taken for the session.
 */
import nodeFs from 'fs'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { progress as defaultProgress } from '@serverless/util/src/logger/index.js'
import { devDirOf } from '../state/paths.js'
import { isStartingRecord, readSession } from '../state/session-file.js'
import { followRecords, lastCursor, readSessionRecords } from '../state/read.js'
import { formatCursor } from '../state/cursor.js'
import { EMPTY_RESTORE } from '../state/session-state.js'
import { connectToSession } from '../control/client.js'
import { processAlive } from '../local/leftovers.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import {
  functionsWord,
  restoredLine,
  sessionUnreachableLine,
} from '../attach/output.js'
import { durationText, parseDuration } from './duration.js'
import {
  errorResult,
  restoreAfterStopNext,
  restoreCommand,
  restoreLine as restoreLineOf,
  restoreNext,
} from './envelope.js'
import { endReasonOf } from './session-end.js'
import { cliCommand } from './cli-names.js'

/** How long `dev stop` waits by default: the restore's own limit, plus the drain and goodbye. */
export const STOP_WAIT_MS = 7 * 60_000
/** How long `dev stop` waits for a session still starting to open its control endpoint. */
export const START_WAIT_MS = 30_000
const ALIVE_CHECK_MS = 500

const STATUS_NEXT = Object.freeze({
  get command() {
    return cliCommand('dev status')
  },
  when: 'to see whether the session has stopped',
})

/** Waits for the session's `session.ended`, its process to end, or `waitMs`. */
const waitForEnd = ({
  dir,
  fs,
  sessionId,
  afterSeq,
  pid,
  isAlive,
  timers,
  waitMs,
  pollMs,
}) =>
  new Promise((resolve) => {
    const abort = new AbortController()
    let outcome = null
    let lastSeq = afterSeq
    const settle = (value) => {
      if (outcome) return
      outcome = value
      abort.abort()
    }
    const deadline = timers.setTimeout(() => settle({ timedOut: true }), waitMs)
    const alive = timers.setInterval(() => {
      if (isAlive(pid)) return
      // The process is gone: its last record says whether it ended cleanly.
      const ended = readSessionRecords({ dir, sessionId, fs }).find(
        (record) => record.type === 'session.ended',
      )
      settle(ended ? { ended } : { died: true })
    }, ALIVE_CHECK_MS)
    followRecords({
      dir,
      afterSeq,
      sessionId,
      fs,
      timers,
      pollMs,
      signal: abort.signal,
      onRecord: (record) => {
        lastSeq = record.seq
        if (record.type === 'session.ended') settle({ ended: record })
      },
    }).then(() => {
      timers.clearTimeout(deadline)
      timers.clearInterval(alive)
      resolve({ ...outcome, lastSeq: outcome.ended?.seq ?? lastSeq })
    })
  })

/**
 * Until the session `sessionId` (still starting) names its control endpoint, for at most
 * `startWaitMs`: `{ record, waited }`, the session file read last (null once it is gone) and how
 * long that took. Stops early when the file names another session or the process ends.
 */
const waitForEndpoint = async ({
  dir,
  fs,
  sessionId,
  pid,
  alive,
  timers,
  startWaitMs,
  pollMs,
}) => {
  for (let waited = 0; ; waited += pollMs) {
    const record = readSession({ dir, fs })
    if (
      !record ||
      record.session_id !== sessionId ||
      record.control?.url ||
      !alive(pid) ||
      waited >= startWaitMs
    ) {
      return { record, waited }
    }
    await new Promise((resolve) => timers.setTimeout(resolve, pollMs))
  }
}

/**
 * The result of a session that ended: from its `session.ended` and (on an error) `session.failed`.
 * `scope` is its session file: the restore it suggests names that session's stage and region.
 */
const endedResult = (ended, sessionId, records, scope) => {
  const restore = { ...EMPTY_RESTORE, ...ended.restore }
  const kept = Boolean(ended.kept)
  const fields = {
    restore,
    kept,
    exit_code: ended.exit_code,
    cursor: formatCursor(sessionId, ended.seq),
  }
  const reason = endReasonOf({ ended })
  if (reason === 'restore_incomplete') {
    return {
      status: 'error',
      reason: 'restore_incomplete',
      message: `Dev Mode stopped, but ${functionsWord(restore.failed)} could not be restored.`,
      next: [restoreNext(scope)],
      ...fields,
    }
  }
  if (reason === 'error') {
    // An error ended the session: its recorded failure, when it wrote one, says which.
    const failure = records
      .filter((record) => record.type === 'session.failed')
      .at(-1)
    return errorResult(
      Object.assign(
        new Error(
          failure?.message ?? 'The Dev Mode session here ended with an error.',
        ),
        { reason: failure?.reason ?? 'error' },
      ),
      fields,
    )
  }
  if (reason === 'attach_incomplete') {
    return {
      status: 'error',
      reason: 'attach_incomplete',
      message: kept
        ? 'Dev Mode stopped and left its functions in Dev Mode; at its start some function could not be attached.'
        : 'Dev Mode stopped and restored its functions; at its start some function could not be attached.',
      ...fields,
    }
  }
  return {
    status: 'ok',
    message: kept
      ? 'Dev Mode stopped and left its functions in Dev Mode.'
      : `Dev Mode off · ${functionsWord(restore.restored)} restored.`,
    ...fields,
  }
}

/**
 * A result and its one human line, for the finite-command helper to print: the outcome of a stop
 * is a success line, a session that was not running a notice, a failure a warning.
 */
const levelOf = (result) => {
  if (result.status !== 'ok') return 'warning'
  return result.state === 'off' ? 'notice' : 'success'
}
const done = (result, line = result.message) => ({
  result,
  human: [[levelOf(result), line]],
})
/**
 * The result of a session that ended. A restore it finished prints the line the session itself
 * ends with; the `--json` message keeps its text.
 */
const doneEnded = (result) =>
  done(
    result,
    result.status === 'ok' && !result.kept
      ? restoredLine({ count: result.restore.restored })
      : result.message,
  )

/**
 * Runs `dev stop`: `{ result, human }` (never throws: a failure is an error result). A spinner
 * says what it waits for meanwhile, and goes before the result is printed.
 */
export const runDevStop = async (args) => {
  const spinner = (args.deps?.progress ?? defaultProgress).get('main')
  try {
    return await stopSession({ ...args, spinner })
  } catch (error) {
    return done(errorResult(error))
  } finally {
    spinner.remove()
  }
}

const stopSession = async ({
  serviceDir,
  options = {},
  spinner,
  deps = {},
}) => {
  const {
    connect = connectToSession,
    fs = nodeFs,
    isAlive = processAlive,
    timers = GLOBAL_TIMERS,
    kill = (pid, signal) => process.kill(pid, signal),
    platform = process.platform,
    now = Date.now,
    pollMs = 200,
    waitMs: defaultWaitMs = STOP_WAIT_MS,
    startWaitMs = START_WAIT_MS,
    selfPid = process.pid,
  } = deps
  // This process is never the session: never signalled, never counted as running.
  const alive = (pid) => pid !== selfPid && isAlive(pid)
  let waitMs = defaultWaitMs
  try {
    if (options.timeout !== undefined) {
      waitMs = parseDuration(options.timeout, { option: 'timeout' })
    }
  } catch (error) {
    return done(errorResult(error))
  }
  const keep = Boolean(options.keep)
  const dir = devDirOf(serviceDir)
  const quiet = { restore: { ...EMPTY_RESTORE }, kept: false }
  let record = readSession({ dir, fs })
  if (!record) {
    return done({
      status: 'ok',
      message: 'Dev Mode is not running here.',
      state: 'off',
      ...quiet,
      exit_code: 0,
      cursor: lastCursor({ dir, fs }) ?? undefined,
    })
  }
  const pid = Number(record.pid)
  const sessionId = record.session_id
  // A restore this command suggests names the session's stage, region and AWS profile, from its
  // first read.
  const scope = record
  const restoreLine = restoreLineOf(restoreCommand(scope))
  const seen = () => readSessionRecords({ dir, sessionId, fs })
  const cursorOf = (records) => {
    const last = records.at(-1)
    return last ? formatCursor(last.session_id, last.seq) : undefined
  }
  /** A stop the session did not take, or one that cannot be made: nothing changed. */
  const failed = (reason, message, extra = {}) =>
    done({
      status: 'error',
      reason,
      message,
      ...extra,
      ...quiet,
      exit_code: null,
      cursor: cursorOf(seen()),
    })
  // A session whose process is gone: its log says whether it ended cleanly.
  const gone = () => {
    const records = seen()
    const ended = records.find((item) => item.type === 'session.ended')
    if (ended) return doneEnded(endedResult(ended, sessionId, records, scope))
    return failed(
      'restore_incomplete',
      `The Dev Mode session here (pid ${pid}) ended without restoring its functions.`,
      { next: [restoreNext(scope)] },
    )
  }
  const another = (id) =>
    failed(
      'stop_failed',
      `Another Dev Mode session (${id}) took the place of session ${sessionId} here while "${cliCommand('dev stop')}" looked for it; nothing was stopped. Run "${cliCommand('dev stop')}" again to stop it.`,
    )
  /** A record without an endpoint that is not starting: nothing identifies its process. */
  const unidentified = () =>
    failed(
      'restore_incomplete',
      `The Dev Mode session here (pid ${pid}) has no control endpoint and is not starting, so it cannot be identified: it is no longer running, or it runs where only Ctrl+C reaches it. Nothing was signalled. ${restoreLine}`,
      { next: [restoreNext(scope)] },
    )
  if (!alive(pid)) return gone()
  const afterSeq = seen().at(-1)?.seq ?? 0
  let endWaitMs = waitMs
  // A running session whose endpoint could not open: nothing reaches it, and it is never signalled.
  if (!record.control?.url && record.control_unavailable) {
    return failed(
      'stop_failed',
      `${sessionUnreachableLine(record)} Nothing was signalled.`,
      {
        next: [restoreAfterStopNext(scope)],
      },
    )
  }
  if (!record.control?.url && !isStartingRecord(record, now())) {
    return unidentified()
  }
  if (!record.control?.url) {
    // Still starting: its control endpoint opens before it changes anything in AWS. --timeout
    // bounds this wait too: a session still starting when it passes is left alone.
    spinner.notice('Waiting for Dev Mode to finish starting')
    const bounded = options.timeout !== undefined && waitMs < startWaitMs
    const started = await waitForEndpoint({
      dir,
      fs,
      sessionId,
      pid,
      alive,
      timers,
      startWaitMs: bounded ? waitMs : startWaitMs,
      pollMs,
    })
    record = started.record
    if (!record || !alive(pid)) return gone()
    if (record.session_id !== sessionId) return another(record.session_id)
    if (bounded && !record.control?.url) {
      return done({
        status: 'timeout',
        reason: 'timeout',
        message: `The Dev Mode session here (pid ${pid}) is still starting after ${durationText(waitMs)}; nothing was asked of it yet.`,
        next: [STATUS_NEXT],
        ...quiet,
        exit_code: null,
        cursor: cursorOf(seen()),
      })
    }
    // What is left of --timeout once the endpoint opened.
    if (options.timeout !== undefined) {
      endWaitMs = Math.max(waitMs - started.waited, pollMs)
    }
  }
  if (record.control?.url) {
    const session = await connect({ serviceDir, fs, isAlive: alive, timers })
    if (!session) {
      // Nothing answers. A session that ended in the meantime (Ctrl+C, its idle timeout, a failed
      // start) wrote `session.ended` and removed its file: that is how it ended.
      const latest = readSession({ dir, fs })
      if (
        !latest ||
        !alive(pid) ||
        seen().some((item) => item.type === 'session.ended')
      ) {
        return gone()
      }
      if (latest.session_id !== sessionId) return another(latest.session_id)
      // Its endpoint does not answer: the session is gone, and its pid may be another process.
      return failed(
        'restore_incomplete',
        `The Dev Mode session here (pid ${pid}) does not answer on its control endpoint: it is no longer running. Nothing was signalled. ${restoreLine}`,
        { next: [restoreNext(scope)] },
      )
    }
    if (session.record?.session_id !== sessionId) {
      return another(session.record?.session_id)
    }
    let answer
    try {
      answer = await session.stop({ keep })
    } catch (error) {
      answer = { status: 0, error }
    }
    if (answer.status !== 202 && alive(pid)) {
      return failed(
        'stop_failed',
        `The Dev Mode session here (pid ${pid}) did not accept the stop (${answer.error?.message ?? `HTTP ${answer.status}`}).`,
      )
    }
  } else if (keep) {
    return failed(
      'stop_failed',
      `The Dev Mode session here (pid ${pid}) is still starting and does not answer yet, so --keep cannot reach it. Run "${cliCommand('dev stop --keep')}" again once it is on.`,
    )
  } else if (platform === 'win32') {
    return failed(
      'stop_failed',
      `The Dev Mode session here (pid ${pid}) is still starting and does not answer yet. Run "${cliCommand('dev stop')}" again once it is on, or end that process and run "${restoreCommand(scope)}".`,
      { next: [restoreNext(scope)] },
    )
  } else if (!isStartingRecord(record, now())) {
    // It stopped counting as starting during the wait: its pid is no longer known to be its own.
    return unidentified()
  } else {
    // Linux and macOS only, for a session still starting.
    try {
      kill(pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') {
        return failed(
          'stop_failed',
          `Dev Mode could not signal the session here (pid ${pid}): ${error.message}`,
        )
      }
    }
  }
  spinner.notice(
    keep
      ? 'Stopping Dev Mode (functions stay in Dev Mode)'
      : 'Restoring and stopping Dev Mode',
  )
  const outcome = await waitForEnd({
    dir,
    fs,
    sessionId,
    afterSeq,
    pid,
    isAlive: alive,
    timers,
    waitMs: endWaitMs,
    pollMs,
  })
  if (outcome.ended) {
    return doneEnded(endedResult(outcome.ended, sessionId, seen(), scope))
  }
  const cursor = outcome.lastSeq
    ? formatCursor(sessionId, outcome.lastSeq)
    : undefined
  if (outcome.died) {
    return done({
      status: 'error',
      reason: 'restore_incomplete',
      message: `The Dev Mode session here (pid ${pid}) ended without saying it restored its functions.`,
      next: [restoreNext(scope)],
      ...quiet,
      exit_code: null,
      cursor,
    })
  }
  return done({
    status: 'timeout',
    reason: 'timeout',
    message: `The Dev Mode session here (pid ${pid}) is still stopping after ${durationText(waitMs)}${keep ? '' : '; it keeps restoring'}.`,
    next: [STATUS_NEXT],
    ...quiet,
    exit_code: null,
    cursor,
  })
}
