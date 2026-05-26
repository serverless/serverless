import { spawn as realSpawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Hapi from '@hapi/hapi'

import { createJavaRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/java.js'
import { createInvocationQueue } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'
import { registerRuntimeApiRoutes } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/runtime-api-routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fakeBootstrap = path.resolve(
  __dirname,
  '../../../../../../../fixtures/offline/m5e/fake-bootstrap.js',
)
const stallingBootstrap = path.resolve(
  __dirname,
  '../../../../../../../fixtures/offline/m5e/stalling-bootstrap.js',
)

describe('createJavaRunner', () => {
  let server
  let queue
  let runtimeApiBase

  const noopLog = {
    debug() {},
    notice() {},
    warning() {},
    error() {},
  }

  function makeInvokeArgs(overrides = {}) {
    const functionKey = overrides.functionKey ?? 'fn1'
    return {
      functionKey,
      handlerPath: '/unused/for-java/path',
      handlerName: 'unused',
      artifactPath: overrides.artifactPath ?? process.execPath,
      event: overrides.event ?? { hello: 'world' },
      context: {
        awsRequestId: 'test-req-id',
        invokedFunctionArn: `arn:aws:lambda:us-east-1:000000000000:function:${functionKey}`,
        memoryLimitInMB: '512',
        timeoutMs: overrides.timeoutMs ?? 5000,
        handler: 'com.example.Hello::handleRequest',
        functionName: functionKey,
      },
      environment: overrides.environment ?? {},
      runtime: 'java21',
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

  it('invokes a Java function via the Lambda Runtime API (Node fake bootstrap)', async () => {
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      resolveClasspath: async () => ({
        classpath: '/unused/cp',
        artifactPath: '/unused/cp',
        ricJarPath: '/unused/ric.jar',
      }),
      checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
      spawnOverride: (cmd, args, opts) =>
        realSpawn(process.execPath, [fakeBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        }),
      servicePath: '/tmp',
    })

    try {
      const result = await runner.invoke(makeInvokeArgs())
      expect(result).toMatchObject({
        ok: true,
        received: { hello: 'world' },
        handler: 'com.example.Hello::handleRequest',
      })
    } finally {
      await runner.terminate()
    }
  })

  it('exposes the standard runner shape', () => {
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      resolveClasspath: async () => ({
        classpath: '/unused',
        artifactPath: '/unused',
        ricJarPath: '/unused',
      }),
      checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
      spawnOverride: () => {
        throw new Error('not used in this test')
      },
      servicePath: '/tmp',
    })
    expect(typeof runner.invoke).toBe('function')
    expect(typeof runner.invalidate).toBe('function')
    expect(typeof runner.terminate).toBe('function')
  })

  it('spawns the JVM with AWS_LAMBDA_RUNTIME_API, _HANDLER, and Lambda runtime env vars', async () => {
    let capturedEnv
    let capturedArgs
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      resolveClasspath: async () => ({
        classpath: '/u/a.jar:/u/ric.jar',
        artifactPath: '/u/a.jar',
        ricJarPath: '/u/ric.jar',
      }),
      checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
      spawnOverride: (cmd, args, opts) => {
        capturedEnv = opts.env
        capturedArgs = args
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

    const port = server.info.port
    // Bare host:port/runtime/<functionKey> form — no scheme, no trailing slash.
    expect(capturedEnv.AWS_LAMBDA_RUNTIME_API).toBe(
      `127.0.0.1:${port}/runtime/fn1`,
    )
    expect(capturedEnv._HANDLER).toBe('com.example.Hello::handleRequest')
    expect(capturedEnv.AWS_LAMBDA_FUNCTION_NAME).toBe('fn1')
    expect(capturedEnv.AWS_LAMBDA_FUNCTION_MEMORY_SIZE).toBe('512')
    expect(capturedEnv.MY_USER_VAR).toBe('value-1')

    // Args ordering: -cp + classpath + RIC main + handler string trailing.
    expect(capturedArgs).toContain('-cp')
    const cpIndex = capturedArgs.indexOf('-cp')
    expect(capturedArgs[cpIndex + 1]).toBe('/u/a.jar:/u/ric.jar')
    expect(capturedArgs[cpIndex + 2]).toBe(
      'com.amazonaws.services.lambda.runtime.api.client.AWSLambda',
    )
    expect(capturedArgs[cpIndex + 3]).toBe('com.example.Hello::handleRequest')
  })

  it('rejects in-flight invocations with OFFLINE_WORKER_TERMINATED on terminate()', async () => {
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      resolveClasspath: async () => ({
        classpath: '/u/cp',
        artifactPath: '/u/cp',
        ricJarPath: '/u/r',
      }),
      checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
      spawnOverride: (cmd, args, opts) =>
        realSpawn(process.execPath, [stallingBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        }),
      servicePath: '/tmp',
    })

    // Long timeout so the queue's timeout doesn't race terminate().
    const inFlight = runner.invoke(makeInvokeArgs({ timeoutMs: 60_000 }))
    // Attach catch handler synchronously to avoid unhandled-rejection.
    const settled = inFlight.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )

    // Give the JVM a moment to spawn and the queue to enter inFlight.
    await new Promise((r) => setTimeout(r, 100))

    await runner.terminate()

    const outcome = await settled
    expect(outcome.status).toBe('rejected')
    expect(outcome.reason).toMatchObject({
      code: 'OFFLINE_WORKER_TERMINATED',
    })
  })

  it('invalidate() clears any pending idle-eviction timer and kills the child', async () => {
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      resolveClasspath: async () => ({
        classpath: '/u/cp',
        artifactPath: '/u/cp',
        ricJarPath: '/u/r',
      }),
      checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
      spawnOverride: (cmd, args, opts) =>
        realSpawn(process.execPath, [fakeBootstrap], {
          cwd: opts.cwd,
          env: opts.env,
          stdio: opts.stdio,
        }),
      servicePath: '/tmp',
    })

    try {
      await runner.invoke(makeInvokeArgs())
      // Entry is idle with pendingTimeout armed; invalidate() must clear
      // it and SIGTERM the child without throwing.
      expect(() => runner.invalidate('fn1')).not.toThrow()
      // Second invalidate on a gone entry must also be safe (idempotent).
      expect(() => runner.invalidate('fn1')).not.toThrow()
    } finally {
      await runner.terminate()
    }
  })

  it('rejects with OFFLINE_HANDLER_TIMEOUT when the JVM never posts a response', async () => {
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      resolveClasspath: async () => ({
        classpath: '/u/cp',
        artifactPath: '/u/cp',
        ricJarPath: '/u/r',
      }),
      checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
      spawnOverride: (cmd, args, opts) =>
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

  describe('JAVA_OPTS env var', () => {
    let originalJavaOpts

    beforeEach(() => {
      originalJavaOpts = process.env.JAVA_OPTS
    })

    afterEach(() => {
      if (originalJavaOpts === undefined) {
        delete process.env.JAVA_OPTS
      } else {
        process.env.JAVA_OPTS = originalJavaOpts
      }
    })

    it('prepends JAVA_OPTS args to the JVM command line', async () => {
      process.env.JAVA_OPTS = '-Xmx256m -Dfoo=bar'
      let capturedArgs
      const runner = createJavaRunner({
        idleEvictionMs: 60_000,
        runtimeApiBase,
        runtimeApiQueue: queue,
        log: noopLog,
        resolveClasspath: async () => ({
          classpath: '/u/a.jar:/u/ric.jar',
          artifactPath: '/u/a.jar',
          ricJarPath: '/u/ric.jar',
        }),
        checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
        spawnOverride: (cmd, args, opts) => {
          capturedArgs = args
          return realSpawn(process.execPath, [fakeBootstrap], {
            cwd: opts.cwd,
            env: opts.env,
            stdio: opts.stdio,
          })
        },
        servicePath: '/tmp',
      })

      try {
        await runner.invoke(makeInvokeArgs())
      } finally {
        await runner.terminate()
      }

      // -Xmx256m and -Dfoo=bar come BEFORE -cp.
      const cpIndex = capturedArgs.indexOf('-cp')
      expect(capturedArgs.slice(0, cpIndex)).toEqual(['-Xmx256m', '-Dfoo=bar'])
    })

    it('omits JAVA_OPTS args when env var is unset', async () => {
      delete process.env.JAVA_OPTS
      let capturedArgs
      const runner = createJavaRunner({
        idleEvictionMs: 60_000,
        runtimeApiBase,
        runtimeApiQueue: queue,
        log: noopLog,
        resolveClasspath: async () => ({
          classpath: '/u/cp',
          artifactPath: '/u/cp',
          ricJarPath: '/u/r',
        }),
        checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
        spawnOverride: (cmd, args, opts) => {
          capturedArgs = args
          return realSpawn(process.execPath, [fakeBootstrap], {
            cwd: opts.cwd,
            env: opts.env,
            stdio: opts.stdio,
          })
        },
        servicePath: '/tmp',
      })

      try {
        await runner.invoke(makeInvokeArgs())
      } finally {
        await runner.terminate()
      }

      // First arg is -cp; nothing prepended.
      expect(capturedArgs[0]).toBe('-cp')
    })
  })

  it('reuses the same JVM child across consecutive invokes', async () => {
    const spawnCalls = []
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      log: noopLog,
      resolveClasspath: async () => ({
        classpath: '/unused/cp',
        artifactPath: '/unused/cp',
        ricJarPath: '/unused/ric.jar',
      }),
      checkJavaVersion: async () => ({ majorVersion: 21, raw: '' }),
      spawnOverride: (cmd, args, opts) => {
        spawnCalls.push({ cmd })
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
      expect(r1).toMatchObject({ received: { n: 1 } })
      expect(r2).toMatchObject({ received: { n: 2 } })
      // Pool reuse: a single JVM served both invokes.
      expect(spawnCalls).toHaveLength(1)
    } finally {
      await runner.terminate()
    }
  })
})
