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
})
