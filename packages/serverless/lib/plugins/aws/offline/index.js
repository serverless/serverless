import { DockerClient, log } from '@serverless/util'
import ServerlessError from '../../../serverless-error.js'
import { assertDockerAvailable } from './lib/runners/docker-availability.js'
import { cleanupOrphanContainers } from './lib/runners/docker-cleanup.js'
import { createImageReadinessChecker } from './lib/runners/docker-image.js'
import {
  architectureToDockerPlatform,
  isDockerSupportedRuntime,
  runtimeToDockerImage,
} from './lib/runners/docker-runtime-image.js'
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
import { buildFunctionNameMap } from './lib/aws-api-server/lambda-invoke/name-map.js'
import { createRunner } from './lib/runners/create-runner.js'
import { createInvocationQueue } from './lib/runners/invocation-queue.js'
import { createScheduler } from './lib/event-sources/schedule.js'
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

export function resolveOfflineOptions({ cliOptions = {}, offline = {} } = {}) {
  return {
    appPort:
      coerceInt(cliOptions.appPort) ?? offline.appPort ?? DEFAULT_APP_PORT,
    awsApiPort:
      coerceInt(cliOptions.awsApiPort) ??
      offline.awsApiPort ??
      DEFAULT_AWS_API_PORT,
    corsAllowHeaders:
      cliOptions.corsAllowHeaders ??
      offline.corsAllowHeaders ??
      'accept,content-type,x-api-key,authorization',
    corsAllowOrigin:
      cliOptions.corsAllowOrigin ?? offline.corsAllowOrigin ?? '*',
    corsDisallowCredentials:
      cliOptions.corsDisallowCredentials ??
      offline.corsDisallowCredentials ??
      true,
    corsExposedHeaders:
      cliOptions.corsExposedHeaders ??
      offline.corsExposedHeaders ??
      'WWW-Authenticate,Server-Authorization',
    disableCookieValidation:
      cliOptions.disableCookieValidation ??
      offline.disableCookieValidation ??
      false,
    dockerHost:
      cliOptions.dockerHost ?? offline.dockerHost ?? 'host.docker.internal',
    dockerHostServicePath:
      cliOptions.dockerHostServicePath ?? offline.dockerHostServicePath ?? null,
    dockerNetwork: cliOptions.dockerNetwork ?? offline.dockerNetwork ?? null,
    dockerReadOnly: cliOptions.dockerReadOnly ?? offline.dockerReadOnly ?? true,
    enforceSecureCookies:
      cliOptions.enforceSecureCookies ?? offline.enforceSecureCookies ?? false,
    host: cliOptions.host ?? offline.host ?? DEFAULT_HOST,
    httpsProtocol: cliOptions.httpsProtocol ?? offline.httpsProtocol,
    ignoreJWTSignature:
      cliOptions.ignoreJWTSignature ?? offline.ignoreJWTSignature ?? false,
    localEnvironment:
      cliOptions.localEnvironment ?? offline.localEnvironment ?? false,
    noAuth: cliOptions.noAuth ?? offline.noAuth ?? false,
    noPrependStageInUrl:
      cliOptions.noPrependStageInUrl ?? offline.noPrependStageInUrl ?? false,
    prefix: cliOptions.prefix ?? offline.prefix,
    terminateIdleLambdaTime:
      coerceInt(cliOptions.terminateIdleLambdaTime) ??
      offline.terminateIdleLambdaTime ??
      DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
    useDocker: cliOptions.useDocker ?? offline.useDocker ?? false,
    useInProcess: cliOptions.useInProcess ?? offline.useInProcess ?? false,
    watchEnabled:
      cliOptions.noWatch === true || offline.noWatch === true
        ? false
        : (cliOptions.watch ?? offline.watch ?? true),
    webSocketHardTimeout:
      coerceInt(cliOptions.webSocketHardTimeout) ??
      coerceInt(offline.webSocketHardTimeout) ??
      7200,
    webSocketIdleTimeout:
      coerceInt(cliOptions.webSocketIdleTimeout) ??
      coerceInt(offline.webSocketIdleTimeout) ??
      600,
  }
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
 * @param {boolean} params.useDocker  Whether Docker mode is enabled for supported runtimes.
 * @param {boolean} params.hasPythonFunctions  Whether any function declares a python3.x runtime.
 * @param {boolean} params.hasRubyFunctions  Whether any function declares a ruby3.x runtime.
 * @param {boolean} params.hasGoFunctions  Whether any function declares a go*.x or provided.al{,2,2023} runtime.
 * @param {boolean} params.hasJavaFunctions  Whether any function declares a java* or java8.al2 runtime.
 * @param {Set<string>} [params.javaImages]  Set of Docker image URIs discovered for Java functions.
 * @param {boolean} [params.hasDockerFunctions]  Whether any function uses Docker-backed Runtime API mode.
 * @param {Set<string>} [params.dockerImages]  Set of Docker image URIs discovered for Docker mode.
 * @param {number} params.scheduledCount  Total schedule entries discovered (including disabled).
 * @param {number} params.disabledScheduleCount  Subset where enabled === false.
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
  useDocker,
  hasPythonFunctions,
  hasRubyFunctions,
  hasGoFunctions,
  hasJavaFunctions,
  javaImages,
  hasDockerFunctions,
  dockerImages,
  scheduledCount,
  disabledScheduleCount,
}) {
  logger.notice('')
  logger.notice(`sls offline ready (stage: ${stage})`)
  logger.notice(`  App endpoint:    ${appUrl}`)
  logger.notice(`  AWS endpoint:    ${awsApiUrl}`)
  if (useDocker && hasDockerFunctions) {
    logger.notice(
      '  Node runner:     docker when supported, worker-thread fallback',
    )
  } else {
    logger.notice(
      `  Node runner:     ${useInProcess ? 'in-process' : 'worker-thread'}`,
    )
  }
  if (hasPythonFunctions && !(useDocker && hasDockerFunctions)) {
    logger.notice(`  Python runner:   child-process (python3)`)
  }
  if (hasRubyFunctions && !(useDocker && hasDockerFunctions)) {
    logger.notice(`  Ruby runner:     child-process (ruby)`)
  }
  if (hasGoFunctions) {
    logger.notice(`  Go runner:       child-process (bootstrap binary)`)
  }
  if (hasJavaFunctions) {
    const tagsList = Array.from(javaImages)
      .map((img) => img.replace('public.ecr.aws/lambda/java:', ''))
      .sort()
      .join(',')
    logger.notice(
      `  Java runner:     docker (public.ecr.aws/lambda/java:{${tagsList}})`,
    )
  }
  if (hasDockerFunctions && dockerImages?.size > javaImages?.size) {
    logger.notice(
      `  Docker runner:   ${Array.from(dockerImages).sort().join(', ')}`,
    )
  }

  if (scheduledCount > 0) {
    const suffix =
      disabledScheduleCount > 0 ? ` (${disabledScheduleCount} disabled)` : ''
    logger.notice(`  Scheduled functions: ${scheduledCount}${suffix}`)
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
    const {
      appPort,
      awsApiPort,
      corsAllowHeaders,
      corsAllowOrigin,
      corsDisallowCredentials,
      corsExposedHeaders,
      disableCookieValidation,
      dockerHost,
      dockerHostServicePath,
      dockerNetwork,
      dockerReadOnly,
      enforceSecureCookies,
      host,
      httpsProtocol,
      ignoreJWTSignature,
      localEnvironment,
      noAuth,
      noPrependStageInUrl,
      prefix,
      terminateIdleLambdaTime,
      useDocker,
      useInProcess,
      watchEnabled,
      webSocketHardTimeout,
      webSocketIdleTimeout,
    } = resolveOfflineOptions({ cliOptions, offline })
    const stage = getStage(serverless)
    const domainName = `${host}:${appPort}`
    // NOTE: servicePath is intentionally NOT captured here — it must be read
    // lazily each time it's needed so that bundler plugins (e.g. built-in
    // esbuild) that swap serverless.config.servicePath in their
    // before:offline:start hook are reflected correctly.
    // Detect Python functions so the boot summary advertises the python3
    // child-process runner alongside the Node runner. Uses the same regex
    // as runtime-guard.js to keep the "what counts as Python" definition
    // in one place per family.
    const functions = Object.values(serverless.service.functions ?? {})
    const artifactFor = (fn) =>
      fn.package?.artifact ?? provider.package?.artifact ?? null
    const architectureFor = (fn) =>
      fn.architecture ?? provider.architecture ?? 'x86_64'

    const hasPythonFunctions = functions.some((fn) => {
      const rt = fn.runtime ?? serverless.service.provider.runtime
      return /^python\d+\.\d+$/.test(rt ?? '')
    })
    const hasRubyFunctions = functions.some((fn) => {
      const rt = fn.runtime ?? serverless.service.provider.runtime
      return /^ruby\d+\.\d+$/.test(rt ?? '')
    })
    // Go detection covers the legacy `go1.x` runtime family and the
    // current `provided.al{,2}` custom-runtime family used by current
    // `aws-lambda-go` builds. Regex set matches runtime-guard.js so the
    // "what counts as Go" decision lives in one place per family.
    const hasGoFunctions = functions.some((fn) => {
      const rt = fn.runtime ?? serverless.service.provider.runtime ?? ''
      const artifactPath = artifactFor(fn) ?? ''
      if (/^go\d+\.x?$/.test(rt)) return true
      if (rt === 'provided.al') return true
      if (/^provided\.(al2|al2023)$/.test(rt)) {
        if (artifactPath.endsWith('.jar')) return false
        return !useDocker
      }
      return false
    })
    // Walk the service once to discover Docker-backed functions and every
    // distinct Lambda container image/platform pair we need to pull.
    const javaImages = new Set()
    const dockerImages = new Set()
    const dockerImagePulls = new Map()
    const addDockerImage = (image, architecture) => {
      dockerImages.add(image)
      const platform = architectureToDockerPlatform(architecture)
      dockerImagePulls.set(`${image}@@${platform}`, { image, platform })
    }
    for (const fn of functions) {
      const rt = fn.runtime ?? serverless.service.provider.runtime ?? ''
      const artifactPath = artifactFor(fn)
      if (
        /^java\d+(\.al2)?$/.test(rt) ||
        (artifactPath?.endsWith('.jar') && /^provided\.(al2|al2023)$/.test(rt))
      ) {
        const image = runtimeToDockerImage(rt, artifactPath)
        javaImages.add(image)
        addDockerImage(image, architectureFor(fn))
      } else if (useDocker && isDockerSupportedRuntime(rt, artifactPath)) {
        addDockerImage(
          runtimeToDockerImage(rt, artifactPath),
          architectureFor(fn),
        )
      }
    }
    const hasJavaFunctions = javaImages.size > 0
    const hasDockerFunctions = dockerImages.size > 0
    // Docker is a hard requirement when Java functions exist. The official
    // Lambda Java images include the runtime interface client; this runner
    // spawns one container per function.
    let dockerClient = null
    let ensureImageReady = null
    if (hasDockerFunctions) {
      dockerClient = new DockerClient()
      // DockerClient holds no disposable resources — the underlying
      // dockerode client owns its agent sockets internally.
      await assertDockerAvailable({ dockerClient })

      // Best-effort orphan cleanup. Never throws — boot continues even if
      // the daemon doesn't expose listContainers correctly.
      await cleanupOrphanContainers({
        dockerClient,
        log: log.get('sls:offline:docker'),
      })

      const checker = createImageReadinessChecker()
      ensureImageReady = checker.ensureImageReady
    }
    const noTimeout = cliOptions.noTimeout === true

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
    if (noAuth) {
      process.env.AUTHORIZER = '{}'
    }

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
    const hasRuntimeApiFunctions = hasGoFunctions || hasDockerFunctions
    const runtimeApiQueue = hasRuntimeApiFunctions
      ? createInvocationQueue()
      : null
    // Containers reach the host via host.docker.internal, which resolves
    // to a non-loopback IP from the container's POV. A localhost-only
    // bind would refuse the container's connection — bind to 0.0.0.0
    // when Docker-backed functions are present.
    const awsApiBindHost = hasDockerFunctions ? '0.0.0.0' : host
    if (hasDockerFunctions && host !== '0.0.0.0') {
      logger.notice(
        `awsApiPort bound to 0.0.0.0 (required for Docker-based functions to reach the Runtime API via ${dockerHost}).`,
      )
    }
    const hostRuntimeApiBase = `http://${host}:${awsApiPort}/runtime`
    const dockerRuntimeApiBase = `http://${awsApiBindHost}:${awsApiPort}/runtime`
    const runner = createRunner({
      useInProcess,
      useDocker,
      terminateIdleLambdaTime,
      docker:
        useDocker && hasDockerFunctions
          ? {
              runtimeApiBase: dockerRuntimeApiBase,
              runtimeApiQueue,
              dockerClient,
              ensureImageReady,
              servicePath: getHandlerBaseDir(serverless),
              log: log.get('sls:offline:docker'),
              dockerHost,
              dockerHostServicePath,
              dockerNetwork,
              dockerReadOnly,
            }
          : undefined,
      go: hasGoFunctions
        ? {
            runtimeApiBase: hostRuntimeApiBase,
            runtimeApiQueue,
            servicePath: getHandlerBaseDir(serverless),
            log: log.get('sls:offline:go'),
          }
        : undefined,
      java: hasJavaFunctions
        ? {
            runtimeApiBase: dockerRuntimeApiBase,
            runtimeApiQueue,
            dockerClient,
            ensureImageReady,
            servicePath: getHandlerBaseDir(serverless),
            log: log.get('sls:offline:java'),
            dockerHost,
            dockerHostServicePath,
            dockerNetwork,
            dockerReadOnly,
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
          localEnvironment,
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

    // 8b. Construct the scheduler. Construction validates every schedule
    //     expression and pre-creates croner instances (paused), so a typo'd
    //     cron throws at boot rather than failing at first tick. start() is
    //     deferred until after teardowns are registered (below).
    const scheduler = createScheduler({
      serverless,
      getLambdaFunction,
      logger: log.get('sls:offline:scheduler'),
      region: provider.region ?? FAKE_REGION,
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
      httpsProtocol,
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
          ignoreJWTSignature,
        })

        // WebSocket: shared appPort. The Hapi server's `upgrade` event
        // hands incoming WS handshakes to a dedicated ws.Server; HTTP
        // routes (management API, ALB, REST, HTTP API) coexist
        // independently — no separate websocketPort.
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
          webSocketHardTimeout,
          webSocketIdleTimeout,
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
        // registration order). ALB shares appPort.
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
          noAuth,
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
          noAuth,
          corsAllowHeaders,
          corsAllowOrigin,
          corsDisallowCredentials,
          corsExposedHeaders,
          disableCookieValidation,
          enforceSecureCookies,
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
      host: awsApiBindHost,
      handlers: { sqs: sqsHandlers },
      logger: log.get('sls:offline:aws-api'),
      // Mount the Lambda Runtime API routes when any Go function is in
      // the service. The Go runner enqueues into this queue; the routes
      // drain it via long-polling from the child bootstrap binary.
      runtimeApi: runtimeApiQueue ? { queue: runtimeApiQueue } : undefined,
      // Mount the Lambda Invoke API so a handler can call another function
      // by its deployed name via the AWS SDK against this endpoint.
      lambdaInvoke: {
        getLambdaFunction,
        functionNameMap: buildFunctionNameMap(serverless),
      },
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
    // Scheduler teardown registered BEFORE runner.terminate so LIFO drains
    // in-flight schedule invocations before runners shut down.
    orchestrator.onShutdown(() => scheduler.stop())

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

    // Pre-pull every distinct Docker image/platform pair so users see
    // download progress up-front rather than discovering it on their first
    // curl.
    if (hasDockerFunctions) {
      for (const { image, platform } of dockerImagePulls.values()) {
        await ensureImageReady({
          dockerClient,
          image,
          platform,
          log: log.get('sls:offline:docker'),
        })
      }
    }

    // Arm schedules AFTER teardowns are registered and AFTER the bundler
    // bridge has run, so the function shape is final.
    scheduler.start()

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
          useDocker,
          hasPythonFunctions,
          hasRubyFunctions,
          hasGoFunctions,
          hasJavaFunctions,
          javaImages,
          hasDockerFunctions,
          dockerImages,
          scheduledCount: scheduler.scheduledCount,
          disabledScheduleCount: scheduler.disabledCount,
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
