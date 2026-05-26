import { log } from '@serverless/util'
import ServerlessError from '../../../serverless-error.js'
import offlineSchema from './lib/schema.js'
import {
  LOG_NAMESPACE,
  DEFAULT_APP_PORT,
  DEFAULT_AWS_API_PORT,
  DEFAULT_HOST,
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
} from './lib/constants.js'
import { getStage } from './lib/stage.js'
import { createHookBridge } from './lib/hook-bridge.js'
import { createOrchestrator } from './lib/orchestrator.js'
import { provision } from './lib/provisioner/index.js'
import { createQueueStore } from './lib/aws-api-server/sqs/queue-store.js'
import { createSqsHandlers } from './lib/aws-api-server/sqs/handlers.js'
import { createAwsApiServer } from './lib/aws-api-server/index.js'
import { createRunner } from './lib/runners/create-runner.js'
import { createInvocationQueue } from './lib/runners/invocation-queue.js'
import { startSqsPollers } from './lib/event-sources/sqs-poller.js'
import { createAppServer } from './lib/app-server/index.js'
import { registerAlbRoutes } from './lib/app-server/alb/route-loader.js'
import { registerHttpApiRoutes } from './lib/app-server/http-api/route-loader.js'
import { registerRestApiRoutes } from './lib/app-server/rest-api/route-loader.js'
import { registerAuthSchemes } from './lib/app-server/authorizers/register-schemes.js'
import { loadCustomAuthenticationProvider } from './lib/app-server/authorizers/custom-auth-loader.js'
import { createConnectionRegistry } from './lib/app-server/websocket/connection-registry.js'
import { normalizeWebsocketEvents } from './lib/app-server/websocket/lifecycle-routes.js'
import { createWebSocketServer } from './lib/app-server/websocket/server.js'
import { registerManagementApiRoutes } from './lib/app-server/websocket/management-api-routes.js'
import { createWatcher } from './lib/watcher.js'
import { assertSupportedRuntimes } from './lib/runtime-guard.js'
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
 * "now ready" output so users see a single block with the bound endpoints
 * at the top and full URLs in the route table — the per-server `listening
 * on …` notices are intentionally omitted in favor of this consolidated
 * view.
 *
 * @param {object} params
 * @param {{ notice: (msg: string) => void }} params.logger
 * @param {string} params.appUrl                              The HTTP API / REST / ALB / WebSocket endpoint.
 * @param {string} params.awsApiUrl                           The AWS SDK endpoint (Lambda Invoke, SQS, etc.).
 * @param {{ method: string, path: string, functionKey: string }[]} params.httpApiRoutes
 * @param {{ method: string, path: string, mountedPath: string, apigwMountedPath: string, functionKey: string }[]} [params.restApiRoutes]
 * @param {number} params.sqsPollerCount
 * @param {string} params.stage
 * @param {boolean} params.useInProcess  Whether the in-process Node runner is active.
 * @param {boolean} params.hasPythonFunctions  Whether any function declares a python3.x runtime.
 * @param {boolean} params.hasRubyFunctions  Whether any function declares a ruby3.x runtime.
 * @param {boolean} params.hasGoFunctions  Whether any function declares a go*.x or provided.al{,2,2023} runtime.
 * @param {boolean} params.hasJavaFunctions  Whether any function declares a java* or java8.al2 runtime.
 */
function logBootSummary({
  logger,
  appUrl,
  awsApiUrl,
  albRoutes,
  wsRoutes,
  httpApiRoutes,
  restApiRoutes,
  sqsPollerCount,
  stage,
  useInProcess,
  hasPythonFunctions,
  hasRubyFunctions,
  hasGoFunctions,
  hasJavaFunctions,
}) {
  logger.notice('')
  logger.notice(`sls offline ready (stage: ${stage})`)
  logger.notice(`  App endpoint:    ${appUrl}`)
  logger.notice(`  AWS endpoint:    ${awsApiUrl}`)
  logger.notice(
    `  Node runner:     ${useInProcess ? 'in-process' : 'worker-thread'}`,
  )
  if (hasPythonFunctions) {
    logger.notice(`  Python runner:   child-process (python3)`)
  }
  if (hasRubyFunctions) {
    logger.notice(`  Ruby runner:     child-process (ruby)`)
  }
  if (hasGoFunctions) {
    logger.notice(`  Go runner:       child-process (bootstrap binary)`)
  }
  if (hasJavaFunctions) {
    logger.notice(`  Java runner:     child-process (JVM + AWS RIC)`)
  }

  // WebSocket routes — emit first because the WS upgrade handler fires
  // before any HTTP route resolution. Followed by the management-API
  // mount note (ApiGatewayManagementApi endpoint clients should target).
  if (wsRoutes && wsRoutes.size > 0) {
    logger.notice('  WebSocket routes:')
    const sortedRoutes = Array.from(wsRoutes.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    const widest = Math.max(...sortedRoutes.map(([r]) => r.length))
    const wsUrl = appUrl.replace(/^http:/, 'ws:')
    for (const [route, entry] of sortedRoutes) {
      logger.notice(
        `    ${route.padEnd(widest)}  ${wsUrl}/${stage}  →  ${entry.functionKey}`,
      )
    }
    logger.notice(
      `  Management API:  ${appUrl}/${stage}/@connections/{id}  (POST / GET / DELETE)`,
    )
  }

  // ALB routes register first on Hapi (and thus win path-collisions over
  // REST / HTTP API), so list them at the top of the boot table — the
  // visual order matches the routing-precedence rule users hit at runtime.
  if (albRoutes && albRoutes.length > 0) {
    logger.notice('  ALB routes:')
    const sorted = [...albRoutes].sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    )
    const methodWidth = Math.max(...sorted.map((r) => r.method.length))
    for (const r of sorted) {
      logger.notice(
        `    ${r.method.padEnd(methodWidth)}  ${appUrl}${r.path}  →  ${r.functionKey}`,
      )
    }
  }

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
      // Show the full URL (appUrl + path) so the user can copy-paste straight
      // into curl. APIGW path placeholders stay literal (e.g. `{id}`) — the
      // route key already documents them.
      logger.notice(
        `    ${r.method.padEnd(methodWidth)}  ${appUrl}${r.path}  →  ${r.functionKey}`,
      )
    }
  }

  if (restApiRoutes && restApiRoutes.length > 0) {
    logger.notice('  REST API routes:')
    // Sort by mounted URL then method so the table is stable across boots.
    const sorted = [...restApiRoutes].sort(
      (a, b) =>
        a.apigwMountedPath.localeCompare(b.apigwMountedPath) ||
        a.method.localeCompare(b.method),
    )
    const methodWidth = Math.max(...sorted.map((r) => r.method.length))
    for (const r of sorted) {
      // apigwMountedPath carries stage + optional --prefix on the APIGW
      // path template ({proxy+} rather than the Hapi-translated {proxy*}),
      // so users see the same form they wrote in serverless.yml.
      logger.notice(
        `    ${r.method.padEnd(methodWidth)}  ${appUrl}${r.apigwMountedPath}  →  ${r.functionKey}`,
      )
    }
  }

  if (sqsPollerCount > 0) {
    logger.notice(
      `  SQS pollers:     ${sqsPollerCount} queue${sqsPollerCount === 1 ? '' : 's'} subscribed`,
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
    assertSupportedRuntimes(serverless)

    // Framework v4 / sf-core stores top-level YAML blocks on
    // `service.initialServerlessConfig` rather than as direct service
    // properties. Read from the canonical raw-config location so users
    // who declare config in YAML (e.g. `offline.appPort: 4000`) are
    // honored, falling back to `service.offline` for compatibility.
    const offline =
      serverless.service.initialServerlessConfig?.offline ??
      serverless.service.offline ??
      {}
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
    // Runner selection: --useInProcess CLI flag → offline.useInProcess YAML
    // key → default false (worker-thread runner). The in-process runner
    // trades worker isolation for lower invocation overhead and direct
    // stack traces — opt-in only for parity with serverless-offline.
    const useInProcess =
      cliOptions.useInProcess ?? offline.useInProcess ?? false
    // Detect Python functions so the boot summary advertises the python3
    // child-process runner alongside the Node runner. Uses the same regex
    // as runtime-guard.js to keep the "what counts as Python" definition
    // in one place per family.
    const hasPythonFunctions = Object.values(
      serverless.service.functions ?? {},
    ).some((fn) => {
      const rt = fn.runtime ?? serverless.service.provider.runtime
      return /^python\d+\.\d+$/.test(rt ?? '')
    })
    const hasRubyFunctions = Object.values(
      serverless.service.functions ?? {},
    ).some((fn) => {
      const rt = fn.runtime ?? serverless.service.provider.runtime
      return /^ruby\d+\.\d+$/.test(rt ?? '')
    })
    // Go detection covers the legacy `go1.x` runtime family and the
    // current `provided.al{,2}` custom-runtime family used by current
    // `aws-lambda-go` builds. Regex set matches runtime-guard.js so the
    // "what counts as Go" decision lives in one place per family.
    const hasGoFunctions = Object.values(
      serverless.service.functions ?? {},
    ).some((fn) => {
      const rt = fn.runtime ?? serverless.service.provider.runtime
      return /^go\d+\.x?$/.test(rt ?? '') || /^provided\.al2?$/.test(rt ?? '')
    })
    // Java detection covers the full Java runtime family (java8.al2,
    // java11, java17, java21, future java25+). The `provided.al2(023)?`
    // case is ambiguous between Go and Java; we don't disambiguate
    // here — the multiplexer does that via the .jar artifact-extension
    // check. For queue/routes gating we just need to know whether ANY
    // Java function exists.
    const hasJavaFunctions = Object.values(
      serverless.service.functions ?? {},
    ).some((fn) => {
      const rt = fn.runtime ?? serverless.service.provider.runtime
      return /^java\d+(\.al2)?$/.test(rt ?? '')
    })
    const noTimeout = cliOptions.noTimeout === true
    const prefix = cliOptions.prefix ?? offline.prefix
    const noPrependStageInUrl =
      cliOptions.noPrependStageInUrl === true ||
      offline.noPrependStageInUrl === true
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

    // 7. Create the runner.
    //    Worker-thread (default) receives handlerPath at invoke()-time (already
    //    fully resolved), so servicePath in workerData is unused — pass a
    //    placeholder that will be overwritten before any invocation. The real
    //    resolution happens lazily in resolveHandlerPath below, after
    //    bridge.fireBeforeStart() has run.
    //    In-process runner (--useInProcess) shares the offline server's process
    //    and ignores terminateIdleLambdaTime (no workers to recycle).
    //    When any function uses the Go runtime family, also create the shared
    //    invocation queue that bridges the runner to the AWS Lambda Runtime
    //    API routes mounted on the aws-api-server (see step 10).
    // The Lambda Runtime API queue + Hapi routes are shared by every
    // runner that uses the AWS RIC convention (Go via aws-lambda-go,
    // Java via the official RIC).
    const hasRuntimeApiFunctions = hasGoFunctions || hasJavaFunctions
    const runtimeApiQueue = hasRuntimeApiFunctions
      ? createInvocationQueue()
      : null
    const runtimeApiBase = `http://${host}:${awsApiPort}/runtime`
    const runner = createRunner({
      useInProcess,
      terminateIdleLambdaTime,
      go: hasGoFunctions
        ? {
            runtimeApiBase,
            runtimeApiQueue,
            servicePath: getHandlerBaseDir(serverless),
            log: log.get('sls:offline:go'),
          }
        : undefined,
      java: hasJavaFunctions
        ? {
            runtimeApiBase,
            runtimeApiQueue,
            servicePath: getHandlerBaseDir(serverless),
            log: log.get('sls:offline:java'),
          }
        : undefined,
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
    let albRoutes = []
    /** @type {{ method: string, path: string, functionKey: string }[]} */
    let httpApiRoutes = []
    /** @type {{ method: string, path: string, mountedPath: string, functionKey: string }[]} */
    let restApiRoutes = []
    /** @type {Map<string, { functionKey: string, authorizer?: object }>} */
    let wsRoutes = new Map()
    /** @type {{ stop: () => Promise<void> } | null} */
    let wsServer = null
    const appServer = await createAppServer({
      appPort,
      host,
      logger: log.get('sls:offline:app-server'),
      async registerRoutes(server) {
        // Register Hapi auth schemes + strategies BEFORE any routes — Hapi
        // rejects `route.options.auth` references to strategies that don't
        // exist yet at registration time.
        const customAuthStrategy = await loadCustomAuthenticationProvider({
          serverless,
        })
        const authStrategies = registerAuthSchemes({
          server,
          serverless,
          lambdas: {
            get: (functionKey) => getLambdaFunction(functionKey),
          },
          stage,
          accountId: FAKE_ACCOUNT_ID,
          domainName,
          customAuthStrategy,
        })

        // WebSocket: shared appPort. The Hapi server's `upgrade` event
        // hands incoming WS handshakes to a dedicated ws.Server; HTTP
        // routes (management API, ALB, REST, HTTP API) coexist
        // independently. Master plan §M4: WS shares appPort — no
        // separate websocketPort.
        const wsRegistry = createConnectionRegistry()
        wsRoutes = normalizeWebsocketEvents(serverless)
        wsServer = createWebSocketServer({
          hapiServer: server,
          serverless,
          onRequest: async (functionKey, event) =>
            getLambdaFunction(functionKey).invoke(event),
          registry: wsRegistry,
          stage,
          accountId: FAKE_ACCOUNT_ID,
          region: FAKE_REGION,
        })

        // ApiGatewayManagementApi: HTTP routes at /<stage>/@connections/{id}.
        // Register BEFORE ALB so the path always resolves to the
        // management API regardless of any colliding ALB declaration.
        registerManagementApiRoutes({
          hapiServer: server,
          registry: wsRegistry,
          stage,
        })

        // ALB routes register FIRST (among the regular HTTP surfaces) so
        // their literal-path declarations win same-method-same-path
        // collisions against REST / HTTP API routes (Hapi resolves by
        // registration order). Master plan §M4: ALB shares appPort.
        albRoutes = registerAlbRoutes({
          server,
          serverless,
          async onRequest(functionKey, event) {
            return getLambdaFunction(functionKey).invoke(event)
          },
        })

        httpApiRoutes = registerHttpApiRoutes({
          server,
          serverless,
          stage,
          domainName,
          authStrategies,
          async onRequest(functionKey, event) {
            return getLambdaFunction(functionKey).invoke(event)
          },
        })
        restApiRoutes = registerRestApiRoutes({
          server,
          serverless,
          stage,
          prefix,
          noPrependStageInUrl,
          authStrategies,
          async onRequest(functionKey, event) {
            return getLambdaFunction(functionKey).invoke(event)
          },
        })
      },
    })

    // 10. Boot the AWS API server (Hapi starts listening here — subscribers are
    //     already registered, so no SendMessage can arrive without a consumer).
    const awsApiServer = await createAwsApiServer({
      awsApiPort,
      host,
      handlers: { sqs: sqsHandlers },
      logger: log.get('sls:offline:aws-api'),
      // Mount the Lambda Runtime API routes when any Go function is in
      // the service. The Go runner enqueues into this queue; the routes
      // drain it via long-polling from the child bootstrap binary.
      runtimeApi: runtimeApiQueue ? { queue: runtimeApiQueue } : undefined,
    })

    // 11. Register teardowns for the servers and pollers (LIFO — runner and
    //     watcher are added after bridge.fireBeforeStart so they appear last,
    //     meaning they are torn down first).
    //     Registration order so far: awsApiServer → appServer → pollers
    //     LIFO teardown for these: pollers, appServer, awsApiServer.
    orchestrator.onShutdown(() => awsApiServer.stop({ timeout: 5000 }))
    orchestrator.onShutdown(() => appServer.stop({ timeout: 5000 }))
    // The WS server closes all open sockets (code 1001) before the Hapi
    // app server tears down its listener. Order matters: shut WS first so
    // clients get a clean close frame, not a TCP RST.
    orchestrator.onShutdown(() => (wsServer ? wsServer.stop() : undefined))
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
        // lines per subsystem.  `server.info.uri` is the URL Hapi actually
        // bound (matters when appPort/awsApiPort is 0 → OS-assigned).
        logBootSummary({
          logger,
          appUrl: appServer.info.uri,
          awsApiUrl: awsApiServer.info.uri,
          albRoutes,
          wsRoutes,
          httpApiRoutes,
          restApiRoutes,
          sqsPollerCount: pollerController.pollerCount,
          stage,
          useInProcess,
          hasPythonFunctions,
          hasRubyFunctions,
          hasGoFunctions,
          hasJavaFunctions,
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
