import { EventEmitter } from 'node:events'
import Hapi from '@hapi/hapi'

import { createJavaRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/java.js'
import { createInvocationQueue } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'
import { registerRuntimeApiRoutes } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/runtime-api-routes.js'

/**
 * In-memory Container stub that mimics dockerode's API surface enough
 * for createJavaRunner's needs.
 */
function makeFakeContainer() {
  const exitEmitter = new EventEmitter()
  let waitResolve, waitReject
  return {
    started: false,
    stopped: false,
    attachStream: new EventEmitter(), // becomes a duplex-ish; we just need .on('data')
    exitEmitter,
    waitPromise: new Promise((resolve, reject) => {
      waitResolve = resolve
      waitReject = reject
    }),
    _resolveWait(StatusCode) {
      waitResolve({ StatusCode })
    },
    _rejectWait(err) {
      waitReject(err)
    },
    async start() {
      this.started = true
    },
    async attach() {
      return this.attachStream
    },
    async stop() {
      this.stopped = true
      this._resolveWait(0)
    },
    wait() {
      return this.waitPromise
    },
  }
}

function makeFakeDockerClient() {
  return {
    getDockerodeClient() {
      return {
        modem: {
          demuxStream(_stream, _stdoutSink, _stderrSink) {
            // No-op for the happy-path test; the queue resolves via
            // the runtime-api-routes path, not via container stdio.
          },
        },
      }
    },
  }
}

describe('createJavaRunner (Docker)', () => {
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
      handlerPath: '/unused',
      handlerName: 'unused',
      artifactPath:
        'artifactPath' in overrides
          ? overrides.artifactPath
          : '/tmp/target/hello.jar',
      event: overrides.event ?? { hello: 'world' },
      context: {
        awsRequestId: 'rid',
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

  it('exposes the standard runner shape (invoke / invalidate / terminate)', () => {
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async () => makeFakeContainer(),
      servicePath: '/tmp',
    })
    expect(typeof runner.invoke).toBe('function')
    expect(typeof runner.invalidate).toBe('function')
    expect(typeof runner.terminate).toBe('function')
  })

  it('invokes a Java function via the Lambda Runtime API queue (fake container)', async () => {
    let capturedCreateOpts
    const fakeContainer = makeFakeContainer()
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async (opts) => {
        capturedCreateOpts = opts
        // After "container start", simulate the in-container RIC by
        // polling /next and posting /response from the test side.
        setImmediate(async () => {
          const apiBase = opts.Env.find((e) =>
            e.startsWith('AWS_LAMBDA_RUNTIME_API='),
          ).split('=')[1]
          // Replace host.docker.internal → 127.0.0.1 for the test's
          // synthetic poller (the real container would NOT need this).
          const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
          const next = await fetch(
            `${httpBase}/2018-06-01/runtime/invocation/next`,
          )
          const requestId = next.headers.get('lambda-runtime-aws-request-id')
          const payload = await next.json()
          await fetch(
            `${httpBase}/2018-06-01/runtime/invocation/${requestId}/response`,
            {
              method: 'POST',
              body: JSON.stringify({ ok: true, received: payload }),
              headers: { 'content-type': 'application/json' },
            },
          )
        })
        return fakeContainer
      },
      servicePath: '/tmp',
    })

    try {
      const result = await runner.invoke(makeInvokeArgs())
      expect(result).toMatchObject({ ok: true, received: { hello: 'world' } })
    } finally {
      await runner.terminate()
    }

    // Spawn config sanity checks
    expect(capturedCreateOpts.Image).toBe('public.ecr.aws/lambda/java:21')
    expect(capturedCreateOpts.name).toMatch(/^serverless-offline-java-fn1-/)
    expect(capturedCreateOpts.Cmd).toEqual(['com.example.Hello::handleRequest'])
    expect(capturedCreateOpts.HostConfig.AutoRemove).toBe(true)
    expect(capturedCreateOpts.HostConfig.ExtraHosts).toEqual([
      'host.docker.internal:host-gateway',
    ])
    // /var/task/lib is the directory the AWS Lambda Java image puts on
    // the classpath via /var/task/lib/* — mounting the artifact directory
    // at /var/task (rather than /var/task/lib) leaves the JAR off the
    // classpath and surfaces as ClassNotFoundException at first invoke.
    expect(capturedCreateOpts.HostConfig.Binds).toEqual([
      '/tmp/target:/var/task/lib:ro',
    ])
    const apiEnv = capturedCreateOpts.Env.find((e) =>
      e.startsWith('AWS_LAMBDA_RUNTIME_API='),
    )
    expect(apiEnv).toMatch(
      /^AWS_LAMBDA_RUNTIME_API=host\.docker\.internal:\d+\/runtime\/fn1$/,
    )
    expect(capturedCreateOpts.Env).toContain(
      '_HANDLER=com.example.Hello::handleRequest',
    )
  })

  it('reuses the same container across consecutive invokes', async () => {
    let createCount = 0
    const fakeContainer = makeFakeContainer()
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async (opts) => {
        createCount++
        const apiBase = opts.Env.find((e) =>
          e.startsWith('AWS_LAMBDA_RUNTIME_API='),
        ).split('=')[1]
        const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
        let running = true
        ;(async () => {
          while (running) {
            try {
              const next = await fetch(
                `${httpBase}/2018-06-01/runtime/invocation/next`,
              )
              const requestId = next.headers.get(
                'lambda-runtime-aws-request-id',
              )
              const payload = await next.json()
              await fetch(
                `${httpBase}/2018-06-01/runtime/invocation/${requestId}/response`,
                {
                  method: 'POST',
                  body: JSON.stringify({ echoed: payload }),
                  headers: { 'content-type': 'application/json' },
                },
              )
            } catch {
              running = false
            }
          }
        })()
        return fakeContainer
      },
      servicePath: '/tmp',
    })

    try {
      const r1 = await runner.invoke(makeInvokeArgs({ event: { n: 1 } }))
      const r2 = await runner.invoke(makeInvokeArgs({ event: { n: 2 } }))
      expect(r1).toMatchObject({ echoed: { n: 1 } })
      expect(r2).toMatchObject({ echoed: { n: 2 } })
      expect(createCount).toBe(1)
    } finally {
      await runner.terminate()
    }
  })

  it('passes Lambda runtime env vars + user environment into the container', async () => {
    let capturedOpts
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async (opts) => {
        capturedOpts = opts
        const apiBase = opts.Env.find((e) =>
          e.startsWith('AWS_LAMBDA_RUNTIME_API='),
        ).split('=')[1]
        const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
        setImmediate(async () => {
          const next = await fetch(
            `${httpBase}/2018-06-01/runtime/invocation/next`,
          )
          const requestId = next.headers.get('lambda-runtime-aws-request-id')
          await fetch(
            `${httpBase}/2018-06-01/runtime/invocation/${requestId}/response`,
            { method: 'POST', body: JSON.stringify({ ok: true }) },
          )
        })
        return makeFakeContainer()
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

    const envMap = Object.fromEntries(
      capturedOpts.Env.map((entry) => {
        const idx = entry.indexOf('=')
        return [entry.slice(0, idx), entry.slice(idx + 1)]
      }),
    )

    const port = server.info.port
    expect(envMap.AWS_LAMBDA_RUNTIME_API).toBe(
      `host.docker.internal:${port}/runtime/fn1`,
    )
    expect(envMap._HANDLER).toBe('com.example.Hello::handleRequest')
    expect(envMap.AWS_LAMBDA_FUNCTION_NAME).toBe('fn1')
    expect(envMap.AWS_LAMBDA_FUNCTION_MEMORY_SIZE).toBe('512')
    expect(envMap.MY_USER_VAR).toBe('value-1')
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

    it('forwards JAVA_OPTS as JAVA_TOOL_OPTIONS into the container env', async () => {
      process.env.JAVA_OPTS = '-Xmx256m -Dfoo=bar'
      let capturedOpts
      const runner = createJavaRunner({
        idleEvictionMs: 60_000,
        runtimeApiBase,
        runtimeApiQueue: queue,
        dockerClient: makeFakeDockerClient(),
        ensureImageReady: async () => {},
        log: noopLog,
        createContainerOverride: async (opts) => {
          capturedOpts = opts
          const apiBase = opts.Env.find((e) =>
            e.startsWith('AWS_LAMBDA_RUNTIME_API='),
          ).split('=')[1]
          const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
          setImmediate(async () => {
            const next = await fetch(
              `${httpBase}/2018-06-01/runtime/invocation/next`,
            )
            const id = next.headers.get('lambda-runtime-aws-request-id')
            await fetch(
              `${httpBase}/2018-06-01/runtime/invocation/${id}/response`,
              { method: 'POST', body: '{}' },
            )
          })
          return makeFakeContainer()
        },
        servicePath: '/tmp',
      })

      try {
        await runner.invoke(makeInvokeArgs())
      } finally {
        await runner.terminate()
      }

      const javaToolOptions = capturedOpts.Env.find((e) =>
        e.startsWith('JAVA_TOOL_OPTIONS='),
      )
      expect(javaToolOptions).toBe('JAVA_TOOL_OPTIONS=-Xmx256m -Dfoo=bar')
    })

    it('omits JAVA_TOOL_OPTIONS when JAVA_OPTS is unset', async () => {
      delete process.env.JAVA_OPTS
      let capturedOpts
      const runner = createJavaRunner({
        idleEvictionMs: 60_000,
        runtimeApiBase,
        runtimeApiQueue: queue,
        dockerClient: makeFakeDockerClient(),
        ensureImageReady: async () => {},
        log: noopLog,
        createContainerOverride: async (opts) => {
          capturedOpts = opts
          const apiBase = opts.Env.find((e) =>
            e.startsWith('AWS_LAMBDA_RUNTIME_API='),
          ).split('=')[1]
          const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
          setImmediate(async () => {
            const next = await fetch(
              `${httpBase}/2018-06-01/runtime/invocation/next`,
            )
            const id = next.headers.get('lambda-runtime-aws-request-id')
            await fetch(
              `${httpBase}/2018-06-01/runtime/invocation/${id}/response`,
              { method: 'POST', body: '{}' },
            )
          })
          return makeFakeContainer()
        },
        servicePath: '/tmp',
      })

      try {
        await runner.invoke(makeInvokeArgs())
      } finally {
        await runner.terminate()
      }

      expect(
        capturedOpts.Env.find((e) => e.startsWith('JAVA_TOOL_OPTIONS=')),
      ).toBeUndefined()
    })
  })

  it('rejects with OFFLINE_HANDLER_TIMEOUT when the container never posts a response', async () => {
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async (opts) => {
        // Stalling: poll /next but never POST /response.
        const apiBase = opts.Env.find((e) =>
          e.startsWith('AWS_LAMBDA_RUNTIME_API='),
        ).split('=')[1]
        const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
        setImmediate(async () => {
          try {
            await fetch(`${httpBase}/2018-06-01/runtime/invocation/next`)
          } catch {}
        })
        return makeFakeContainer()
      },
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

  it('rejects in-flight invocations with OFFLINE_WORKER_TERMINATED on terminate()', async () => {
    const fakeContainer = makeFakeContainer()
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async (opts) => {
        // Stalling — no /response posted.
        const apiBase = opts.Env.find((e) =>
          e.startsWith('AWS_LAMBDA_RUNTIME_API='),
        ).split('=')[1]
        const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
        setImmediate(async () => {
          try {
            await fetch(`${httpBase}/2018-06-01/runtime/invocation/next`)
          } catch {}
        })
        return fakeContainer
      },
      servicePath: '/tmp',
    })

    const inFlight = runner.invoke(makeInvokeArgs({ timeoutMs: 60_000 }))
    // Attach catch synchronously so the eventual rejection isn't
    // surfaced as an unhandled-rejection.
    const settled = inFlight.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    )

    // Let the spawn + enqueue happen.
    await new Promise((r) => setTimeout(r, 100))

    await runner.terminate()

    const outcome = await settled
    expect(outcome.status).toBe('rejected')
    expect(outcome.reason).toMatchObject({ code: 'OFFLINE_WORKER_TERMINATED' })
  })

  it('invalidate() clears pendingTimeout and stops the container (idempotent)', async () => {
    const fakeContainer = makeFakeContainer()
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async (opts) => {
        // Echo poller — invoke resolves quickly so pool entry is idle.
        const apiBase = opts.Env.find((e) =>
          e.startsWith('AWS_LAMBDA_RUNTIME_API='),
        ).split('=')[1]
        const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
        setImmediate(async () => {
          const next = await fetch(
            `${httpBase}/2018-06-01/runtime/invocation/next`,
          )
          const id = next.headers.get('lambda-runtime-aws-request-id')
          await fetch(
            `${httpBase}/2018-06-01/runtime/invocation/${id}/response`,
            { method: 'POST', body: '{}' },
          )
        })
        return fakeContainer
      },
      servicePath: '/tmp',
    })

    try {
      await runner.invoke(makeInvokeArgs())
      expect(() => runner.invalidate('fn1')).not.toThrow()
      expect(fakeContainer.stopped).toBe(true)
      // Second invalidate on a gone entry must also be safe.
      expect(() => runner.invalidate('fn1')).not.toThrow()
    } finally {
      await runner.terminate()
    }
  })

  it('throws OFFLINE_JAVA_ARTIFACT_MISSING when artifactPath is missing', async () => {
    let createCount = 0
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: makeFakeDockerClient(),
      ensureImageReady: async () => {},
      log: noopLog,
      createContainerOverride: async () => {
        createCount++
        return makeFakeContainer()
      },
      servicePath: '/tmp',
    })

    try {
      await expect(
        runner.invoke(makeInvokeArgs({ artifactPath: null })),
      ).rejects.toMatchObject({ code: 'OFFLINE_JAVA_ARTIFACT_MISSING' })
      expect(createCount).toBe(0)
    } finally {
      await runner.terminate()
    }
  })

  it('demotes stderr output to debug level after terminate() to hide RIC shutdown noise', async () => {
    const logEvents = []
    const captureLog = {
      debug(msg) {
        logEvents.push(['debug', msg])
      },
      notice(msg) {
        logEvents.push(['notice', msg])
      },
      warning(msg) {
        logEvents.push(['warning', msg])
      },
      error(msg) {
        logEvents.push(['error', msg])
      },
    }

    let capturedStderrSink
    const captureDockerClient = {
      getDockerodeClient() {
        return {
          modem: {
            demuxStream(_stream, _stdoutSink, stderrSink) {
              capturedStderrSink = stderrSink
            },
          },
        }
      },
    }

    const fakeContainer = makeFakeContainer()
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient: captureDockerClient,
      ensureImageReady: async () => {},
      log: captureLog,
      createContainerOverride: async (opts) => {
        // Stalling poller — we don't need a real response, just need the
        // sink wired up before terminate().
        const apiBase = opts.Env.find((e) =>
          e.startsWith('AWS_LAMBDA_RUNTIME_API='),
        ).split('=')[1]
        const httpBase = `http://${apiBase.replace('host.docker.internal', '127.0.0.1')}`
        setImmediate(async () => {
          try {
            await fetch(`${httpBase}/2018-06-01/runtime/invocation/next`)
          } catch {}
        })
        return fakeContainer
      },
      servicePath: '/tmp',
    })

    // Kick an invoke so the runner spawns and demuxStream wires up the sink.
    const inFlight = runner.invoke(makeInvokeArgs({ timeoutMs: 60_000 }))
    const settled = inFlight.then(
      (v) => ({ status: 'fulfilled', value: v }),
      (r) => ({ status: 'rejected', reason: r }),
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(typeof capturedStderrSink?.write).toBe('function')

    // Before terminate(): stderr → error.
    capturedStderrSink.write(Buffer.from('startup exception line\n'))
    expect(
      logEvents.find(
        ([level, msg]) =>
          level === 'error' && msg.includes('startup exception line'),
      ),
    ).toBeDefined()

    // After terminate(): the RIC's interrupted-poll stack trace must go
    // to debug, not error.
    await runner.terminate()
    capturedStderrSink.write(
      Buffer.from(
        'LambdaRuntimeClientException: Failed to get next. Response code: 500\n',
      ),
    )
    expect(
      logEvents.find(
        ([level, msg]) =>
          level === 'error' && msg.includes('LambdaRuntimeClientException'),
      ),
    ).toBeUndefined()
    expect(
      logEvents.find(
        ([level, msg]) =>
          level === 'debug' && msg.includes('LambdaRuntimeClientException'),
      ),
    ).toBeDefined()

    await settled
  })
})
