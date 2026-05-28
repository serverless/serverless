import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRunner } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/create-runner.js'
import { createInvocationQueue } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_FIXTURES = path.resolve(here, '../../__fixtures__/handlers/python')
const RUBY_FIXTURES = path.resolve(here, '../../__fixtures__/handlers/ruby')

describe('createRunner — runtime-aware dispatch', () => {
  it('routes nodejs* runtime to the worker-thread runner by default', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-dispatch-'),
    )
    const handler = path.join(tmp, 'h.mjs')
    await fs.writeFile(
      handler,
      'export const handler = () => ({ from: "node" })\n',
    )
    try {
      const result = await r.invoke({
        functionKey: 'node-fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      expect(result).toEqual({ from: 'node' })
    } finally {
      await r.terminate()
    }
  })

  it('routes python* runtime to the Python child-process runner', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    try {
      const result = await r.invoke({
        functionKey: 'py-fn',
        handlerPath: path.join(PYTHON_FIXTURES, 'sync_echo.py'),
        handlerName: 'handler',
        event: { hi: 1 },
        context: { name: 'py-fn' },
        runtime: 'python3.11',
      })
      expect(result).toEqual({ ok: true, echo: { hi: 1 }, fn: 'py-fn' })
    } finally {
      await r.terminate()
    }
  })

  it('routes ruby* runtime to the Ruby child-process runner', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    try {
      const result = await r.invoke({
        functionKey: 'rb-fn',
        handlerPath: path.join(RUBY_FIXTURES, 'sync_echo.rb'),
        handlerName: 'handler',
        event: { hi: 1 },
        context: { functionName: 'rb-fn' },
        runtime: 'ruby3.3',
      })
      expect(result).toEqual({ ok: true, echo: { hi: 1 }, fn: 'rb-fn' })
    } finally {
      await r.terminate()
    }
  })

  it('routes useInProcess to in-process Node runner', async () => {
    const r = createRunner({
      useInProcess: true,
      terminateIdleLambdaTime: 60,
    })
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-dispatch-'),
    )
    const handler = path.join(tmp, 'h.mjs')
    await fs.writeFile(
      handler,
      'export const handler = () => ({ from: "in-process" })\n',
    )
    try {
      const result = await r.invoke({
        functionKey: 'inproc-fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      expect(result).toEqual({ from: 'in-process' })
    } finally {
      await r.terminate()
    }
  })

  it('routes Node to Docker when useDocker is enabled even if useInProcess is true', async () => {
    const queue = createInvocationQueue()
    const dispatchProof = new Error('docker-dispatch-proof')
    const r = createRunner({
      useInProcess: true,
      useDocker: true,
      terminateIdleLambdaTime: 60,
      docker: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
        dockerClient: {
          getDockerodeClient: () => ({
            modem: { demuxStream() {} },
          }),
        },
        ensureImageReady: async () => {
          throw dispatchProof
        },
      },
    })

    try {
      await expect(
        r.invoke({
          functionKey: 'node-docker-fn',
          handlerPath: '/unused/handler.js',
          handlerName: 'handler',
          event: {},
          context: { handler: 'handler.handler' },
          runtime: 'nodejs20.x',
          timeoutMs: 1000,
        }),
      ).rejects.toBe(dispatchProof)
    } finally {
      await r.terminate()
    }
  })

  it('python runtime takes precedence over useInProcess flag', async () => {
    // useInProcess: true would route Node to in-process, but a Python
    // function must still go to the Python runner.
    const r = createRunner({
      useInProcess: true,
      terminateIdleLambdaTime: 60,
    })
    try {
      const result = await r.invoke({
        functionKey: 'py-fn-2',
        handlerPath: path.join(PYTHON_FIXTURES, 'sync_echo.py'),
        handlerName: 'handler',
        event: { ok: 'maybe' },
        context: { name: 'py-fn-2' },
        runtime: 'python3.12',
      })
      expect(result).toEqual({
        ok: true,
        echo: { ok: 'maybe' },
        fn: 'py-fn-2',
      })
    } finally {
      await r.terminate()
    }
  })

  it('terminate() shuts down all sub-runners (idempotent no-op when none created)', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    // No sub-runners yet — must be a no-op, not throw.
    await r.terminate()
    // Idempotent.
    await r.terminate()
  })

  it('accepts new invokes after terminate() (sub-runners are re-created lazily)', async () => {
    const r = createRunner({
      useInProcess: true,
      terminateIdleLambdaTime: 60,
    })
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sls-offline-dispatch-'),
    )
    const handler = path.join(tmp, 'h.mjs')
    await fs.writeFile(
      handler,
      'export const handler = () => ({ tag: "post-terminate" })\n',
    )
    try {
      await r.invoke({
        functionKey: 'fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      await r.terminate()
      const result = await r.invoke({
        functionKey: 'fn',
        handlerPath: handler,
        handlerName: 'handler',
        event: {},
        context: {},
        runtime: 'nodejs20.x',
      })
      expect(result).toEqual({ tag: 'post-terminate' })
    } finally {
      await r.terminate()
    }
  })

  it('routes provided.al2 invocations to the Go runner branch (not worker-thread)', async () => {
    // Confidence is built indirectly: if the multiplexer mistakenly routed
    // to the worker-thread runner, the error would surface as a missing
    // handler file. Routing to the Go runner surfaces an OFFLINE_HANDLER_TIMEOUT
    // because nothing on the queue side ever drains the invocation.
    const queue = createInvocationQueue()
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
      go: {
        // Real port doesn't matter — we use ensureBuilt + spawnOverride
        // injection through the runner internals would be needed for a
        // full pass. Instead, prove dispatch via the short timeout path.
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
      },
    })
    try {
      await expect(
        r.invoke({
          functionKey: 'go-fn',
          handlerPath: '/tmp/src/main',
          handlerName: 'handler',
          event: {},
          context: { handler: 'src/main.handler' },
          runtime: 'provided.al2',
          timeoutMs: 50,
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^OFFLINE_/) })
    } finally {
      await r.terminate()
    }
  })

  it('throws an actionable error when a Go function arrives but no go.* options were supplied', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    await expect(
      r.invoke({
        functionKey: 'go-fn',
        handlerPath: '/tmp/src/main',
        handlerName: 'handler',
        event: {},
        context: { handler: 'src/main.handler' },
        runtime: 'provided.al2',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/Go functions require/)
    await r.terminate()
  })

  it('routes java21 functions to the Java runner branch', async () => {
    const queue = createInvocationQueue()
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
      java: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
        dockerClient: {
          getDockerodeClient: () => ({
            modem: { demuxStream() {} },
          }),
        },
        ensureImageReady: async () => {},
      },
    })
    try {
      // artifactPath: null surfaces OFFLINE_JAVA_ARTIFACT_MISSING from the
      // Java runner before any Docker call, proving dispatch landed in the
      // Java branch (worker-thread and Go runners produce different codes).
      await expect(
        r.invoke({
          functionKey: 'java-fn',
          handlerPath: '/unused',
          handlerName: 'h',
          event: {},
          context: { handler: 'com.example.X::handle' },
          artifactPath: null,
          runtime: 'java21',
          timeoutMs: 1000,
        }),
      ).rejects.toMatchObject({ code: 'OFFLINE_JAVA_ARTIFACT_MISSING' })
    } finally {
      await r.terminate()
    }
  })

  it('disambiguates provided.al2 with .jar artifact to Java runner', async () => {
    const queue = createInvocationQueue()
    const dispatchProof = new Error('java-dispatch-proof')
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
      java: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
        dockerClient: {
          getDockerodeClient: () => ({
            modem: { demuxStream() {} },
          }),
        },
        // Throwing here proves dispatch landed in the Java branch — only
        // the Java runner calls ensureImageReady. The Go branch never does.
        ensureImageReady: async () => {
          throw dispatchProof
        },
      },
    })
    try {
      await expect(
        r.invoke({
          functionKey: 'mixed-fn',
          handlerPath: '/unused',
          handlerName: 'h',
          event: {},
          context: { handler: 'com.example.X::handle' },
          artifactPath: '/nonexistent/missing.jar',
          runtime: 'provided.al2',
          timeoutMs: 1000,
        }),
      ).rejects.toBe(dispatchProof)
    } finally {
      await r.terminate()
    }
  })

  it('disambiguates provided.al2 without .jar artifact to Go runner', async () => {
    const queue = createInvocationQueue()
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
      go: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
      },
    })
    try {
      // Go path produces OFFLINE_GO_* errors, not OFFLINE_JAVA_*.
      await expect(
        r.invoke({
          functionKey: 'go-fn',
          handlerPath: '/tmp/src/main',
          handlerName: 'handler',
          event: {},
          context: { handler: 'src/main.handler' },
          artifactPath: null, // no jar → Go
          runtime: 'provided.al2',
          timeoutMs: 50,
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^OFFLINE_GO/) })
    } finally {
      await r.terminate()
    }
  })

  it('routes provided.al2 without a .jar artifact to Docker when useDocker is enabled', async () => {
    const queue = createInvocationQueue()
    const dispatchProof = new Error('docker-provided-dispatch-proof')
    const r = createRunner({
      useInProcess: false,
      useDocker: true,
      terminateIdleLambdaTime: 60,
      docker: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
        dockerClient: {
          getDockerodeClient: () => ({
            modem: { demuxStream() {} },
          }),
        },
        ensureImageReady: async () => {
          throw dispatchProof
        },
      },
    })
    try {
      await expect(
        r.invoke({
          functionKey: 'provided-docker-fn',
          handlerPath: '/tmp/src/main.go',
          handlerName: 'handler',
          event: {},
          context: { handler: 'src/main.handler' },
          artifactPath: '/tmp/dist/bootstrap',
          runtime: 'provided.al2',
          timeoutMs: 1000,
        }),
      ).rejects.toBe(dispatchProof)
    } finally {
      await r.terminate()
    }
  })

  it('keeps legacy go1.x on the Go runner even when useDocker is enabled', async () => {
    const queue = createInvocationQueue()
    const r = createRunner({
      useInProcess: false,
      useDocker: true,
      terminateIdleLambdaTime: 60,
      go: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
      },
      docker: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
        dockerClient: {
          getDockerodeClient: () => ({
            modem: { demuxStream() {} },
          }),
        },
        ensureImageReady: async () => {
          throw new Error('should-not-route-to-docker')
        },
      },
    })
    try {
      await expect(
        r.invoke({
          functionKey: 'go-legacy-fn',
          handlerPath: '/tmp/src/main.go',
          handlerName: 'handler',
          event: {},
          context: { handler: 'src/main.handler' },
          runtime: 'go1.x',
          timeoutMs: 50,
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^OFFLINE_GO/) })
    } finally {
      await r.terminate()
    }
  })

  it('keeps legacy provided.al on the Go runner even with a .jar artifact and useDocker enabled', async () => {
    const queue = createInvocationQueue()
    const r = createRunner({
      useInProcess: false,
      useDocker: true,
      terminateIdleLambdaTime: 60,
      go: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
      },
      docker: {
        runtimeApiBase: 'http://127.0.0.1:1/runtime',
        runtimeApiQueue: queue,
        servicePath: os.tmpdir(),
        dockerClient: {
          getDockerodeClient: () => ({
            modem: { demuxStream() {} },
          }),
        },
        ensureImageReady: async () => {
          throw new Error('should-not-route-to-docker')
        },
      },
    })
    try {
      await expect(
        r.invoke({
          functionKey: 'provided-al-legacy-fn',
          handlerPath: '/tmp/src/main.go',
          handlerName: 'handler',
          event: {},
          context: { handler: 'src/main.handler' },
          artifactPath: '/tmp/target/app.jar',
          runtime: 'provided.al',
          timeoutMs: 50,
        }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^OFFLINE_GO/) })
    } finally {
      await r.terminate()
    }
  })

  it('throws an actionable error when a Java function arrives but no java.* options were supplied', async () => {
    const r = createRunner({
      useInProcess: false,
      terminateIdleLambdaTime: 60,
    })
    await expect(
      r.invoke({
        functionKey: 'java-fn',
        handlerPath: '/unused',
        handlerName: 'h',
        event: {},
        context: { handler: 'com.example.X::handle' },
        artifactPath: '/x.jar',
        runtime: 'java21',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/Java functions require/)
    await r.terminate()
  })
})
