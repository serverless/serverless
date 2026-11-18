// The terminal goes away while the spinner spins (a long `serverless dev` session whose terminal
// window is closed): the spinner can no longer put standard input back in its normal mode. Output
// must go on without throwing, for every line that follows, and the spinner must stop touching
// standard input. A file of its own: the spinner's stdin handling is shared by the whole process.
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
  terminal = fakeTerminal({ code: 'EIO' })
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

test('lines and progress after the terminal went away never throw', () => {
  const main = progress.get('main')
  main.notice('Dev Mode on')
  // The spinner took standard input in raw mode.
  expect(terminal.raw).toBe(true)

  terminal.hangUp()
  // Every line stops the spinner (which puts the terminal back in its normal mode) and starts it
  // again.
  expect(() => logger.notice('Restoring 2 functions')).not.toThrow()
  expect(() => main.notice('Restoring 1 of 2 functions')).not.toThrow()
  expect(() => logger.success('Dev Mode off')).not.toThrow()
  expect(() => main.remove()).not.toThrow()
  // What the CLI prints once the command has ended.
  expect(() => progress.get('state').notice('Saving state')).not.toThrow()
  expect(() => progress.get('main').notice('Finalizing')).not.toThrow()
  expect(() => logger.notice('Done')).not.toThrow()
  expect(() => progress.cleanup()).not.toThrow()

  const written = terminal.written.join('')
  expect(written).toContain('Restoring 2 functions')
  expect(written).toContain('Dev Mode off')
  expect(written).toContain('Done')
  // One failed attempt to put the terminal back, then the spinner leaves standard input alone.
  expect(terminal.modes.filter((mode) => !mode.ok)).toHaveLength(1)
})
