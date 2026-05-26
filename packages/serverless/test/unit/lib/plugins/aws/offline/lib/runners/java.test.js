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
      artifactPath: overrides.artifactPath ?? '/tmp/target/hello.jar',
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
    expect(capturedCreateOpts.HostConfig.Binds).toEqual([
      '/tmp/target:/var/task:ro',
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
})
