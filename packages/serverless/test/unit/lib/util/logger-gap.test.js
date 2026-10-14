// `gap()` separates two sections with one blank line, never two: none when the line above is
// blank already, which is also the case under a spinner (it keeps a blank line above itself, and
// the next line printed takes the spinner's place).
import {
  log,
  progress,
  setGlobalRendererSettings,
  getGlobalRendererSettings,
} from '@serverless/util/src/logger/index.js'

let saved
beforeEach(() => {
  saved = getGlobalRendererSettings()
  setGlobalRendererSettings({ isInteractive: false, logLevel: 'notice' })
})
afterEach(() => {
  progress.cleanup()
  setGlobalRendererSettings({
    isInteractive: saved.isInteractive,
    logLevel: saved.logLevel,
  })
})

/** Standard error's writes during `fn`, kept, and counted as a stream counts what it writes. */
const captureStdErr = (fn) => {
  const written = []
  const original = process.stderr.write
  let bytes = 0
  Object.defineProperty(process.stderr, 'bytesWritten', {
    configurable: true,
    get: () => bytes,
  })
  process.stderr.write = (chunk) => {
    written.push(String(chunk))
    bytes += Buffer.byteLength(String(chunk))
    return true
  }
  try {
    fn()
  } finally {
    process.stderr.write = original
    delete process.stderr.bytesWritten
  }
  return written.join('')
}

/** `fn` with stderr a terminal of 80 columns, where the spinner animates. */
const inTerminal = (fn) => {
  const { isTTY, columns, cursorTo, clearLine, moveCursor } = process.stderr
  Object.assign(process.stderr, {
    isTTY: true,
    columns: 80,
    // A terminal's cursor moves, which the spinner uses to redraw its line.
    cursorTo: (x, y, done) => (typeof y === 'function' ? y() : done?.(), true),
    clearLine: (dir, done) => (done?.(), true),
    moveCursor: (dx, dy, done) => (done?.(), true),
  })
  setGlobalRendererSettings({ isInteractive: true })
  try {
    return fn()
  } finally {
    Object.assign(process.stderr, {
      isTTY,
      columns,
      cursorTo,
      clearLine,
      moveCursor,
    })
  }
}

const logger = log.get('gap-test')

test('a gap after a line is one blank line', () => {
  expect(
    captureStdErr(() => {
      logger.notice('first')
      logger.gap()
      logger.notice('second')
    }),
  ).toBe('first\n\nsecond\n')
})

test('a gap after a blank line, or after another gap, prints nothing', () => {
  expect(
    captureStdErr(() => {
      logger.notice('first')
      logger.blankLine()
      logger.gap()
      logger.gap()
      logger.notice('second')
    }),
  ).toBe('first\n\nsecond\n')
})

test('a gap under a spinner prints nothing: the spinner keeps the blank line above itself', () => {
  const written = inTerminal(() =>
    captureStdErr(() => {
      logger.notice('first')
      progress.get('gap-test').notice('Working')
      logger.gap()
      progress.cleanup()
    }),
  )
  // The spinner printed its blank line and drew itself; the gap added no line.
  expect(written.startsWith('first\n\n')).toBe(true)
  expect(written).toContain('Working')
  expect(written.slice('first\n\n'.length)).not.toContain('\n')
})

test('a spinner set to sit right under the lines adds no blank line between them', () => {
  progress.setBlankLineAboveSpinner(false)
  try {
    const written = inTerminal(() =>
      captureStdErr(() => {
        logger.notice('first')
        progress.get('gap-test').notice('Restoring')
        logger.notice('second')
        logger.notice('third')
        progress.cleanup()
      }),
    )
    expect(written).toContain('Restoring')
    // Every line is followed by the next one or the spinner; no line is blank.
    expect(written).not.toMatch(/\n\n/)
    expect(written.startsWith('first\n')).toBe(true)
  } finally {
    progress.setBlankLineAboveSpinner(true)
  }
})
