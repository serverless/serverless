// The terminal goes away while no spinner shows (a long `serverless dev` session, waiting for
// invocations, whose terminal window is closed): the next spinner cannot put standard input in raw
// mode. It must still show its progress, and no line after it may throw. A file of its own: the
// spinner's stdin handling is shared by the whole process.
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
  terminal = fakeTerminal({ code: 'ENOTTY' })
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

const logger = log.get('terminal-lost-test')

test('a spinner that starts after the terminal went away shows and never throws', () => {
  const main = progress.get('main')
  main.notice('Connecting')
  main.remove()
  logger.notice('Dev Mode on')
  expect(terminal.raw).toBe(false)

  terminal.hangUp()
  expect(() => main.notice('Restoring 2 functions')).not.toThrow()
  expect(() => logger.notice('Restored "hello"')).not.toThrow()
  expect(() => main.notice('Restoring 1 of 2 functions')).not.toThrow()
  expect(() => logger.success('Dev Mode off')).not.toThrow()
  expect(() => main.remove()).not.toThrow()
  // What the CLI prints once the command has ended.
  expect(() => progress.get('state').notice('Saving state')).not.toThrow()
  expect(() => progress.get('main').notice('Finalizing')).not.toThrow()
  expect(() => logger.notice('Done')).not.toThrow()
  expect(() => progress.cleanup()).not.toThrow()

  const written = terminal.written.join('')
  // The spinner drew its text although standard input could not take raw mode.
  expect(written).toContain('Restoring 2 functions')
  expect(written).toContain('Dev Mode off')
  expect(written).toContain('Done')
  // One failed attempt at raw mode, then the spinner leaves standard input alone.
  expect(terminal.modes.filter((mode) => !mode.ok)).toHaveLength(1)
})
