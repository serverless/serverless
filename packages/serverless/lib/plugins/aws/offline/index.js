import crypto from 'node:crypto'
import { access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { log } from '@serverless/util'
import offlineSchema from './lib/schema.js'
import {
  LOG_NAMESPACE,
  DEFAULT_APP_PORT,
  DEFAULT_AWS_API_PORT,
  DEFAULT_HOST,
  DEFAULT_STAGE,
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  FAKE_REGION,
} from './lib/constants.js'
import { createHookBridge } from './lib/hook-bridge.js'
import { createOrchestrator } from './lib/orchestrator.js'
import { provision } from './lib/provisioner/index.js'
import { createQueueStore } from './lib/aws-api-server/sqs/queue-store.js'
import { createSqsHandlers } from './lib/aws-api-server/sqs/handlers.js'
import { createAwsApiServer } from './lib/aws-api-server/index.js'
import { createWorkerThreadRunner } from './lib/runners/worker-thread.js'
import { startSqsPollers } from './lib/event-sources/sqs-poller.js'
import { createAppServer } from './lib/app-server/index.js'
import { registerHttpApiRoutes } from './lib/app-server/http-api/route-loader.js'
import { createWatcher } from './lib/watcher.js'
import { assertAllNodeRuntimes } from './lib/runtime-guard.js'
import { arnFor } from './lib/provisioner/arn-synth.js'

const logger = log.get(LOG_NAMESPACE)

/**
 * Built-in sls offline command — local dev loop for Lambda handlers
 * triggered by HTTP API, REST API, ALB, WebSocket, Schedule, S3, SQS,
 * SNS, and EventBridge events.
 *
 * Yields to the `serverless-offline` plugin when present in the user's
 * `plugins:` list — Framework's plugin-manager skips this plugin via
 * `bundledPluginDefinitions.allowCommunityOverride`.
 */
export default class OfflinePlugin {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = serverless.getProvider('aws')

    serverless.configSchemaHandler.defineTopLevelProperty(
      'offline',
      offlineSchema,
    )

    this.hooks = {
      'offline:offline': () => this.#run(),
    }
  }

  async #run() {
    const { serverless } = this
    const bridge = createHookBridge(serverless.pluginManager)
    const orchestrator = createOrchestrator({ logger })

    const shutdownPromise = new Promise((resolve, reject) => {
      const onSignal = () => {
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
        orchestrator.shutdown().then(resolve, reject)
      }
      process.once('SIGINT', onSignal)
      process.once('SIGTERM', onSignal)
    })

    // 1. Guard: bail early if any function uses a non-Node runtime.
    assertAllNodeRuntimes(serverless)

    const offline = serverless.service.offline ?? {}
    const provider = serverless.service.provider ?? {}

    // 2. Read config values.
    const awsApiPort = offline.awsApiPort ?? DEFAULT_AWS_API_PORT
    const appPort = offline.appPort ?? DEFAULT_APP_PORT
    const host = offline.host ?? DEFAULT_HOST
    const stage = provider.stage ?? DEFAULT_STAGE
    const domainName = `${host}:${appPort}`
    const servicePath =
      serverless.serviceDir ?? serverless.config?.servicePath ?? process.cwd()
    const terminateIdleLambdaTime =
      offline.terminateIdleLambdaTime ?? DEFAULT_TERMINATE_IDLE_LAMBDA_TIME

    // 3. Set process env vars for runtime env parity before booting the runner.
    process.env.IS_OFFLINE = 'true'
    process.env.AWS_REGION = provider.region ?? FAKE_REGION
    process.env.AWS_DEFAULT_REGION = process.env.AWS_REGION
    process.env.AWS_ENDPOINT_URL = `http://localhost:${awsApiPort}`
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test'
    process.env.AWS_SECRET_ACCESS_KEY =
      process.env.AWS_SECRET_ACCESS_KEY ?? 'test'

    // 4. Run the provisioner to populate the registry from CFN.
    const { registry } = await provision(serverless, { awsApiPort })

    // 5. Create a queue store.
    const store = createQueueStore()

    // 6. Create the SQS handlers bound to that store + registry.
    const sqsHandlers = createSqsHandlers({ store, registry })

    // 7. Create a worker-thread runner pool.
    const runner = createWorkerThreadRunner({
      servicePath,
      terminateIdleLambdaTime,
    })

    // Helper: resolve handler file path (tries .js, .mjs, .cjs extensions).
    async function resolveHandlerPath(relPath) {
      const extensions = ['.js', '.mjs', '.cjs']
      for (const ext of extensions) {
        const candidate = resolve(join(servicePath, relPath + ext))
        try {
          await access(candidate)
          return candidate
        } catch {
          // Extension not found — try the next one.
        }
      }
      // Fall back to .js and let the runner surface the error at invocation time.
      return resolve(join(servicePath, relPath + '.js'))
    }

    // Helper: invoke a Lambda function via the runner pool.
    async function invokeFunctionViaRunner(functionKey, event) {
      const fn = serverless.service.functions[functionKey]
      const handler = fn.handler
      const lastDot = handler.lastIndexOf('.')
      const relPath = handler.slice(0, lastDot)
      const handlerName = handler.slice(lastDot + 1)

      const handlerPath = await resolveHandlerPath(relPath)

      const timeoutMs = (fn.timeout ?? 6) * 1000
      const deadlineMs = Date.now() + timeoutMs
      const memoryLimitInMB = String(fn.memorySize ?? 1024)
      const functionArn = arnFor('lambda', functionKey)

      const context = {
        functionName: functionKey,
        awsRequestId: crypto.randomUUID(),
        invokedFunctionArn: functionArn,
        memoryLimitInMB,
        callbackWaitsForEmptyEventLoop: true,
        deadlineMs,
      }

      const environment = {
        ...(provider.environment ?? {}),
        ...(fn.environment ?? {}),
      }

      return runner.invoke({
        functionKey,
        handlerPath,
        handlerName,
        event,
        context,
        environment,
        timeoutMs,
      })
    }

    // 8. Start SQS pollers so subscribers are in place before the server
    //    starts accepting connections.
    const pollerController = await startSqsPollers({
      serverless,
      registry,
      store,
      runner,
      logger: log.get('sls:offline:sqs-poller'),
    })

    // 9. Boot the app server (Hapi v21) for user traffic.
    const appServer = await createAppServer({
      appPort,
      host,
      logger: log.get('sls:offline:app-server'),
      async registerRoutes(server) {
        registerHttpApiRoutes({
          server,
          serverless,
          stage,
          domainName,
          async onRequest(functionKey, event) {
            return invokeFunctionViaRunner(functionKey, event)
          },
        })
        // (M2+ will add registerRestApiRoutes, M4+ ALB and WebSocket, etc.)
      },
    })

    // 10. Boot the AWS API server (Hapi starts listening here — subscribers are
    //     already registered, so no SendMessage can arrive without a consumer).
    const awsApiServer = await createAwsApiServer({
      awsApiPort,
      host,
      handlers: { sqs: sqsHandlers },
      logger: log.get('sls:offline:aws-api'),
    })

    // 11. Start the native file watcher (auto-disabled when bundler plugin is present).
    const watcher = await createWatcher({
      serverless,
      servicePath,
      runner,
      logger: log.get('sls:offline:watcher'),
    })

    // 12. Register teardowns in LIFO order.
    //     Registration order: awsApiServer → appServer → pollers → runner → watcher
    //     LIFO teardown runs: watcher, runner, pollers, appServer, awsApiServer.
    orchestrator.onShutdown(() => awsApiServer.stop({ timeout: 5000 }))
    orchestrator.onShutdown(() => appServer.stop({ timeout: 5000 }))
    orchestrator.onShutdown(() => pollerController.stop())
    orchestrator.onShutdown(() => runner.terminate())
    orchestrator.onShutdown(() => watcher.stop())

    await bridge.fireBeforeStart()
    await orchestrator.start({
      onReady: async () => {
        await bridge.fireStart()
        await bridge.fireReady()
      },
    })

    let shutdownError
    try {
      await shutdownPromise
    } catch (err) {
      shutdownError = err
    } finally {
      await bridge.fireEnd()
    }
    if (shutdownError) throw shutdownError
  }
}
