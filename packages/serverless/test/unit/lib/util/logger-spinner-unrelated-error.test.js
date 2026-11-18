// A failure of the spinner's stdin handling that does not come from a terminal that went away (a
// plain error, with no `syscall`) is not the spinner's to recover from: it reaches the caller, and
// a spinner that starts after it still reads standard input. A file of its own: the spinner's stdin
// handling is shared by the whole process.
import {
  log,
  progress,
  getGlobalRendererSettings,
  setGlobalRendererSettings,
} from '@serverless/util/src/logger/index.js'
import { fakeTerminal } from './spinner-terminal.js'

let saved
let terminal
beforeEach(() => {
  saved = getGlobalRendererSettings()
  terminal = fakeTerminal()
})
afterEach(() => {
  try {
    progress.cleanup()
  } finally {
    terminal.restore()
    setGlobalRendererSettings({
      isInteractive: saved.isInteractive,
      logLevel: saved.logLevel,
    })
  }
})

const logger = log.get('unrelated-error-test')

test('an unrelated error while the spinner starts is thrown, and the next spinner still takes raw mode', () => {
  const main = progress.get('main')
  main.notice('Connecting')
  main.remove()
  expect(terminal.raw).toBe(false)

  terminal.failNextModeChange(new Error('boom'))
  expect(() => main.notice('Deploying')).toThrow('boom')

  expect(() => logger.notice('Deployed')).not.toThrow()
  expect(terminal.written.join('')).toContain('Deployed')
  // The spinner restarted after the line still puts standard input in raw mode.
  expect(terminal.raw).toBe(true)
  expect(terminal.modes.at(-1)).toEqual({ raw: true, ok: true })
})

// Runs after the test above: once a stop failed, the spinner's stdin handling is left half-way for
// the rest of the process.
test('an unrelated error while the spinner stops is thrown', () => {
  const main = progress.get('main')
  main.notice('Deploying')
  expect(terminal.raw).toBe(true)

  terminal.failNextModeChange(new Error('boom'))
  expect(() => logger.notice('Deployed')).toThrow('boom')
})
