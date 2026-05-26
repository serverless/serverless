import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { jest } from '@jest/globals'
import { log } from '@serverless/util'
import { createPythonRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/python.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.resolve(__dirname, '../../__fixtures__/handlers/python')

describe('createPythonRunner — happy path', () => {
  it('invokes a handler and returns its result', async () => {
    const r = createPythonRunner()
    try {
      const result = await r.invoke({
        functionKey: 'echo',
        handlerPath: path.join(FIXTURES, 'sync_echo.py'),
        handlerName: 'handler',
        event: { hello: 'world' },
        context: { name: 'echoFn' },
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
    const r = createPythonRunner()
    expect(typeof r.invoke).toBe('function')
    expect(typeof r.invalidate).toBe('function')
    expect(typeof r.terminate).toBe('function')
  })

  it('drops non-envelope stdout lines (handler print()) and resolves on the envelope', async () => {
    const r = createPythonRunner()
    try {
      const result = await r.invoke({
        functionKey: 'with-print',
        handlerPath: path.join(FIXTURES, 'with_print.py'),
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

describe('createPythonRunner — log forwarding', () => {
  it('forwards handler print() lines to log.get(sls:offline:python)', async () => {
    const logger = log.get('sls:offline:python')
    const noticeSpy = jest.spyOn(logger, 'notice').mockImplementation(() => {})

    const r = createPythonRunner()
    try {
      await r.invoke({
        functionKey: 'with-print',
        handlerPath: path.join(FIXTURES, 'with_print.py'),
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
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-offline-py-'))
    const fixture = path.join(tmp, 'stderr_hello.py')
    await fs.writeFile(
      fixture,
      [
        'import sys',
        'def handler(event, context):',
        '    sys.stderr.write("warn-line\\n")',
        '    sys.stderr.flush()',
        '    return {"ok": True}',
      ].join('\n') + '\n',
    )

    const logger = log.get('sls:offline:python')
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    const r = createPythonRunner()
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
