/**
 * Single keys for a person at a terminal while Dev Mode is on. h or ? lists them; r rebuilds and
 * restarts the handler processes; v shows or hides invocation details (events and responses); s
 * shows the session's state in two lines; q restores and exits like the first
 * Ctrl+C. Keys are read in raw mode, so Ctrl+C arrives as a key: it is passed on as the SIGINT it
 * would have been, and the stop goes the same two-stage way. The terminal's mode is put back when
 * the keys stop (the session stops them when its stop begins), at exit, and after a crash.
 */
import readline from 'readline'
import {
  functionsWord,
  restoresWhat,
  timestampAgo,
  webAppsWord,
} from '../attach/output.js'
import { statusModeTable, statusTableWorthShowing } from '../commands/status.js'

export const KEYS_HINT =
  'Press h for keys, Ctrl+C or q to restore your functions and exit.'
/** KEYS_HINT for a session that also (or only) runs web apps (output.js restoresWhat). */
export const keysHint = (what) =>
  `Press h for keys, Ctrl+C or q to restore ${restoresWhat(what)} and exit.`
export const KEY_HELP = 'Keys: r rebuild · v details · s status · q quit'
export const DETAILED_ON = 'Details on'
export const DETAILED_OFF = 'Details off'

/**
 * Keys only for a person at a terminal, not with --no-keys. `isInteractive` is the CLI's own rule
 * (`logger.isInteractive()`: not in CI, not for an AI agent unless SLS_INTERACTIVE_SETUP_ENABLE is
 * set, a terminal on both ends); the keys also need standard input to be a terminal they can put in
 * raw mode.
 */
export const hotkeysEnabled = ({ options = {}, stdin, isInteractive }) =>
  options.keys !== false &&
  !options['session-process'] &&
  Boolean(isInteractive) &&
  Boolean(stdin?.isTTY) &&
  typeof stdin.setRawMode === 'function'

const KEYS = {
  h: 'help',
  '?': 'help',
  r: 'reload',
  v: 'detailed',
  s: 'status',
  q: 'quit',
}

/**
 * Reads keys from `stdin` in raw mode and runs `actions[name]` for each; an action that throws or
 * rejects is a debug line. Returns `{ close() }`, which puts the terminal back (idempotent).
 */
export const startHotkeys = ({
  stdin,
  processRef = process,
  actions,
  logger,
}) => {
  readline.emitKeypressEvents(stdin)
  let closed = false
  const run = (name) => {
    const fail = (error) =>
      logger.debug(
        `Dev Mode could not run the ${name} key: ${error?.message ?? error}`,
      )
    try {
      const result = actions[name]?.()
      if (typeof result?.then === 'function') result.then(undefined, fail)
    } catch (error) {
      fail(error)
    }
  }
  const onKeypress = (text, key = {}) => {
    if (closed) return
    if (key.ctrl && key.name === 'c') {
      run('interrupt')
      return
    }
    if (key.ctrl || key.meta) return
    // A shifted letter has its name in lower case; `?` has no name, only its text.
    const name = KEYS[(key.name ?? text ?? '').toLowerCase()] ?? KEYS[text]
    if (name) run(name)
  }
  const restore = () => {
    try {
      stdin.setRawMode(false)
    } catch {
      // The terminal is gone.
    }
  }
  stdin.setRawMode(true)
  stdin.on('keypress', onKeypress)
  stdin.resume()
  processRef.once('exit', restore)
  return {
    /**
     * Takes the terminal back after a spinner: the CLI's spinner reads standard input in raw mode
     * while it spins and, when it stops, pauses it and puts the terminal back in its normal mode.
     */
    reclaim() {
      if (closed) return
      try {
        stdin.setRawMode(true)
        stdin.resume()
      } catch {
        // The terminal is gone.
      }
    },
    close() {
      if (closed) return
      closed = true
      stdin.off('keypress', onKeypress)
      restore()
      // A paused stdin no longer keeps the process alive.
      stdin.pause()
      processRef.off('exit', restore)
    },
  }
}

/** The web apps of a status result in the s key's summary: `2 web apps`, or `1 of 2 web apps`. */
const webAppsCount = (webApps) => {
  const running = webApps.filter(
    (webApp) => webApp.mode === 'dev' || webApp.mode === 'local',
  ).length
  return running === webApps.length
    ? webAppsWord(running)
    : `${running} of ${webAppsWord(webApps.length)}`
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * What the s key shows, as `[summary, details, table]`: the session in one line, the functions
 * with a handler process and the last invocation in the second (relative to `nowMs`), and the
 * function table only when some function does not run here, or runs here with a reason (one the
 * session lost that still points at Dev Mode; null otherwise).
 */
export const statusKeyLines = ({
  status,
  workers = [],
  nowMs = Date.now(),
}) => {
  const functions = status.functions ?? []
  const webApps = status.web_apps ?? []
  const { total = 0, errors = 0 } = status.invocations ?? {}
  const requests = status.requests ?? { total: 0, failed: 0 }
  const devCount = functions.filter((fn) => fn.mode === 'dev').length
  const last = status.last_invocation
  const lastRequest = status.last_request
  // A session of web apps alone names no invocations and no handler processes.
  const withFunctions = functions.length > 0 || !webApps.length
  const warm = [...new Set(workers.map((worker) => worker.functionKey))]
  const summary = [
    `Dev Mode ${status.state ?? 'on'}`,
    // The service first, so two terminals tell their sessions apart. A session that could not
    // write its record has neither in its status.
    ...(status.service ? [status.service] : []),
    ...(status.stage ? [status.stage] : []),
    ...(functions.length || !webApps.length
      ? [
          devCount === functions.length
            ? functionsWord(devCount)
            : `${devCount} of ${functionsWord(functions.length)}`,
        ]
      : []),
    ...(webApps.length ? [webAppsCount(webApps)] : []),
    ...(withFunctions
      ? [
          `${plural(total, 'invocation')}, ${errors ? plural(errors, 'error') : 'no errors'}`,
        ]
      : []),
    ...(webApps.length
      ? [
          `${plural(requests.total, 'web request')}${requests.failed ? ` (${requests.failed} not ok)` : ''}`,
        ]
      : []),
  ].join(' · ')
  const agoOf = (item) => {
    const ago = item ? timestampAgo(item.ts, nowMs) : null
    return ago ? `, ${ago}` : ''
  }
  const details = `  ${[
    ...(withFunctions
      ? [
          `warm: ${warm.length ? warm.join(', ') : 'none'}`,
          `last: ${last ? `${last.function} ${last.outcome}${agoOf(last)}` : 'none yet'}`,
        ]
      : []),
    ...(webApps.length
      ? [
          `last request: ${lastRequest ? `${lastRequest.web_app} ${lastRequest.outcome}${agoOf(lastRequest)}` : 'none yet'}`,
        ]
      : []),
  ].join(' · ')}`
  const table = statusTableWorthShowing(functions, webApps)
    ? statusModeTable(functions, webApps)
    : null
  return [summary, details, table]
}
