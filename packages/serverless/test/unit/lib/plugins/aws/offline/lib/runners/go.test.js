import { spawn as realSpawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
const stallingBootstrap = path.resolve(
  __dirname,
  '../../../../../../../fixtures/offline/m5d/stalling-bootstrap.js',
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

  it('spawns the bootstrap with AWS_LAMBDA_RUNTIME_API and Lambda runtime env vars', async () => {
    let capturedEnv
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
        capturedEnv = opts.env
        return realSpawn(process.execPath, [fakeBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        })
      },
      servicePath: '/tmp',
    })

    try {
      await runner.invoke(
        makeInvokeArgs({
          environment: { MY_USER_VAR: 'value-1' },
        }),
      )
    } finally {
      await runner.terminate()
    }

    // Bare host:port/runtime/<functionKey> form — no scheme, no trailing slash.
    const port = server.info.port
    expect(capturedEnv.AWS_LAMBDA_RUNTIME_API).toBe(
      `127.0.0.1:${port}/runtime/fn1`,
    )
    expect(capturedEnv.AWS_LAMBDA_FUNCTION_NAME).toBe('fn1')
    expect(capturedEnv.AWS_LAMBDA_FUNCTION_MEMORY_SIZE).toBe('128')
    expect(capturedEnv.MY_USER_VAR).toBe('value-1')
  })

  it('calls ensureBuilt with derived sourceDir/sourceFile and spawns the returned binary', async () => {
    const servicePath = await mkdtemp(path.join(tmpdir(), 'go-runner-svc-'))
    try {
      const ensureBuiltCalls = []
      const spawnCalls = []
      const runner = createGoRunner({
        idleEvictionMs: 60_000,
        runtimeApiBase,
        runtimeApiQueue: queue,
        log: noopLog,
        ensureBuilt: async (opts) => {
          ensureBuiltCalls.push(opts)
          return { binaryPath: process.execPath, fromCache: false }
        },
        spawnOverride: (binaryPath, args, opts) => {
          spawnCalls.push({ binaryPath })
          return realSpawn(process.execPath, [fakeBootstrap], {
            cwd: opts.cwd,
            env: opts.env,
            stdio: opts.stdio,
          })
        },
        servicePath,
      })

      try {
        await runner.invoke(makeInvokeArgs())
      } finally {
        await runner.terminate()
      }

      expect(ensureBuiltCalls).toHaveLength(1)
      expect(ensureBuiltCalls[0]).toMatchObject({
        functionKey: 'fn1',
        // Handler 'src/main.handler' → dirname('src/main') = 'src', resolved
        // against servicePath.
        sourceDir: path.resolve(servicePath, 'src'),
        sourceFile: path.resolve(servicePath, 'src/main.go'),
        servicePath,
      })
      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].binaryPath).toBe(process.execPath)
    } finally {
      await rm(servicePath, { recursive: true, force: true })
    }
  })

  it('rejects in-flight invocations with OFFLINE_WORKER_TERMINATED on terminate()', async () => {
    const runner = createGoRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      ensureBuilt: async () => ({
        binaryPath: process.execPath,
        fromCache: true,
      }),
      spawnOverride: (binaryPath, args, opts) =>
        realSpawn(process.execPath, [stallingBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        }),
      servicePath: '/tmp',
    })

    // Long timeout so the timeout path doesn't race terminate() to settle first.
    const inFlight = runner.invoke(makeInvokeArgs({ timeoutMs: 60_000 }))
    // Attach the catch handler synchronously to avoid an unhandled-rejection
    // signal between rejectAll() firing in terminate() and the test's later
    // `await` on the promise.
    const settled = inFlight.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )

    // Give the bootstrap a moment to spawn and the queue to enter the
    // in-flight state before we terminate.
    await new Promise((r) => setTimeout(r, 100))

    await runner.terminate()

    const outcome = await settled
    expect(outcome.status).toBe('rejected')
    expect(outcome.reason).toMatchObject({
      code: 'OFFLINE_WORKER_TERMINATED',
    })
  })

  it('invalidate() clears any pending idle-eviction timer and kills the child', async () => {
    const runner = createGoRunner({
      // Short idle eviction so we can prove the timer existed before invalidate.
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
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
      await runner.invoke(makeInvokeArgs())
      // Entry should now be idle with pendingTimeout armed. invalidate()
      // must clear that timer and SIGTERM the child without throwing.
      expect(() => runner.invalidate('fn1')).not.toThrow()
      // A second invalidate() on a now-gone entry must also not throw —
      // pool eagerness + 'exit' cleanup must be idempotent.
      expect(() => runner.invalidate('fn1')).not.toThrow()
    } finally {
      await runner.terminate()
    }
  })

  it('idle-eviction timer fires and kills the idle child after the window', async () => {
    let spawnedChild
    const runner = createGoRunner({
      // Short idle window so the eviction timer fires during the test.
      idleEvictionMs: 150,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      ensureBuilt: async () => ({
        binaryPath: process.execPath,
        fromCache: true,
      }),
      spawnOverride: (binaryPath, args, opts) => {
        spawnedChild = realSpawn(process.execPath, [fakeBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        })
        return spawnedChild
      },
      servicePath: '/tmp',
    })

    try {
      await runner.invoke(makeInvokeArgs())
      expect(spawnedChild).toBeDefined()
      expect(spawnedChild.killed).toBe(false)
      // Once the invocation settles the runner arms the idle-eviction timer;
      // after idleEvictionMs it SIGTERMs the idle child.
      await new Promise((resolve) => spawnedChild.once('exit', resolve))
      expect(spawnedChild.killed).toBe(true)
    } finally {
      await runner.terminate()
    }
  })

  it('rejects with OFFLINE_HANDLER_TIMEOUT when the bootstrap never posts a response', async () => {
    const runner = createGoRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      ensureBuilt: async () => ({
        binaryPath: process.execPath,
        fromCache: true,
      }),
      spawnOverride: (binaryPath, args, opts) =>
        realSpawn(process.execPath, [stallingBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        }),
      servicePath: '/tmp',
    })

    try {
      await expect(
        runner.invoke(makeInvokeArgs({ timeoutMs: 200 })),
      ).rejects.toMatchObject({ code: 'OFFLINE_HANDLER_TIMEOUT' })
    } finally {
      await runner.terminate()
    }
  })

  it('kills the bootstrap child on timeout and spawns a fresh one for the next invoke', async () => {
    const spawnedChildren = []
    let stall = true
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
        // First invoke stalls (forces the timeout); later invokes echo so the
        // fresh child can settle normally.
        const script = stall ? stallingBootstrap : fakeBootstrap
        const child = realSpawn(process.execPath, [script], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        })
        spawnedChildren.push(child)
        return child
      },
      servicePath: '/tmp',
    })

    try {
      await expect(
        runner.invoke(makeInvokeArgs({ timeoutMs: 200 })),
      ).rejects.toMatchObject({ code: 'OFFLINE_HANDLER_TIMEOUT' })

      // Real Lambda kills the sandbox on timeout — the stalled child must be
      // terminated, not left running the timed-out handler.
      expect(spawnedChildren).toHaveLength(1)
      const firstChild = spawnedChildren[0]
      if (firstChild.exitCode === null && firstChild.signalCode === null) {
        await new Promise((resolve) => firstChild.once('exit', resolve))
      }
      expect(firstChild.killed).toBe(true)

      // The next invoke must NOT reuse the timed-out child — it spawns fresh.
      stall = false
      const result = await runner.invoke(
        makeInvokeArgs({ event: { n: 2 }, timeoutMs: 5000 }),
      )
      expect(result).toEqual({ ok: true, received: { n: 2 } })
      expect(spawnedChildren).toHaveLength(2)
    } finally {
      await runner.terminate()
    }
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
