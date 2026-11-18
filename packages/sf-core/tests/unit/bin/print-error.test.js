// The blank lines around the error every command ends with: exactly one before `✖`, in a terminal
// (where a spinner may keep one above itself) and in a pipe, at every log level.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'
import * as logging from '@serverless/util/src/logger/index.js'
import ServerlessError from '@serverless/framework/lib/serverless-error.js'
import ServerlessWebApps from '@serverless/framework/lib/plugins/aws/web-apps/index.js'
import ServerlessSandboxes from '@serverless/framework/lib/plugins/aws/sandboxes/index.js'
import { printError } from '../../../bin/print-error.js'

const {
  getGlobalRendererSettings,
  log,
  progress,
  setGlobalRendererSettings,
  writeText,
} = logging

let saved
beforeEach(() => {
  saved = getGlobalRendererSettings()
})
afterEach(() => {
  progress.cleanup()
  setGlobalRendererSettings({
    isInteractive: saved.isInteractive,
    logLevel: saved.logLevel,
  })
})

const CURSOR = Symbol('cursor to column 0')
const CLEAR = Symbol('clear the line')

/**
 * Runs `fn` with stdout and stderr as one screen: a terminal (both streams TTYs, the spinner
 * animates and redraws its line) or a pipe. Returns the lines the screen shows, without colour.
 */
const screenOf = ({ terminal, level = 'notice', counts = true }, fn) => {
  const events = []
  const streams = [process.stdout, process.stderr]
  const saved = streams.map((stream) => ({
    write: stream.write,
    isTTY: stream.isTTY,
    columns: stream.columns,
    cursorTo: stream.cursorTo,
    clearLine: stream.clearLine,
    moveCursor: stream.moveCursor,
  }))
  for (const stream of streams) {
    // What the stream says it has written, as a socket or a terminal does; a file has no count.
    let written = 0
    Object.defineProperty(stream, 'bytesWritten', {
      configurable: true,
      get: () => (counts ? written : undefined),
    })
    Object.assign(stream, {
      write: (chunk) => {
        events.push(String(chunk))
        written += Buffer.byteLength(String(chunk))
        return true
      },
      isTTY: terminal,
      columns: terminal ? 80 : undefined,
      cursorTo: (x, y, done) => (
        events.push(CURSOR),
        (typeof y === 'function' ? y : done)?.(),
        true
      ),
      clearLine: (dir, done) => (events.push(CLEAR), done?.(), true),
      moveCursor: (dx, dy, done) => (done?.(), true),
    })
  }
  setGlobalRendererSettings({ isInteractive: terminal, logLevel: level })
  try {
    fn()
  } finally {
    streams.forEach((stream, index) => {
      delete stream.bytesWritten
      Object.assign(stream, saved[index])
    })
  }
  const lines = ['']
  for (const event of events) {
    if (event === CURSOR) continue
    if (event === CLEAR) {
      lines[lines.length - 1] = ''
      continue
    }
    // eslint-disable-next-line no-control-regex
    const text = event.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    for (const [index, part] of text.split('\n').entries()) {
      if (index > 0) lines.push('')
      lines[lines.length - 1] += part
    }
  }
  return lines
}

/** The lines from `first` to the error line, inclusive. */
const upToError = (lines, first) => {
  const start = lines.findIndex((line) => line.includes(first))
  const end = lines.findIndex((line) => line.startsWith('✖'))
  return lines.slice(start, end + 1)
}

/** Exactly one blank line above the error line, after a line that is not blank. */
const expectOneBlankBeforeError = (lines) => {
  const end = lines.findIndex((line) => line.startsWith('✖'))
  expect(end).toBeGreaterThan(1)
  expect(lines[end - 1]).toBe('')
  expect(lines[end - 2]).not.toBe('')
}

const logger = log.get('print-error-test')
const failure = () =>
  Object.assign(new Error('boom'), { stack: undefined, code: 'X' })

describe('one blank line before the error', () => {
  test('in a terminal, after a line, while a spinner shows (notice)', () => {
    const lines = screenOf({ terminal: true }, () => {
      logger.notice('Deploying service')
      progress.get('main').notice('Deploying')
      printError(failure())
    })
    expect(upToError(lines, 'Deploying service')).toEqual([
      'Deploying service',
      '',
      '✖ boom',
    ])
  })

  test('in a terminal with --verbose (info), while a spinner shows', () => {
    const lines = screenOf({ terminal: true, level: 'info' }, () => {
      logger.info('Deploying service')
      progress.get('main').notice('Deploying')
      printError(failure())
    })
    expect(upToError(lines, 'Deploying service')).toEqual([
      'Deploying service',
      '',
      '✖ boom',
    ])
  })

  test('in a terminal, after text on standard output under a spinner', () => {
    const lines = screenOf({ terminal: true }, () => {
      progress.get('main').notice('Deploying')
      writeText('endpoint: https://example.com')
      printError(failure())
    })
    expect(upToError(lines, 'endpoint:')).toEqual([
      'endpoint: https://example.com',
      '',
      '✖ boom',
    ])
  })

  test('in a terminal, after the table a refused Dev Mode session prints', () => {
    const lines = screenOf({ terminal: true }, () => {
      logger.notice(
        'Function  Mode     Why\napi       skipped  in Dev Mode in another session of yours',
      )
      progress.get('main').notice('Finalizing')
      printError(failure())
    })
    expect(upToError(lines, 'Function')).toEqual([
      'Function  Mode     Why',
      'api       skipped  in Dev Mode in another session of yours',
      '',
      '✖ boom',
    ])
  })

  test('in a terminal, after a section that ended with a blank line', () => {
    const lines = screenOf({ terminal: true }, () => {
      logger.notice('Function  Mode  Why')
      logger.blankLine()
      progress.get('main').notice('Finalizing')
      printError(failure())
    })
    expect(upToError(lines, 'Function')).toEqual([
      'Function  Mode  Why',
      '',
      '✖ boom',
    ])
  })

  test('in a terminal, as the first output: the CLI started with a blank line, or not (--json)', () => {
    const started = screenOf({ terminal: true }, () => {
      process.stdout.write('\n')
      logging.noteStartupBlankLine(true)
      progress.get('main').notice('Initializing')
      printError(failure())
    })
    expect(started.slice(0, 2)).toEqual(['', '✖ boom'])
    const json = screenOf({ terminal: true }, () => {
      process.stdout.write('{"v":1}\n')
      logging.noteStartupBlankLine(false)
      printError(failure())
    })
    expect(json.slice(0, 3)).toEqual(['{"v":1}', '', '✖ boom'])
  })

  test('in a terminal, after a partial line written straight to standard output under a spinner', () => {
    const lines = screenOf({ terminal: true }, () => {
      logger.notice('Invoking')
      progress.get('main').notice('Invoking')
      progress.get('main').remove()
      process.stdout.write('partial agent answer')
      printError(failure())
    })
    // The error starts a line of its own, as it always has.
    expect(upToError(lines, 'Invoking')).toEqual([
      'Invoking',
      '',
      'partial agent answer',
      '✖ boom',
    ])
  })

  test('in a terminal, after full lines written straight to standard output (console.log)', () => {
    const lines = screenOf({ terminal: true }, () => {
      logger.notice('Comparing')
      progress.get('main').notice('Comparing')
      progress.get('main').remove()
      process.stdout.write('- old line\n+ new line\n')
      printError(failure())
    })
    expect(upToError(lines, 'Comparing')).toEqual([
      'Comparing',
      '',
      '- old line',
      '+ new line',
      '',
      '✖ boom',
    ])
  })

  test('in a terminal, after a line written straight to standard error (console.error)', () => {
    const lines = screenOf({ terminal: true }, () => {
      logger.notice('Packaging')
      progress.get('main').notice('Packaging')
      progress.get('main').remove()
      process.stderr.write('plugin warning: something to know\n')
      printError(failure())
    })
    expect(upToError(lines, 'Packaging')).toEqual([
      'Packaging',
      '',
      'plugin warning: something to know',
      '',
      '✖ boom',
    ])
  })

  test('where standard output keeps no count (a file), the blank line is always printed', () => {
    const lines = screenOf({ terminal: true, counts: false }, () => {
      logger.notice('Deploying service')
      progress.get('main').notice('Deploying')
      printError(failure())
    })
    // The spinner's blank line, then the error's own: nothing tells that no output came between.
    expect(upToError(lines, 'Deploying service')).toEqual([
      'Deploying service',
      '',
      '',
      '✖ boom',
    ])
  })

  test.each(['notice', 'info', 'debug'])(
    'in a pipe at the %s level',
    (level) => {
      const lines = screenOf({ terminal: false, level }, () => {
        logger.notice('Deploying service')
        progress.get('main').notice('Deploying')
        printError(failure())
      })
      expectOneBlankBeforeError(lines)
    },
  )

  test('in a pipe, after a blank line, no second one', () => {
    const lines = screenOf({ terminal: false }, () => {
      logger.notice('Function  Mode  Why')
      logger.blankLine()
      printError(failure())
    })
    expect(upToError(lines, 'Function')).toEqual([
      'Function  Mode  Why',
      '',
      '✖ boom',
    ])
  })

  test('in a terminal at the debug level, where no spinner animates', () => {
    const lines = screenOf({ terminal: true, level: 'debug' }, () => {
      logger.notice('Deploying service')
      progress.get('main').notice('Deploying')
      printError(failure())
    })
    expectOneBlankBeforeError(lines)
  })
})

// A configuration error says what to fix: it prints as its message alone, the way a user expects a
// config error. An unexpected error keeps its stack trace and the help block, to stay diagnosable.
describe('configuration errors print as one line', () => {
  const serverlessWith = (config) => ({
    serviceDir: '/svc',
    configurationInput: config,
    service: { service: 'svc', provider: {}, ...config },
    getProvider: () => ({
      getStage: () => 'dev',
      getRegion: () => 'us-east-1',
    }),
    configSchemaHandler: { defineTopLevelProperty: jest.fn() },
    classes: { Error: ServerlessError },
  })

  const thrownBy = (fn) => {
    try {
      fn()
    } catch (error) {
      return error
    }
    throw new Error('expected an error')
  }

  const printed = (error) =>
    screenOf({ terminal: false }, () => printError(error)).filter(Boolean)

  test('a web app validation error', () => {
    const serverless = serverlessWith({
      webApps: { api: { entry: 'src/server.js', runtime: 'nodejs22.x' } },
    })
    const plugin = new ServerlessWebApps(serverless, {}, { log: {} })
    const error = thrownBy(() => plugin.validate())
    expect(error.code).toBe('WEB_APPS_VALIDATION_ERROR')
    expect(printed(error)).toEqual([
      '✖ webApps.api.runtime must be nodejs24.x or newer (nodejsNN.x).',
    ])
  })

  test('a sandbox validation error', () => {
    const serverless = serverlessWith({
      sandboxes: { worker: { artifact: './app', minimumMemory: 3000 } },
    })
    const plugin = new ServerlessSandboxes(serverless, {}, { log: {} })
    const error = thrownBy(() => plugin.validate())
    expect(error.code).toBe('SANDBOXES_VALIDATION_ERROR')
    expect(printed(error)).toEqual([
      '✖ sandboxes.worker.minimumMemory must be one of 512, 1024, 2048, 4096, 8192 MiB',
    ])
  })

  test('an unexpected error keeps its stack trace and the help block', () => {
    const lines = printed(new TypeError('x is not a function'))
    expect(lines[0]).toBe('✖ TypeError: x is not a function')
    expect(lines.some((line) => line.trimStart().startsWith('at '))).toBe(true)
    expect(lines).toContain('For help, try the following:')
  })
})
