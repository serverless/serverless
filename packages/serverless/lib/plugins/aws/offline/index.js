import { log } from '@serverless/util'
import offlineSchema from './lib/schema.js'
import {
  LOG_NAMESPACE,
  DEFAULT_AWS_API_PORT,
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

    // 1. Run the provisioner to populate the registry from CFN.
    const { registry } = await provision(serverless)

    // 2. Create a queue store.
    const store = createQueueStore()

    // 3. Create the SQS handlers bound to that store + registry.
    const sqsHandlers = createSqsHandlers({ store, registry })

    // 4. Read awsApiPort from user config.
    const awsApiPort =
      serverless.service.offline?.awsApiPort ?? DEFAULT_AWS_API_PORT

    // Set process env vars for runtime env parity before booting the runner.
    process.env.IS_OFFLINE = 'true'
    process.env.AWS_REGION = serverless.service.provider.region ?? FAKE_REGION
    process.env.AWS_DEFAULT_REGION = process.env.AWS_REGION
    process.env.AWS_ENDPOINT_URL = `http://localhost:${awsApiPort}`
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test'
    process.env.AWS_SECRET_ACCESS_KEY =
      process.env.AWS_SECRET_ACCESS_KEY ?? 'test'

    // 5. Boot the AWS API server.
    const awsApiServer = await createAwsApiServer({
      awsApiPort,
      handlers: { sqs: sqsHandlers },
      logger: log.get('sls:offline:aws-api'),
    })

    // 6. Create a worker-thread runner.
    const serviceDir =
      serverless.serviceDir ?? serverless.config?.servicePath ?? process.cwd()
    const runner = createWorkerThreadRunner({ servicePath: serviceDir })

    // 7. Start the SQS pollers.
    const pollerController = await startSqsPollers({
      serverless,
      registry,
      store,
      runner,
      logger: log.get('sls:offline:sqs-poller'),
    })

    // 8. Register teardowns in LIFO order (last registered = first to run on shutdown).
    //    Registration order: server → runner → pollers  (LIFO teardown runs: pollers, runner, server).
    orchestrator.onShutdown(() => awsApiServer.stop({ timeout: 5000 }))
    orchestrator.onShutdown(() => runner.terminate())
    orchestrator.onShutdown(() => pollerController.stop())

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
