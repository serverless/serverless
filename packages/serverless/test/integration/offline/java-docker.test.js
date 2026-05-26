import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Dockerode from 'dockerode'
import Hapi from '@hapi/hapi'
import { DockerClient } from '@serverless/util'

import { createJavaRunner } from '../../../lib/plugins/aws/offline/lib/runners/java.js'
import { createInvocationQueue } from '../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'
import { registerRuntimeApiRoutes } from '../../../lib/plugins/aws/offline/lib/aws-api-server/runtime-api-routes.js'
import { createImageReadinessChecker } from '../../../lib/plugins/aws/offline/lib/runners/docker-image.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_JAR = path.resolve(
  __dirname,
  '../../fixtures/offline/m5e-docker/hello-1.0.jar',
)

const dockerAvailable = await (async () => {
  try {
    await new Dockerode().ping()
    return true
  } catch {
    return false
  }
})()
const itDocker = dockerAvailable ? it : it.skip

const silentLog = {
  notice: () => {},
  warning: () => {},
  error: () => {},
  debug: () => {},
}

describe('Java runner integration (real Docker)', () => {
  let server
  let queue
  let runtimeApiBase

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

  itDocker(
    'invokes a real Java handler via public.ecr.aws/lambda/java:21',
    async () => {
      const dockerClient = new DockerClient()
      const { ensureImageReady } = createImageReadinessChecker()
      await ensureImageReady({
        dockerClient,
        image: 'public.ecr.aws/lambda/java:21',
        log: silentLog,
      })

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
        // The committed fixture JAR (hello-1.0.jar) returns an APIGW-shaped
        // proxy response wrapper: { statusCode, headers, body } where body
        // is a JSON-encoded payload. We assert the wrapper shape + that
        // the body parses to an object containing a `greeting` key.
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
    },
    180_000,
  )
})
