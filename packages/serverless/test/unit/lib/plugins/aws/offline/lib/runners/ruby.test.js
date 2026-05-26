import { fileURLToPath } from 'node:url'
import path from 'node:path'
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
