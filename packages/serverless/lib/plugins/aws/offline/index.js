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

    // 1. Read awsApiPort from user config before provisioning so queue URLs
    //    in the registry use the correct port.
    const awsApiPort =
      serverless.service.offline?.awsApiPort ?? DEFAULT_AWS_API_PORT

    // 2. Run the provisioner to populate the registry from CFN.
    const { registry } = await provision(serverless, { awsApiPort })

    // 3. Create a queue store.
    const store = createQueueStore()

    // 4. Create the SQS handlers bound to that store + registry.
    const sqsHandlers = createSqsHandlers({ store, registry })

    // Set process env vars for runtime env parity before booting the runner.
    process.env.IS_OFFLINE = 'true'
    process.env.AWS_REGION = serverless.service.provider.region ?? FAKE_REGION
    process.env.AWS_DEFAULT_REGION = process.env.AWS_REGION
    process.env.AWS_ENDPOINT_URL = `http://localhost:${awsApiPort}`
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test'
    process.env.AWS_SECRET_ACCESS_KEY =
      process.env.AWS_SECRET_ACCESS_KEY ?? 'test'

    // 5. Create a worker-thread runner.
    const serviceDir =
      serverless.serviceDir ?? serverless.config?.servicePath ?? process.cwd()
    const runner = createWorkerThreadRunner({ servicePath: serviceDir })

    // 6. Start the SQS pollers so subscribers are in place before the server
    //    starts accepting connections.
    const pollerController = await startSqsPollers({
      serverless,
      registry,
      store,
      runner,
      logger: log.get('sls:offline:sqs-poller'),
    })

    // 7. Boot the AWS API server (Hapi starts listening here — subscribers are
    //    already registered, so no SendMessage can arrive without a consumer).
    const awsApiServer = await createAwsApiServer({
      awsApiPort,
      handlers: { sqs: sqsHandlers },
      logger: log.get('sls:offline:aws-api'),
    })

    // 8. Register teardowns in LIFO order (last registered = first to run on shutdown).
    //    Registration order: runner → pollers → server  (LIFO teardown runs: server, pollers, runner).
    orchestrator.onShutdown(() => runner.terminate())
    orchestrator.onShutdown(() => pollerController.stop())
    orchestrator.onShutdown(() => awsApiServer.stop({ timeout: 5000 }))

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
