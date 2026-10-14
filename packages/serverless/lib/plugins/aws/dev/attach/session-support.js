/**
 * What every part of a Dev Mode session shares: who the session belongs to, its id, output that
 * never throws, and a timeout that leaves no timer behind.
 */
import os from 'os'
import { randomBytes as nodeRandomBytes } from 'crypto'

/**
 * Who a session belongs to, written on every function it attaches. The host is lowercased and
 * loses its `.local` suffix: macOS reports the same machine either way, and a session must not
 * look like another developer's when it is the same person on the same machine.
 */
export const defaultOwner = ({ osRef = os, env = process.env } = {}) => {
  let user
  try {
    user = osRef.userInfo().username
  } catch {
    user = env.USER || env.USERNAME
  }
  const host = String(osRef.hostname() || 'unknown-host')
    .toLowerCase()
    .replace(/\.local$/, '')
  return `${user || 'unknown'}@${host}`.slice(0, 64)
}

export const newSessionId = (randomBytes = nodeRandomBytes) =>
  `s_${randomBytes(6).toString('hex')}`

/**
 * The session's AES-256-GCM key: 32 random bytes, written in base64 to every attached function
 * and never printed.
 */
export const newSessionKey = (randomBytes = nodeRandomBytes) => randomBytes(32)

/** Output is best effort: once the terminal is gone a write can throw, and restoring must go on. */
export const quiet = (fn) => {
  try {
    fn()
  } catch {
    // Nowhere left to write to.
  }
}
const LEVELS = ['notice', 'success', 'warning', 'error', 'debug', 'aside']
/**
 * Output that never throws. While `muted()` is true every line is dropped: once a forced exit
 * printed its lines, they are the session's last. `gap()` separates two sections with one blank
 * line: none when the last line it printed was blank already.
 */
export const guardedLogger = (logger, muted = () => false) => {
  const guarded = Object.create(logger)
  let lastBlank = false
  for (const level of LEVELS) {
    guarded[level] = (...args) => {
      if (muted()) return
      quiet(() => logger[level](...args))
      if (level !== 'debug') lastBlank = false
    }
  }
  guarded.blankLine = () => {
    if (muted()) return
    quiet(() => logger.blankLine?.())
    lastBlank = true
  }
  guarded.gap = () => {
    if (muted()) return
    // The CLI's logger also knows of the blank line a spinner keeps above itself.
    if (typeof logger.gap === 'function') {
      quiet(() => logger.gap())
      lastBlank = true
      return
    }
    if (!lastBlank) guarded.blankLine()
  }
  return guarded
}
/**
 * The session's spinner, output that never throws. It always shows at once (the first Ctrl+C's
 * "press Ctrl+C again" is on it), but never splits an invocation's lines: while an invocation's
 * lines print (`hold`), the spinner sits right under them, with no blank line above it
 * (`setBlankLineAbove(false)`), and each line takes its place. Once no invocation runs
 * (`release`), it moves below one blank line (`gap()`), as a section of its own.
 */
export const guardedProgress = (
  spinner,
  muted = () => false,
  { gap = () => {}, setBlankLineAbove = () => {} } = {},
) => {
  // What the spinner says, null when it has nothing to show.
  let text = null
  let held = false
  return {
    notice: (next) => {
      text = next
      if (!muted()) quiet(() => spinner.notice(next))
    },
    remove: () => {
      text = null
      quiet(() => spinner.remove())
    },
    hold: () => {
      if (held) return
      held = true
      quiet(() => setBlankLineAbove(false))
    },
    release: () => {
      if (!held) return
      held = false
      quiet(() => setBlankLineAbove(true))
      if (text === null || muted()) return
      quiet(() => spinner.remove())
      quiet(gap)
      quiet(() => spinner.notice(text))
    },
  }
}

/**
 * A terminal that hangs up turns every later write to stdout and stderr into an EIO or EPIPE
 * error event, which would end the process as an uncaught exception in the middle of restoring.
 * Returns a function that takes the guard off again.
 */
export const guardStreams = (processRef) => {
  const streams = [processRef.stdout, processRef.stderr].filter(
    (stream) => typeof stream?.on === 'function',
  )
  const ignore = () => {}
  for (const stream of streams) stream.on('error', ignore)
  return () => {
    for (const stream of streams) stream.off('error', ignore)
  }
}

export const OFF_UNCHANGED = 'Dev Mode off · no function was changed'
export const TIMED_OUT = Symbol('timed out')
export const CANCELLED = Symbol('cancelled')
/**
 * `promise`, or TIMED_OUT once `ms` passed. `control.cancel()`, set here, clears the timer at once
 * and settles with CANCELLED, so a session that ends leaves no timer behind.
 */
export const within = async (promise, ms, timers, control = {}) => {
  let timer
  const timeout = new Promise((resolve) => {
    timer = timers.setTimeout(() => resolve(TIMED_OUT), ms)
    control.cancel = () => {
      timers.clearTimeout(timer)
      resolve(CANCELLED)
    }
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    timers.clearTimeout(timer)
  }
}

export const GLOBAL_TIMERS = {
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (handle) => clearTimeout(handle),
  setInterval: (...args) => setInterval(...args),
  clearInterval: (handle) => clearInterval(handle),
}
