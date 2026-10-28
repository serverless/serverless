/**
 * The idle timeout of a detached session (`serverless dev --detach`): after `timeoutMs` without
 * activity it calls `onIdle` once. Activity is `touch()`: an invocation or a web app request
 * starting or ending, a reload or a watched file change (its reload records), a request to the
 * session's control endpoint, and an open `serverless dev wait`, which touches every 30 s (a wait
 * for the session's end does not: it leaves the session free to stop). While `isBusy()` (an
 * invocation or a web app request is still running) the session is not idle. A session in a
 * terminal has no idle timeout.
 */
import { ServerlessError } from '@serverless/util'
import { durationText, parseDuration } from '../commands/duration.js'

export const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60_000
/** The shortest idle timeout: longer than the 30 s an open `serverless dev wait` touches at. */
export const MIN_IDLE_TIMEOUT_MS = 60_000
export const IDLE_ACTIVITY_TYPES = new Set([
  'invocation.start',
  'invocation.end',
  'request.start',
  'request.end',
  'reload.start',
  'reload.end',
])

/**
 * `--idle-timeout` in ms (0: none). Below a minute it is refused, so an open `serverless dev wait`
 * always keeps a session alive.
 */
export const parseIdleTimeout = (text) => {
  const ms = parseDuration(text, { option: 'idle-timeout', allowZero: true })
  if (ms !== 0 && ms < MIN_IDLE_TIMEOUT_MS) {
    throw new ServerlessError(
      `Option "--idle-timeout" must be at least ${durationText(MIN_IDLE_TIMEOUT_MS)}, or 0 to turn it off.`,
      'DEV_MODE_INVALID_DURATION',
      { stack: false },
    )
  }
  return ms
}

/** The session's idle timeout in ms, or null: only a session process has one. */
export const idleTimeoutOf = (options = {}) => {
  if (!options['session-process']) return null
  if (options['idle-timeout'] === undefined) return DEFAULT_IDLE_TIMEOUT_MS
  return parseIdleTimeout(options['idle-timeout']) || null
}

/** `what`: what the stop restores, as output.js restoresWhat says it. */
export const idleStopLine = (ms, what = 'your functions') =>
  `No activity for ${durationText(ms)}: Dev Mode stops and restores ${what} (--idle-timeout).`

/** The idle timer of a session that has none. */
export const NO_IDLE = Object.freeze({ start() {}, touch() {}, stop() {} })

export const createIdleTimer = ({
  timeoutMs,
  timers,
  now,
  onIdle,
  isBusy = () => false,
}) => {
  let last = now()
  let timer = null
  let started = false
  let done = false
  const arm = (ms) => {
    timer = timers.setTimeout(check, Math.max(1, ms))
  }
  // One timer at a time; a touch only moves `last`, and the timer re-arms for what is left.
  const check = () => {
    timer = null
    if (done) return
    const quietFor = now() - last
    if (quietFor < timeoutMs) {
      arm(timeoutMs - quietFor)
      return
    }
    if (isBusy()) {
      last = now()
      arm(timeoutMs)
      return
    }
    done = true
    onIdle()
  }
  return {
    start() {
      if (started || done) return
      started = true
      last = now()
      arm(timeoutMs)
    },
    touch() {
      last = now()
    },
    stop() {
      done = true
      if (timer !== null) timers.clearTimeout(timer)
      timer = null
    },
  }
}

/** The event log, with every activity record also counted as activity. */
export const withIdleActivity = (events, idle) =>
  Object.assign(Object.create(events), {
    emit(type, fields) {
      if (IDLE_ACTIVITY_TYPES.has(type)) idle.touch()
      return events.emit(type, fields)
    },
  })
