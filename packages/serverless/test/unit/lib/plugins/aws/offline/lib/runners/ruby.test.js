import { jest } from '@jest/globals'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { log } from '@serverless/util'
import { createRubyRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/ruby.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.resolve(__dirname, '../../__fixtures__/handlers/ruby')

describe('createRubyRunner — happy path', () => {
  it('invokes a handler and returns its result', async () => {
    const r = createRubyRunner()
    try {
      const result = await r.invoke({
        functionKey: 'echo',
        handlerPath: path.join(FIXTURES, 'sync_echo.rb'),
        handlerName: 'handler',
        event: { hello: 'world' },
        context: { functionName: 'echoFn' },
      })
      expect(result).toEqual({
        ok: true,
        echo: { hello: 'world' },
        fn: 'echoFn',
      })
    } finally {
      await r.terminate()
    }
  })

  it('exposes the standard runner shape', () => {
    const r = createRubyRunner()
    expect(typeof r.invoke).toBe('function')
    expect(typeof r.invalidate).toBe('function')
    expect(typeof r.terminate).toBe('function')
  })

  it('drops non-envelope stdout lines (handler puts()) and resolves on the envelope', async () => {
    const r = createRubyRunner()
    try {
      const result = await r.invoke({
        functionKey: 'with-puts',
        handlerPath: path.join(FIXTURES, 'with_puts.rb'),
        handlerName: 'handler',
        event: { x: 1 },
        context: {},
      })
      expect(result).toEqual({ got: { x: 1 } })
    } finally {
      await r.terminate()
    }
  })
})

describe('createRubyRunner — log forwarding', () => {
  it('forwards handler puts() lines to log.get(sls:offline:ruby)', async () => {
    const logger = log.get('sls:offline:ruby')
    const noticeSpy = jest.spyOn(logger, 'notice').mockImplementation(() => {})

    const r = createRubyRunner()
    try {
      await r.invoke({
        functionKey: 'with-puts',
        handlerPath: path.join(FIXTURES, 'with_puts.rb'),
        handlerName: 'handler',
        event: { x: 1 },
        context: {},
      })
      const messages = noticeSpy.mock.calls.map((args) => args[0])
      expect(messages).toEqual(
        expect.arrayContaining(['log line A', 'log line B']),
      )
    } finally {
      noticeSpy.mockRestore()
      await r.terminate()
    }
  })

  it('forwards stderr chunks to logger.error', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-offline-rb-'))
    const fixture = path.join(tmp, 'stderr_hello.rb')
    await fs.writeFile(
      fixture,
      [
        'def handler(event:, context:)',
        '  $stderr.puts("warn-line")',
        '  $stderr.flush',
        '  { ok: true }',
        'end',
      ].join('\n') + '\n',
    )

    const logger = log.get('sls:offline:ruby')
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    const r = createRubyRunner()
    try {
      await r.invoke({
        functionKey: 'stderr-hello',
        handlerPath: fixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      const messages = errorSpy.mock.calls.map((args) => args[0])
      expect(messages.some((m) => String(m).includes('warn-line'))).toBe(true)
    } finally {
      errorSpy.mockRestore()
      await r.terminate()
    }
  })
})
