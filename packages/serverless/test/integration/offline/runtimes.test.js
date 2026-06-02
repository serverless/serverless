import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Hapi from '@hapi/hapi'
import { DockerClient } from '@serverless/util'

import { requireEnv } from './_preflight.js'
import { bootOffline } from './_harness.js'
import { createJavaRunner } from '../../../lib/plugins/aws/offline/lib/runners/java.js'
import { createInvocationQueue } from '../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'
import { registerRuntimeApiRoutes } from '../../../lib/plugins/aws/offline/lib/aws-api-server/runtime-api-routes.js'
import { createImageReadinessChecker } from '../../../lib/plugins/aws/offline/lib/runners/docker-image.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const POLYGLOT = path.join(__dirname, 'fixtures/runtimes-polyglot')
const NODE_INPROCESS = path.join(__dirname, 'fixtures/runtimes-node-inprocess')
const FIXTURE_JAR = path.resolve(
  __dirname,
  '../../fixtures/offline/m5e-docker/hello-1.0.jar',
)

const silentLog = {
  notice: () => {},
  warning: () => {},
  error: () => {},
  debug: () => {},
}

// Always-on polyglot runtime contract. Every host runtime exercised here MUST
// be present — requireEnv HARD-FAILS (never skips) if Docker or a host runtime
// binary is missing, so a misconfigured CI surfaces loudly instead of silently
// passing an empty matrix.
//
// Runtime matrix actually verified in this environment:
//   - Node worker-thread (default) ........ host worker-thread runner
//   - Node in-process (useInProcess) ...... host in-process runner
//   - Python (python3.12 config) .......... host `python3` child-process
//   - Ruby (ruby3.2 config) ............... host `ruby` child-process
//   - Go (provided.al2 config) ............ host `go build` bootstrap binary
//   - Java (java21) ....................... Docker (official Lambda image)
//
// HOST-VS-DOCKER NOTES (also recorded in the offline differences docs):
//   * Python: the YAML pins python3.12 but our host child-process runner shells
//     out to the host `python3` (3.13 here). The handler reports its real major.
//     minor; the test asserts a 3.x host interpreter rather than an exact match.
//   * Ruby: the YAML pins ruby3.2 but the host ruby here is 2.6. The ruby
//     wrapper our offline ships is syntactically compatible with 2.6 (verified
//     end-to-end), so the HOST child-process runner is used — no Docker fallback
//     was required. The handler reports RUBY_VERSION; the test asserts the host
//     ruby served it. (Had the wrapper failed on 2.6 we would have switched the
//     ruby function to `--useDocker` against the official ruby Lambda image.)
//   * Java: the committed fixture jar returns a fixed APIGW-shaped payload and
//     cannot echo env vars, so Java is exercised via the module-level Docker
//     runner (reusing java-docker.test.js's image-readiness pattern) rather than
//     the booted-offline HTTP path.
describe('polyglot runtime integration (host runners)', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({ docker: true, runtimes: ['python3', 'ruby', 'go'] })
    offline = await bootOffline({ cwd: POLYGLOT, readyMs: 120_000 })
  }, 180_000)
  afterAll(async () => offline?.stop())

  it('serves a Node function via the default worker-thread runner', async () => {
    const res = await offline.http('/node')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runtime).toBe('node')
    expect(body.nodeVersion).toMatch(/^v\d+\./)
    // The runner injects the standard execution-environment vars into handler
    // scope (never the host process).
    expect(body.isOffline).toBe('true')
    expect(body.functionName).toBe('it-runtimes-polyglot-dev-node')
  })

  it('serves a Python function via the host python3 child-process runner', async () => {
    const res = await offline.http('/python')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runtime).toBe('python')
    // Host python3 (3.13 here) — see the python divergence note above.
    expect(body.pyVersion).toMatch(/^3\.\d+$/)
    expect(body.isOffline).toBe('true')
    expect(body.functionName).toBe('it-runtimes-polyglot-dev-python')
  })

  it('serves a Ruby function via the host ruby child-process runner', async () => {
    const res = await offline.http('/ruby')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runtime).toBe('ruby')
    // Host ruby (2.6 here) — the wrapper is 2.6-compatible so no Docker
    // fallback was needed; see the ruby divergence note above.
    expect(body.rubyVersion).toMatch(/^\d+\.\d+/)
    expect(body.isOffline).toBe('true')
    expect(body.functionName).toBe('it-runtimes-polyglot-dev-ruby')
  })

  it('serves a Go function via the host go-built bootstrap binary', async () => {
    const res = await offline.http('/go')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runtime).toBe('go')
    expect(body.goVersion).toMatch(/^go\d+\./)
    expect(body.isOffline).toBe('true')
    expect(body.functionName).toBe('it-runtimes-polyglot-dev-go')
  })
})

describe('Node in-process runtime integration', () => {
  let offline
  beforeAll(async () => {
    await requireEnv({})
    offline = await bootOffline({ cwd: NODE_INPROCESS, readyMs: 120_000 })
  }, 180_000)
  afterAll(async () => offline?.stop())

  it('serves a Node function via the in-process runner (useInProcess)', async () => {
    const res = await offline.http('/node')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runtime).toBe('node')
    expect(body.isOffline).toBe('true')
    expect(body.functionName).toBe('it-runtimes-node-inprocess-dev-node')
  })
})

// Java is Docker-backed (the official public.ecr.aws/lambda/java:21 image
// bundles the runtime interface client). The committed fixture jar returns a
// fixed APIGW-shaped payload, so we assert the runner's correct end-to-end
// behavior directly via the Java runner — reusing java-docker.test.js's
// image-readiness pattern — rather than the booted-offline HTTP path.
describe('Java runtime integration (real Docker)', () => {
  let server
  let queue
  let runtimeApiBase

  beforeAll(async () => {
    await requireEnv({ docker: true })
  })

  beforeEach(async () => {
    queue = createInvocationQueue()
    // Bind to 0.0.0.0 so the real container can reach the host via
    // host.docker.internal:host-gateway.
    server = Hapi.server({ host: '0.0.0.0', port: 0 })
    registerRuntimeApiRoutes(server, { queue })
    await server.start()
    runtimeApiBase = `http://0.0.0.0:${server.info.port}/runtime`
  })

  afterEach(async () => {
    await server.stop()
  })

  it('invokes a real Java handler via public.ecr.aws/lambda/java:21', async () => {
    const dockerClient = new DockerClient()
    const { ensureImageReady } = createImageReadinessChecker()
    await ensureImageReady({
      dockerClient,
      image: 'public.ecr.aws/lambda/java:21',
      log: silentLog,
    })

    // The Java runner talks to its container over the AWS Lambda Runtime
    // API; createJavaRunner here drives the same code path the booted
    // offline uses, just without the HTTP front door.
    const runner = createJavaRunner({
      idleEvictionMs: 60_000,
      runtimeApiBase,
      runtimeApiQueue: queue,
      dockerClient,
      ensureImageReady,
      log: silentLog,
      servicePath: '/tmp',
    })

    try {
      const result = await runner.invoke({
        functionKey: 'hello',
        handlerPath: '/unused',
        handlerName: 'unused',
        artifactPath: FIXTURE_JAR,
        event: { greeting: 'integration-smoke' },
        context: {
          awsRequestId: 'int-test',
          invokedFunctionArn:
            'arn:aws:lambda:us-east-1:000000000000:function:hello',
          memoryLimitInMB: '512',
          timeoutMs: 30_000,
          handler: 'com.example.Hello::handleRequest',
          functionName: 'hello',
        },
        environment: {},
        runtime: 'java21',
        timeoutMs: 30_000,
      })
      expect(result).toMatchObject({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
      })
      expect(JSON.parse(result.body)).toMatchObject({
        greeting: expect.any(String),
      })
    } finally {
      await runner.terminate()
    }
  }, 240_000)
})
