import { log } from '@serverless/util'
import ServerlessError from '../../../serverless-error.js'
import offlineSchema from './lib/schema.js'
import {
  LOG_NAMESPACE,
  DEFAULT_APP_PORT,
  DEFAULT_AWS_API_PORT,
  DEFAULT_HOST,
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  FAKE_REGION,
} from './lib/constants.js'
import { getStage } from './lib/stage.js'
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
import { getHandlerBaseDir } from './lib/handler-base-dir.js'
import { createLambdaFunction } from './lib/lambda/lambda-function.js'

const logger = log.get(LOG_NAMESPACE)

/**
 * Coerce a CLI-option string to an integer. CLI flags arrive as strings (e.g.
 * `--appPort 4000` → `"4000"`), but YAML and defaults are already typed.
 * Returns `undefined` for missing input or non-numeric strings so callers can
 * fall through with `??` to the next precedence layer.
 *
 * @param {unknown} value
 * @returns {number | undefined}
 */
function coerceInt(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return value
  const n = Number.parseInt(value, 10)
  return Number.isNaN(n) ? undefined : n
}

/**
 * Print a structured boot summary once every subsystem is up. Groups the
 * "now ready" output so users see a single block instead of interleaved
 * "X listening on" lines per subsystem.
 *
 * @param {object} params
 * @param {{ notice: (msg: string) => void }} params.logger
 * @param {{ method: string, path: string, functionKey: string }[]} params.httpApiRoutes
 * @param {number} params.sqsPollerCount
 * @param {string} params.stage
 */
function logBootSummary({ logger, httpApiRoutes, sqsPollerCount, stage }) {
  logger.notice('')
  logger.notice(`sls offline ready (stage: ${stage})`)

  if (httpApiRoutes.length === 0) {
    logger.notice('  HTTP API routes: (none registered)')
  } else {
    logger.notice('  HTTP API routes:')
    // Sort: by path, then by method, so the table is stable across boots.
    const sorted = [...httpApiRoutes].sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    )
    // Right-pad the method column so handler keys line up visually.
    const methodWidth = Math.max(...sorted.map((r) => r.method.length))
    for (const r of sorted) {
      logger.notice(
        `    ${r.method.padEnd(methodWidth)}  ${r.path}  →  ${r.functionKey}`,
      )
    }
  }

  if (sqsPollerCount > 0) {
    logger.notice(
      `  SQS pollers: ${sqsPollerCount} queue${sqsPollerCount === 1 ? '' : 's'} subscribed`,
    )
  }

  logger.notice('')
}

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
    const cliOptions = this.options ?? {}

    // 2. Read config values.
    //    Precedence (highest wins): CLI flag → offline.<key> in YAML → built-in default.
    //    Framework's CLI parser returns option values as strings (e.g. --appPort 4000
    //    arrives as "4000"); coerce port strings to integers locally.
    const awsApiPort =
      coerceInt(cliOptions.awsApiPort) ??
      offline.awsApiPort ??
      DEFAULT_AWS_API_PORT
    const appPort =
      coerceInt(cliOptions.appPort) ?? offline.appPort ?? DEFAULT_APP_PORT
    const host = cliOptions.host ?? offline.host ?? DEFAULT_HOST
    const stage = getStage(serverless)
    const domainName = `${host}:${appPort}`
    // NOTE: servicePath is intentionally NOT captured here — it must be read
    // lazily each time it's needed so that bundler plugins (e.g. built-in
    // esbuild) that swap serverless.config.servicePath in their
    // before:offline:start hook are reflected correctly.
    const terminateIdleLambdaTime =
      offline.terminateIdleLambdaTime ?? DEFAULT_TERMINATE_IDLE_LAMBDA_TIME
    const noTimeout = cliOptions.noTimeout === true
    // watch defaults to true; --noWatch (CLI flag) or offline.noWatch (YAML)
    // disable it explicitly, --watch=false / offline.watch:false also disable.
    const watchEnabled =
      cliOptions.noWatch === true || offline.noWatch === true
        ? false
        : (cliOptions.watch ?? offline.watch ?? true)

    // Refuse to start when both Hapi servers would bind to the same port —
    // doing so produces an opaque EADDRINUSE deep inside Hapi instead of a
    // clear actionable error. Run this check after CLI / YAML / default
    // resolution so the values we test are the ones we'd actually bind.
    if (appPort === awsApiPort) {
      throw new ServerlessError(
        `appPort and awsApiPort must differ (both resolved to ${appPort}). ` +
          'Adjust --appPort, --awsApiPort, or the offline.appPort / offline.awsApiPort entries in serverless.yml.',
        'OFFLINE_PORT_COLLISION',
      )
    }

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
    //    The runner receives handlerPath at invoke()-time (already fully resolved),
    //    so servicePath in workerData is unused — pass a placeholder that will be
    //    overwritten before any invocation. The real resolution happens lazily in
    //    resolveHandlerPath below, after bridge.fireBeforeStart() has run.
    const runner = createWorkerThreadRunner({
      servicePath: '', // placeholder; actual path is resolved per-invocation
      terminateIdleLambdaTime,
    })

    // Lambda function facade: single invocation entry point per function.
    // Builds the per-invocation context + environment uniformly and dispatches
    // to the runner pool. Used by every trigger source (HTTP API, SQS poller,
    // future REST/WS/EB) so the shape stays consistent.
    //
    // Lazy resolution inside .invoke() keeps both bundler contracts working:
    //  - built-in esbuild swaps serverless.config.servicePath
    //  - community serverless-esbuild sets custom['serverless-offline'].location
    const lambdaFunctions = new Map()
    const lambdaLogger = log.get('sls:offline:lambda')
    function getLambdaFunction(functionKey) {
      let fn = lambdaFunctions.get(functionKey)
      if (!fn) {
        fn = createLambdaFunction({
          serverless,
          functionKey,
          runner,
          logger: lambdaLogger,
          noTimeout,
        })
        lambdaFunctions.set(functionKey, fn)
      }
      return fn
    }

    // 8. Start SQS pollers so subscribers are in place before the server
    //    starts accepting connections.
    const pollerController = await startSqsPollers({
      serverless,
      registry,
      store,
      getLambdaFunction,
      logger: log.get('sls:offline:sqs-poller'),
    })

    // 9. Boot the app server (Hapi v21) for user traffic.
    /** @type {{ method: string, path: string, functionKey: string }[]} */
    let httpApiRoutes = []
    const appServer = await createAppServer({
      appPort,
      host,
      logger: log.get('sls:offline:app-server'),
      async registerRoutes(server) {
        httpApiRoutes = registerHttpApiRoutes({
          server,
          serverless,
          stage,
          domainName,
          async onRequest(functionKey, event) {
            return getLambdaFunction(functionKey).invoke(event)
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

    // 11. Register teardowns for the servers and pollers (LIFO — runner and
    //     watcher are added after bridge.fireBeforeStart so they appear last,
    //     meaning they are torn down first).
    //     Registration order so far: awsApiServer → appServer → pollers
    //     LIFO teardown for these: pollers, appServer, awsApiServer.
    orchestrator.onShutdown(() => awsApiServer.stop({ timeout: 5000 }))
    orchestrator.onShutdown(() => appServer.stop({ timeout: 5000 }))
    orchestrator.onShutdown(() => pollerController.stop())

    // 12. Fire before:offline:start so that bundler plugins (e.g. built-in
    //     esbuild) can bundle TS handlers and swap serverless.config.servicePath
    //     to the build output directory BEFORE the watcher resolves handler
    //     paths or the runner is used for the first time.
    await bridge.fireBeforeStart()

    // 13. Start the native file watcher AFTER fireBeforeStart so it resolves
    //     handler paths against the (possibly bundler-swapped) base directory.
    //     getHandlerBaseDir() honours both the built-in esbuild swap and the
    //     community serverless-esbuild custom location contract.
    //     (Auto-disabled when a bundler plugin owns invalidation via
    //     offline:functionsUpdated:cleanup.)
    const watcher = await createWatcher({
      serverless,
      servicePath: getHandlerBaseDir(serverless),
      runner,
      logger: log.get('sls:offline:watcher'),
      enabled: watchEnabled,
    })

    // Register runner + watcher teardowns last so they are first in LIFO order.
    // LIFO teardown: watcher → runner → (pollers, appServer, awsApiServer above).
    orchestrator.onShutdown(() => runner.terminate())
    orchestrator.onShutdown(() => watcher.stop())
    await orchestrator.start({
      onReady: async () => {
        await bridge.fireStart()
        await bridge.fireReady()
        // Boot summary — printed after every component is up so users get a
        // single coherent diagnostic block instead of interleaved listening
        // lines per subsystem.
        logBootSummary({
          logger,
          httpApiRoutes,
          sqsPollerCount: pollerController.pollerCount,
          stage,
        })
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
