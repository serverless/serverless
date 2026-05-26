import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { jest } from '@jest/globals'
import { log } from '@serverless/util'
import { createPythonRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/python.js'
import ServerlessError from '../../../../../../../../lib/serverless-error.js'

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

describe('createPythonRunner — env injection', () => {
  it('sets AWS_LAMBDA_* env vars on the child process', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-offline-py-env-'))
    const fixture = path.join(tmp, 'env_dump.py')
    await fs.writeFile(
      fixture,
      [
        'import os',
        'def handler(event, context):',
        '    return {',
        '        "name": os.environ.get("AWS_LAMBDA_FUNCTION_NAME"),',
        '        "memory": os.environ.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE"),',
        '        "region": os.environ.get("AWS_REGION"),',
        '        "version": os.environ.get("AWS_LAMBDA_FUNCTION_VERSION"),',
        '    }',
      ].join('\n') + '\n',
    )

    const r = createPythonRunner({ terminateIdleLambdaTime: 60_000 })
    try {
      const result = await r.invoke({
        functionKey: 'env-dump',
        handlerPath: fixture,
        handlerName: 'handler',
        event: {},
        context: {
          functionName: 'envFn',
          memoryLimitInMB: 512,
          region: 'eu-west-1',
        },
      })
      expect(result).toEqual({
        name: 'envFn',
        memory: '512',
        region: 'eu-west-1',
        version: '$LATEST',
      })
    } finally {
      await r.terminate()
    }
  })

  it('merges user environment from args.environment onto lambda env', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-offline-py-env-'))
    const fixture = path.join(tmp, 'env_user.py')
    await fs.writeFile(
      fixture,
      [
        'import os',
        'def handler(event, context):',
        '    return {"DB_HOST": os.environ.get("DB_HOST")}',
      ].join('\n') + '\n',
    )

    const r = createPythonRunner({ terminateIdleLambdaTime: 60_000 })
    try {
      const result = await r.invoke({
        functionKey: 'env-user',
        handlerPath: fixture,
        handlerName: 'handler',
        event: {},
        context: { functionName: 'envFn' },
        environment: { DB_HOST: 'localhost:5432' },
      })
      expect(result).toEqual({ DB_HOST: 'localhost:5432' })
    } finally {
      await r.terminate()
    }
  })
})

describe('createPythonRunner — pool + idle eviction', () => {
  // Use a counter fixture so we can prove the child was reused.
  let counterFixture
  beforeAll(async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sls-offline-py-pool-'))
    counterFixture = path.join(tmp, 'counter.py')
    await fs.writeFile(
      counterFixture,
      [
        'n = 0',
        'def handler(event, context):',
        '    global n',
        '    n += 1',
        '    return {"n": n}',
      ].join('\n') + '\n',
    )
  })

  it('reuses the same child process across invocations on the same functionKey', async () => {
    const r = createPythonRunner({ terminateIdleLambdaTime: 60_000 })
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

  it('evicts the child after terminateIdleLambdaTime; next invoke spawns fresh', async () => {
    const r = createPythonRunner({ terminateIdleLambdaTime: 100 })
    try {
      const r1 = await r.invoke({
        functionKey: 'counter',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      expect(r1).toEqual({ n: 1 })
      // Wait past the eviction window.
      await new Promise((res) => setTimeout(res, 250))
      const r2 = await r.invoke({
        functionKey: 'counter',
        handlerPath: counterFixture,
        handlerName: 'handler',
        event: {},
        context: {},
      })
      // Fresh child → counter resets to 1.
      expect(r2).toEqual({ n: 1 })
    } finally {
      await r.terminate()
    }
  })

  it('keeps separate child processes per functionKey', async () => {
    const r = createPythonRunner({ terminateIdleLambdaTime: 60_000 })
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

describe('createPythonRunner — timeout', () => {
  it('rejects with OFFLINE_HANDLER_TIMEOUT when handler exceeds timeoutMs', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-py-timeout-'),
    )
    const fixture = path.join(tmp, 'slow.py')
    await fs.writeFile(
      fixture,
      [
        'import time',
        'def handler(event, context):',
        '    time.sleep(2)',
        '    return {"ok": True}',
      ].join('\n') + '\n',
    )

    const r = createPythonRunner()
    try {
      const err = await r
        .invoke({
          functionKey: 'slow',
          handlerPath: fixture,
          handlerName: 'handler',
          event: {},
          context: {},
          timeoutMs: 200,
        })
        .catch((e) => e)
      expect(err).toBeInstanceOf(ServerlessError)
      expect(err.code).toBe('OFFLINE_HANDLER_TIMEOUT')
    } finally {
      await r.terminate()
    }
  })

  it('after a timeout, the next invoke spawns a fresh child', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-py-timeout-'),
    )
    const fixture = path.join(tmp, 'sometimes_slow.py')
    await fs.writeFile(
      fixture,
      [
        'import time',
        'n = 0',
        'def handler(event, context):',
        '    global n',
        '    n += 1',
        '    if event.get("slow"):',
        '        time.sleep(2)',
        '    return {"n": n}',
      ].join('\n') + '\n',
    )

    const r = createPythonRunner()
    try {
      const err = await r
        .invoke({
          functionKey: 'sometimes-slow',
          handlerPath: fixture,
          handlerName: 'handler',
          event: { slow: true },
          context: {},
          timeoutMs: 100,
        })
        .catch((e) => e)
      expect(err.code).toBe('OFFLINE_HANDLER_TIMEOUT')

      const ok = await r.invoke({
        functionKey: 'sometimes-slow',
        handlerPath: fixture,
        handlerName: 'handler',
        event: { slow: false },
        context: {},
      })
      expect(ok).toEqual({ n: 1 })
    } finally {
      await r.terminate()
    }
  })
})
