import { log } from '@serverless/util'
import offlineSchema from './lib/schema.js'
import { LOG_NAMESPACE } from './lib/constants.js'
import { createHookBridge } from './lib/hook-bridge.js'
import { createOrchestrator } from './lib/orchestrator.js'

const logger = log.get(LOG_NAMESPACE)

/**
 * Built-in sls offline command — local dev loop for Lambda handlers
 * triggered by HTTP API, REST API, ALB, WebSocket, Schedule, S3, SQS,
 * SNS, and EventBridge events.
 *
 * M0 is the skeleton: command registers, schema is the empty shell
 * (subsequent milestones add keys), boot logs `starting` / `ready`,
 * SIGINT/SIGTERM triggers `stopping` and clean exit.
 *
 * Yields to the community `serverless-offline` plugin when present —
 * Framework's plugin-manager skips this plugin via
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
    const bridge = createHookBridge(this.serverless.pluginManager)
    const orchestrator = createOrchestrator({ logger })

    const shutdownPromise = new Promise((resolve, reject) => {
      const onSignal = () => {
        orchestrator.shutdown().then(resolve, reject)
      }
      process.once('SIGINT', onSignal)
      process.once('SIGTERM', onSignal)
    })

    await bridge.fireBeforeStart()
    await orchestrator.start({
      onReady: async () => {
        await bridge.fireStart()
        await bridge.fireReady()
      },
    })

    await shutdownPromise
    await bridge.fireEnd()
  }
}
