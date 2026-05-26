import { fileURLToPath } from 'node:url'
import path from 'node:path'
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
