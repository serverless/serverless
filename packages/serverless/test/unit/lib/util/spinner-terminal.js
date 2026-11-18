// A terminal for the CLI's spinner that can go away: stderr animates, and standard input takes raw
// mode until `hangUp()`, after which every change of its mode fails the way a terminal that was
// closed fails it (EIO on Linux, ENOTTY on macOS): Node reports that failure as an 'error' event on
// standard input, with `code`, `errno` and `syscall` set and the message `setRawMode <code>`, and the
// event throws that error when nothing listens. `failNextModeChange(error)` makes the next change
// of mode throw `error` instead, as any other failure would. The tests run it as a Unix terminal on
// every platform: on Windows the spinner's stdin handling never puts standard input in raw mode,
// but it still takes it out of raw mode when the spinner stops.
import { constants } from 'node:os'
import { setGlobalRendererSettings } from '@serverless/util/src/logger/index.js'

const STDERR_KEYS = [
  'isTTY',
  'columns',
  'cursorTo',
  'clearLine',
  'moveCursor',
  'write',
]
const STDIN_KEYS = ['isTTY', 'setRawMode', 'resume', 'pause']

const saveOwn = (target, keys) =>
  keys.map((key) => [key, Object.getOwnPropertyDescriptor(target, key)])

const restoreOwn = (target, saved) => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(target, key, descriptor)
    else delete target[key]
  }
}

export const fakeTerminal = ({ code = 'ENOTTY' } = {}) => {
  const savedStderr = saveOwn(process.stderr, STDERR_KEYS)
  const savedStdin = saveOwn(process.stdin, STDIN_KEYS)
  const savedProcess = saveOwn(process, ['platform'])
  const terminal = {
    written: [],
    hungUp: false,
    raw: false,
    // Every mode change asked for, with whether it took.
    modes: [],
    hangUp: () => {
      terminal.hungUp = true
    },
    failNextModeChange: (error) => {
      terminal.nextFailure = error
    },
  }
  const define = (target, key, value) =>
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value,
    })
  define(process.stderr, 'isTTY', true)
  define(process.stderr, 'columns', 80)
  define(process.stderr, 'cursorTo', (x, y, done) =>
    typeof y === 'function' ? y() : done?.(),
  )
  define(process.stderr, 'clearLine', (dir, done) => done?.())
  define(process.stderr, 'moveCursor', (dx, dy, done) => done?.())
  define(process.stderr, 'write', (chunk) => {
    terminal.written.push(String(chunk))
    return true
  })
  if (process.platform === 'win32') define(process, 'platform', 'linux')
  define(process.stdin, 'isTTY', true)
  define(process.stdin, 'resume', () => process.stdin)
  define(process.stdin, 'pause', () => process.stdin)
  define(process.stdin, 'setRawMode', (flag) => {
    if (terminal.nextFailure) {
      const error = terminal.nextFailure
      terminal.nextFailure = undefined
      terminal.modes.push({ raw: Boolean(flag), ok: false })
      throw error
    }
    if (terminal.hungUp && Boolean(flag) !== terminal.raw) {
      terminal.modes.push({ raw: Boolean(flag), ok: false })
      const error = new Error(`setRawMode ${code}`)
      error.errno = -constants.errno[code]
      error.code = code
      error.syscall = 'setRawMode'
      // Node's own error throws from the 'error' event as it is. This one is made in the test's
      // context, where emitting it with no listener would throw a wrapper of it instead.
      if (process.stdin.listenerCount('error') === 0) throw error
      process.stdin.emit('error', error)
      return process.stdin
    }
    terminal.modes.push({ raw: Boolean(flag), ok: true })
    terminal.raw = Boolean(flag)
    return process.stdin
  })
  setGlobalRendererSettings({ isInteractive: true, logLevel: 'notice' })
  terminal.restore = () => {
    restoreOwn(process.stderr, savedStderr)
    restoreOwn(process.stdin, savedStdin)
    restoreOwn(process, savedProcess)
  }
  return terminal
}
