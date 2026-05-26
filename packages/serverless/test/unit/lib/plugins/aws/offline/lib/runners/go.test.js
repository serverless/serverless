import { spawn as realSpawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Hapi from '@hapi/hapi'
import { createGoRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/go.js'
import { createInvocationQueue } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'
import { registerRuntimeApiRoutes } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/runtime-api-routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fakeBootstrap = path.resolve(
  __dirname,
  '../../../../../../../fixtures/offline/m5d/fake-bootstrap.js',
)

describe('createGoRunner', () => {
  let server
  let queue
  let runtimeApiBase

  const noopLog = {
    debug() {},
    notice() {},
    warning() {},
    error() {},
  }

  /**
   * Build an invoke() args object with sensible defaults. Override fields
   * (functionKey, event, timeoutMs) via the overrides arg.
   *
   * @param {Partial<{ functionKey: string, event: unknown, timeoutMs: number }>} overrides
   */
  function makeInvokeArgs(overrides = {}) {
    const functionKey = overrides.functionKey ?? 'fn1'
    return {
      functionKey,
      handlerPath: '/tmp/src/main',
      handlerName: 'handler',
      event: overrides.event ?? { hello: 'world' },
      context: {
        awsRequestId: 'test-req-id',
        invokedFunctionArn: `arn:aws:lambda:us-east-1:000000000000:function:${functionKey}`,
        memoryLimitInMB: '128',
        timeoutMs: overrides.timeoutMs ?? 5000,
        handler: 'src/main.handler',
        functionName: functionKey,
      },
      environment: overrides.environment ?? {},
      runtime: 'provided.al2',
      timeoutMs: overrides.timeoutMs ?? 5000,
    }
  }

  beforeEach(async () => {
    queue = createInvocationQueue()
    server = Hapi.server({ host: '127.0.0.1', port: 0 })
    registerRuntimeApiRoutes(server, { queue })
    await server.start()
    runtimeApiBase = `http://127.0.0.1:${server.info.port}/runtime`
  })

  afterEach(async () => {
    await server.stop()
  })

  it('invokes a function via the Lambda Runtime API (Node fake bootstrap)', async () => {
    const runner = createGoRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: {
        debug() {},
        notice() {},
        warning() {},
        error() {},
      },
      ensureBuilt: async () => ({
        binaryPath: process.execPath,
        fromCache: true,
      }),
      spawnOverride: (binaryPath, args, opts) =>
        realSpawn(process.execPath, [fakeBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        }),
      servicePath: '/tmp',
    })

    try {
      const result = await runner.invoke({
        functionKey: 'fn1',
        handlerPath: '/tmp/src/main',
        handlerName: 'handler',
        event: { hello: 'world' },
        context: {
          awsRequestId: 'test-req-id',
          invokedFunctionArn:
            'arn:aws:lambda:us-east-1:000000000000:function:fn1',
          memoryLimitInMB: '128',
          timeoutMs: 5000,
          handler: 'src/main.handler',
        },
        environment: {},
        runtime: 'provided.al2',
        timeoutMs: 5000,
      })

      expect(result).toEqual({ ok: true, received: { hello: 'world' } })
    } finally {
      await runner.terminate()
    }
  })

  it('exposes the standard runner shape', () => {
    const runner = createGoRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      ensureBuilt: async () => ({
        binaryPath: '/dev/null/notused',
        fromCache: true,
      }),
      spawnOverride: () => {
        throw new Error('not used in this test')
      },
      servicePath: '/tmp',
    })
    expect(typeof runner.invoke).toBe('function')
    expect(typeof runner.invalidate).toBe('function')
    expect(typeof runner.terminate).toBe('function')
  })

  it('reuses the same bootstrap child across consecutive invokes', async () => {
    const spawnCalls = []
    const runner = createGoRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      ensureBuilt: async () => ({
        binaryPath: process.execPath,
        fromCache: true,
      }),
      spawnOverride: (binaryPath, args, opts) => {
        spawnCalls.push({ binaryPath })
        return realSpawn(process.execPath, [fakeBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        })
      },
      servicePath: '/tmp',
    })

    try {
      const r1 = await runner.invoke(makeInvokeArgs({ event: { n: 1 } }))
      const r2 = await runner.invoke(makeInvokeArgs({ event: { n: 2 } }))
      expect(r1).toEqual({ ok: true, received: { n: 1 } })
      expect(r2).toEqual({ ok: true, received: { n: 2 } })
      // Pool reuse: a single spawn served both invokes.
      expect(spawnCalls).toHaveLength(1)
    } finally {
      await runner.terminate()
    }
  })
})
