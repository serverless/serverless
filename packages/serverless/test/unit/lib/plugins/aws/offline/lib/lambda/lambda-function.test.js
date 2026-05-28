import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  jest,
} from '@jest/globals'
import { createLambdaFunction } from '../../../../../../../../lib/plugins/aws/offline/lib/lambda/lambda-function.js'

/**
 * Builds a fake serverless object the lambda-function module can read.
 */
function makeServerless(overrides = {}) {
  const {
    servicePath,
    functions = {},
    provider = { region: 'us-east-1' },
    custom = {},
  } = overrides
  return {
    config: { servicePath },
    service: {
      functions,
      provider,
      custom,
    },
  }
}

function makeRunner() {
  const calls = []
  return {
    calls,
    async invoke(args) {
      calls.push(args)
      return { ok: true, args }
    },
  }
}

describe('createLambdaFunction', () => {
  let tmpDir
  let handlerPath

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'lambda-fn-'))
    const srcDir = join(tmpDir, 'src')
    await mkdir(srcDir, { recursive: true })
    handlerPath = join(srcDir, 'handler.js')
    await writeFile(
      handlerPath,
      'export const main = async (event) => ({ ok: true, event })\n',
    )
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('invoke() dispatches to runner with resolved handler path and context', async () => {
    const runner = makeRunner()
    const serverless = makeServerless({
      servicePath: tmpDir,
      functions: {
        hello: { handler: 'src/handler.main', timeout: 9, memorySize: 256 },
      },
      provider: { region: 'us-east-1', environment: { STAGE: 'dev' } },
    })

    const fn = createLambdaFunction({
      serverless,
      functionKey: 'hello',
      runner,
    })

    const result = await fn.invoke({ msg: 'hi' })

    expect(runner.calls).toHaveLength(1)
    const args = runner.calls[0]

    expect(args.functionKey).toBe('hello')
    expect(args.handlerPath).toBe(handlerPath)
    expect(args.handlerName).toBe('main')
    expect(args.event).toEqual({ msg: 'hi' })
    expect(args.timeoutMs).toBe(9000)
    expect(args.environment).toEqual({ STAGE: 'dev' })

    expect(args.context.functionName).toBe('hello')
    expect(args.context.invokedFunctionArn).toBe(
      'arn:aws:lambda:us-east-1:000000000000:function:hello',
    )
    expect(args.context.memoryLimitInMB).toBe('256')
    expect(args.context.callbackWaitsForEmptyEventLoop).toBe(true)
    expect(typeof args.context.awsRequestId).toBe('string')
    expect(args.context.awsRequestId).toMatch(/^[0-9a-f-]{36}$/)
    // The worker reads context.timeoutMs and measures against its own
    // monotonic clock to compute getRemainingTimeInMillis.
    expect(args.context.timeoutMs).toBe(9000)
    expect(args.context.handler).toBe('src/handler.main')

    expect(result).toEqual({ ok: true, args })
  })

  test('functionKey getter exposes the configured key', () => {
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { foo: { handler: 'src/handler.main' } },
      }),
      functionKey: 'foo',
      runner: makeRunner(),
    })
    expect(fn.functionKey).toBe('foo')
  })

  test('defaults memorySize=1024 and timeout=6s when function omits them', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/handler.main' } },
      }),
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})

    expect(runner.calls[0].timeoutMs).toBe(6000)
    expect(runner.calls[0].context.memoryLimitInMB).toBe('1024')
  })

  test('inherits provider memorySize and timeout when function omits them', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/handler.main' } },
        provider: { region: 'us-east-1', memorySize: 512, timeout: 12 },
      }),
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})

    expect(runner.calls[0].timeoutMs).toBe(12000)
    expect(runner.calls[0].context.memoryLimitInMB).toBe('512')
  })

  test('function-level memorySize/timeout override provider', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: {
          hello: { handler: 'src/handler.main', timeout: 30, memorySize: 2048 },
        },
        provider: { region: 'us-east-1', memorySize: 512, timeout: 12 },
      }),
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})

    expect(runner.calls[0].timeoutMs).toBe(30000)
    expect(runner.calls[0].context.memoryLimitInMB).toBe('2048')
  })

  test('merges provider.environment with function.environment (function wins)', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: {
          hello: {
            handler: 'src/handler.main',
            environment: { STAGE: 'override', EXTRA: 'value' },
          },
        },
        provider: {
          region: 'us-east-1',
          environment: { STAGE: 'dev', SHARED: 'shared' },
        },
      }),
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})

    expect(runner.calls[0].environment).toEqual({
      STAGE: 'override',
      SHARED: 'shared',
      EXTRA: 'value',
    })
  })

  test('localEnvironment:false does not copy unrelated host env vars', async () => {
    const runner = makeRunner()
    process.env.OFFLINE_LOCAL_ONLY = 'host-value'
    try {
      const fn = createLambdaFunction({
        serverless: makeServerless({
          servicePath: tmpDir,
          functions: { hello: { handler: 'src/handler.main' } },
        }),
        functionKey: 'hello',
        runner,
      })

      await fn.invoke({})

      expect(runner.calls[0].environment.OFFLINE_LOCAL_ONLY).toBeUndefined()
    } finally {
      delete process.env.OFFLINE_LOCAL_ONLY
    }
  })

  test('localEnvironment:true copies host env vars before provider/function overrides', async () => {
    const runner = makeRunner()
    process.env.OFFLINE_LOCAL_ONLY = 'host-value'
    process.env.SHARED = 'host-shared'
    try {
      const fn = createLambdaFunction({
        serverless: makeServerless({
          servicePath: tmpDir,
          functions: {
            hello: {
              handler: 'src/handler.main',
              environment: { SHARED: 'function-shared' },
            },
          },
          provider: { region: 'us-east-1', environment: { PROVIDER: 'yes' } },
        }),
        functionKey: 'hello',
        runner,
        localEnvironment: true,
      })

      await fn.invoke({})

      expect(runner.calls[0].environment).toMatchObject({
        OFFLINE_LOCAL_ONLY: 'host-value',
        PROVIDER: 'yes',
        SHARED: 'function-shared',
      })
    } finally {
      delete process.env.OFFLINE_LOCAL_ONLY
      delete process.env.SHARED
    }
  })

  test('rejects with descriptive error when function key is unknown', async () => {
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: {},
      }),
      functionKey: 'missing',
      runner: makeRunner(),
    })

    await expect(fn.invoke({})).rejects.toThrow(/Function "missing"/)
  })

  test('reads service config lazily so bundler-swapped paths take effect', async () => {
    const runner = makeRunner()

    const serverless = makeServerless({
      servicePath: '/does-not-exist',
      functions: { hello: { handler: 'src/handler.main' } },
    })

    const fn = createLambdaFunction({
      serverless,
      functionKey: 'hello',
      runner,
    })

    // After the facade is created, swap the service path the way the built-in
    // esbuild plugin does in its before:offline:start hook.
    serverless.config.servicePath = tmpDir

    await fn.invoke({})

    expect(runner.calls[0].handlerPath).toBe(handlerPath)
  })

  test('honours community esbuild custom location instead of servicePath swap', async () => {
    const runner = makeRunner()

    // serverless-esbuild leaves config.servicePath untouched and sets
    // custom['serverless-offline'].location to the bundler output dir.
    const serverless = makeServerless({
      servicePath: '/parent/that/does/not/contain/handler',
      functions: { hello: { handler: 'src/handler.main' } },
      custom: { 'serverless-offline': { location: tmpDir } },
    })

    const fn = createLambdaFunction({
      serverless,
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})

    expect(runner.calls[0].handlerPath).toBe(handlerPath)
  })

  test('falls back to .js path when handler file is absent (lets runner surface ENOENT)', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/missing.handler' } },
      }),
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})

    expect(runner.calls[0].handlerPath).toBe(join(tmpDir, 'src', 'missing.js'))
    expect(runner.calls[0].handlerName).toBe('handler')
  })

  test('emits an execution-trace log line per invocation when a logger is provided', async () => {
    const runner = makeRunner()
    const logger = { notice: jest.fn() }

    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/handler.main' } },
      }),
      functionKey: 'hello',
      runner,
      logger,
    })

    await fn.invoke({})

    expect(logger.notice).toHaveBeenCalledTimes(1)
    const line = logger.notice.mock.calls[0][0]
    expect(line).toMatch(
      /^\(λ: hello\) RequestId: [0-9a-f-]{36}  Duration: \d+\.\d{2} ms  Billed Duration: \d+ ms$/,
    )
  })

  test('emits the trace line even when the handler invocation rejects', async () => {
    const failingRunner = {
      async invoke() {
        throw new Error('handler boom')
      },
    }
    const logger = { notice: jest.fn() }

    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { boom: { handler: 'src/handler.main' } },
      }),
      functionKey: 'boom',
      runner: failingRunner,
      logger,
    })

    await expect(fn.invoke({})).rejects.toThrow('handler boom')
    expect(logger.notice).toHaveBeenCalledTimes(1)
    expect(logger.notice.mock.calls[0][0]).toContain('(λ: boom)')
  })

  test('no logger → no log line, no error', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/handler.main' } },
      }),
      functionKey: 'hello',
      runner,
      // logger intentionally omitted
    })

    await expect(fn.invoke({})).resolves.toBeDefined()
  })

  test('noTimeout:true causes runner.invoke to receive timeoutMs:undefined', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/handler.main', timeout: 30 } },
      }),
      functionKey: 'hello',
      runner,
      noTimeout: true,
    })

    await fn.invoke({})

    expect(runner.calls[0].timeoutMs).toBeUndefined()
  })

  test('noTimeout omitted (default) passes the configured timeoutMs through', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/handler.main', timeout: 30 } },
      }),
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})

    expect(runner.calls[0].timeoutMs).toBe(30_000)
  })

  test('each invocation gets a fresh awsRequestId and the same configured timeoutMs', async () => {
    const runner = makeRunner()
    const fn = createLambdaFunction({
      serverless: makeServerless({
        servicePath: tmpDir,
        functions: { hello: { handler: 'src/handler.main', timeout: 1 } },
      }),
      functionKey: 'hello',
      runner,
    })

    await fn.invoke({})
    await new Promise((r) => setTimeout(r, 5))
    await fn.invoke({})

    expect(runner.calls[0].context.awsRequestId).not.toBe(
      runner.calls[1].context.awsRequestId,
    )
    // timeoutMs is the configured budget — same on every call for the same
    // function definition.
    expect(runner.calls[1].context.timeoutMs).toBe(
      runner.calls[0].context.timeoutMs,
    )
    expect(runner.calls[0].context.timeoutMs).toBe(1000)
  })
})
