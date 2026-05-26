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

describe('createRubyRunner — pool + idle eviction', () => {
  let counterFixture
  beforeAll(async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-offline-rb-pool-'))
    counterFixture = path.join(tmp, 'counter.rb')
    await fs.writeFile(
      counterFixture,
      [
        '$n = 0',
        'def handler(event:, context:)',
        '  $n += 1',
        '  { n: $n }',
        'end',
      ].join('\n') + '\n',
    )
  })

  it('reuses the same child process across invocations on the same functionKey', async () => {
    const r = createRubyRunner({ idleEvictionMs: 60_000 })
    try {
      const r1 = await r.invoke({
        functionKey: 'counter',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      const r2 = await r.invoke({
        functionKey: 'counter',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      const r3 = await r.invoke({
        functionKey: 'counter',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      expect(r1).toEqual({ n: 1 })
      expect(r2).toEqual({ n: 2 })
      expect(r3).toEqual({ n: 3 })
    } finally {
      await r.terminate()
    }
  })

  it('evicts the child after idleEvictionMs; next invoke spawns fresh', async () => {
    const r = createRubyRunner({ idleEvictionMs: 100 })
    try {
      const r1 = await r.invoke({
        functionKey: 'counter',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      expect(r1).toEqual({ n: 1 })
      await new Promise((res) => setTimeout(res, 250))
      const r2 = await r.invoke({
        functionKey: 'counter',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      expect(r2).toEqual({ n: 1 })
    } finally {
      await r.terminate()
    }
  })

  it('keeps separate child processes per functionKey', async () => {
    const r = createRubyRunner({ idleEvictionMs: 60_000 })
    try {
      await r.invoke({
        functionKey: 'fnA',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      const a2 = await r.invoke({
        functionKey: 'fnA',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      const b1 = await r.invoke({
        functionKey: 'fnB',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      expect(a2).toEqual({ n: 2 })
      expect(b1).toEqual({ n: 1 })
    } finally {
      await r.terminate()
    }
  })
})
