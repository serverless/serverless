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
      log: { debug() {}, notice() {}, warning() {}, error() {} },
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
})
