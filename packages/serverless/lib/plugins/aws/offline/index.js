import path from 'node:path'
import { DockerClient, log } from '@serverless/util'
import { LambdaClient } from '@aws-sdk/client-lambda'
import ServerlessError from '../../../serverless-error.js'
import { assertDockerAvailable } from './lib/runners/docker-availability.js'
import { cleanupOrphanContainers } from './lib/runners/docker-cleanup.js'
import { createImageReadinessChecker } from './lib/runners/docker-image.js'
import {
  architectureToDockerPlatform,
  isDockerSupportedRuntime,
  runtimeToDockerImage,
} from './lib/runners/docker-runtime-image.js'
import {
  LOG_NAMESPACE,
  DEFAULT_HTTP_PORT,
  DEFAULT_WEBSOCKET_PORT,
  DEFAULT_ALB_PORT,
  DEFAULT_HOST,
  DEFAULT_LAMBDA_PORT,
  DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
  DEFAULT_WATCH,
  FAKE_ACCOUNT_ID,
  FAKE_REGION,
} from './lib/constants.js'
import {
  collectUnsupportedKeys,
  CUSTOM_SERVERLESS_OFFLINE_SCHEMA,
} from './lib/plugin-compat.js'
import { getStage } from './lib/stage.js'
import { createHookBridge } from './lib/hook-bridge.js'
import { createOrchestrator } from './lib/orchestrator.js'
import { createAwsApiServer } from './lib/aws-api-server/index.js'
import { buildFunctionNameMap } from './lib/aws-api-server/lambda-invoke/name-map.js'
import {
  resolveFunctionLayers,
  uniqueLayerSets,
  layerSetKey,
} from './lib/runners/layers/layer-resolver.js'
import { downloadLayerSet } from './lib/runners/layers/layer-downloader.js'
import { createRunner } from './lib/runners/create-runner.js'
import { createInvocationQueue } from './lib/runners/invocation-queue.js'
import { createScheduler } from './lib/event-sources/schedule.js'
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
 * `--httpPort 4000` → `"4000"`), but YAML and defaults are already typed.
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
 * Resolve the file-watch toggle for the offline session.
 *
 * Precedence (highest wins):
 *   1. cli.noWatch === true            → false (explicit CLI opt-out)
 *   2. cli.watch (true/false)          → that value
 *   3. cli.reloadHandler (true/false)  → that value (serverless-offline CLI flag)
 *   4. custom.reloadHandler (true/false) → that value (serverless-offline config)
 *   5. DEFAULT_WATCH (false)           → no auto-reload, matching serverless-offline
 *
 * @param {Record<string, unknown>} cli     Normalized CLI options.
 * @param {Record<string, unknown>} custom  Normalized custom.serverless-offline config.
 * @returns {boolean}
 */
function resolveWatchEnabled(cli, custom) {
  if (cli.noWatch === true) return false
  if (cli.watch === true) return true
  if (cli.watch === false) return false
  if (cli.reloadHandler === true) return true
  if (cli.reloadHandler === false) return false
  if (custom.reloadHandler === true) return true
  if (custom.reloadHandler === false) return false
  return DEFAULT_WATCH
}

/**
 * Detect whether any function in the service declares an `alb` event. Used to
 * decide whether the dedicated ALB Hapi server is worth binding — a plain
 * HTTP-only service should not bind `albPort` or print an ALB endpoint banner.
 * Mirrors the iteration in `lib/app-server/alb/route-loader.js`
 * (`Object.prototype.hasOwnProperty.call(eventEntry, 'alb')`).
 *
 * @param {object} serverless
 * @returns {boolean}
 */
export function hasAlbEvents(serverless) {
  const functions = serverless?.service?.functions ?? {}
  for (const fn of Object.values(functions)) {
    for (const eventEntry of fn?.events ?? []) {
      if (
        eventEntry &&
        Object.prototype.hasOwnProperty.call(eventEntry, 'alb')
      ) {
        return true
      }
    }
  }
  return false
}

export function resolveOfflineOptions({
  cliOptions = {},
  pluginCustom = {},
} = {}) {
  const cli = cliOptions
  const custom = pluginCustom
  return {
    httpPort:
      coerceInt(cli.httpPort) ??
      coerceInt(custom.httpPort) ??
      DEFAULT_HTTP_PORT,
    websocketPort:
      coerceInt(cli.websocketPort) ??
      coerceInt(custom.websocketPort) ??
      DEFAULT_WEBSOCKET_PORT,
    lambdaPort:
      coerceInt(cli.lambdaPort) ??
      coerceInt(custom.lambdaPort) ??
      DEFAULT_LAMBDA_PORT,
    albPort:
      coerceInt(cli.albPort) ?? coerceInt(custom.albPort) ?? DEFAULT_ALB_PORT,
    // The cors* knobs are global overrides applied only when the user sets
    // them (CLI or custom config). Left undefined by default so each route's
    // own `cors` config — and the AWS-correct defaults it expands to — flows
    // through unchanged, keeping the offline preflight in step with deployed
    // API Gateway rather than imposing a fixed header set on every route.
    corsAllowHeaders: cli.corsAllowHeaders ?? custom.corsAllowHeaders,
    corsAllowOrigin: cli.corsAllowOrigin ?? custom.corsAllowOrigin,
    corsDisallowCredentials:
      cli.corsDisallowCredentials ?? custom.corsDisallowCredentials,
    corsExposedHeaders: cli.corsExposedHeaders ?? custom.corsExposedHeaders,
    disableCookieValidation:
      cli.disableCookieValidation ?? custom.disableCookieValidation ?? false,
    dockerHost: cli.dockerHost ?? custom.dockerHost ?? 'host.docker.internal',
    dockerHostServicePath:
      cli.dockerHostServicePath ?? custom.dockerHostServicePath ?? null,
    dockerNetwork: cli.dockerNetwork ?? custom.dockerNetwork ?? null,
    dockerReadOnly: cli.dockerReadOnly ?? custom.dockerReadOnly ?? true,
    enforceSecureCookies:
      cli.enforceSecureCookies ?? custom.enforceSecureCookies ?? false,
    host: cli.host ?? custom.host ?? DEFAULT_HOST,
    httpsProtocol: cli.httpsProtocol ?? custom.httpsProtocol,
    ignoreJWTSignature:
      cli.ignoreJWTSignature ?? custom.ignoreJWTSignature ?? false,
    localEnvironment: cli.localEnvironment ?? custom.localEnvironment ?? false,
    noAuth: cli.noAuth ?? custom.noAuth ?? false,
    noPrependStageInUrl:
      cli.noPrependStageInUrl ?? custom.noPrependStageInUrl ?? false,
    noTimeout: cli.noTimeout ?? custom.noTimeout ?? false,
    prefix: cli.prefix ?? custom.prefix,
    terminateIdleLambdaTime:
      coerceInt(cli.terminateIdleLambdaTime) ??
      coerceInt(custom.terminateIdleLambdaTime) ??
      DEFAULT_TERMINATE_IDLE_LAMBDA_TIME,
    useDocker: cli.useDocker ?? custom.useDocker ?? false,
    useInProcess: cli.useInProcess ?? custom.useInProcess ?? false,
    watchEnabled: resolveWatchEnabled(cli, custom),
    webSocketHardTimeout:
      coerceInt(cli.webSocketHardTimeout) ??
      coerceInt(custom.webSocketHardTimeout) ??
      7200,
    webSocketIdleTimeout:
      coerceInt(cli.webSocketIdleTimeout) ??
      coerceInt(custom.webSocketIdleTimeout) ??
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
 * @param {string} params.appUrl                              The HTTP API / REST endpoint.
 * @param {string | null} params.albUrl                       The ALB endpoint, or null when the ALB server was not created.
 * @param {string | null} params.wsUrl                        The WebSocket / @connections endpoint, or null when the WebSocket server was not created.
 * @param {string} params.awsApiUrl                           The Lambda endpoint (Lambda Invoke, Runtime API).
 * @param {{ method: string, path: string, functionKey: string }[]} params.httpApiRoutes
 * @param {{ method: string, path: string, mountedPath: string, apigwMountedPath: string, functionKey: string }[]} [params.restApiRoutes]
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
 * @param {string | null} [params.generatedApiKey]  An auto-generated api key to print when a private route had no configured key.
 */
function logBootSummary({
  logger,
  appUrl,
  albUrl,
  wsUrl,
  awsApiUrl,
  albRoutes,
  wsRoutes,
  httpApiRoutes,
  restApiRoutes,
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
  layerCount,
  scheduledCount,
  disabledScheduleCount,
  generatedApiKey,
}) {
  logger.notice('')
  logger.notice(`sls offline ready (stage: ${stage})`)
  logger.notice(`  HTTP endpoint:      ${appUrl}`)
  if (albUrl) {
    logger.notice(`  ALB endpoint:       ${albUrl}`)
  }
  if (wsUrl) {
    logger.notice(`  WebSocket endpoint: ${wsUrl}`)
  }
  logger.notice(`  Lambda endpoint:    ${awsApiUrl}`)
  if (generatedApiKey) {
    // A private route had no configured api key, so one was generated. Print it
    // so the user can send it as the `x-api-key` header (serverless-offline
    // parity — a local-dev convenience; deployed AWS requires a configured key).
    logger.notice(`  API key (generated, none configured): ${generatedApiKey}`)
  }
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

  if (layerCount > 0) {
    logger.notice(
      `  Layers:          ${layerCount} function(s), mounted at /opt`,
    )
  }

  if (scheduledCount > 0) {
    const suffix =
      disabledScheduleCount > 0 ? ` (${disabledScheduleCount} disabled)` : ''
    logger.notice(`  Scheduled functions: ${scheduledCount}${suffix}`)
  }

  // WebSocket routes — listed against the dedicated WebSocket endpoint.
  // Followed by the management-API mount note (the ApiGatewayManagementApi
  // endpoint clients should target, also on the WebSocket server).
  if (wsUrl && wsRoutes && wsRoutes.size > 0) {
    logger.notice('  WebSocket routes:')
    const sortedRoutes = Array.from(wsRoutes.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    const widest = Math.max(...sortedRoutes.map(([r]) => r.length))
    const wsProtocolUrl = wsUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
    for (const [route, entry] of sortedRoutes) {
      logger.notice(
        `    ${route.padEnd(widest)}  ${wsProtocolUrl}/${stage}  →  ${entry.functionKey}`,
      )
    }
    logger.notice(
      `  Management API:  ${wsUrl}/${stage}/@connections/{id}  (POST / GET / DELETE)`,
    )
  }

  // ALB routes live on their own server now, listed against the ALB endpoint.
  if (albUrl && albRoutes && albRoutes.length > 0) {
    logger.notice('  ALB routes:')
    const sorted = [...albRoutes].sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    )
    const methodWidth = Math.max(...sorted.map((r) => r.method.length))
    for (const r of sorted) {
      logger.notice(
        `    ${r.method.padEnd(methodWidth)}  ${albUrl}${r.path}  →  ${r.functionKey}`,
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

  logger.notice('')
}

/**
 * Built-in sls offline command — local dev loop for Lambda handlers
 * triggered by HTTP API, REST API, ALB, WebSocket, Schedule, and direct
 * Lambda invoke.
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

    // Register a permissive schema for the `custom.serverless-offline` block so
    // a migrating user who keeps that config doesn't trip the framework's
    // "unrecognized configuration" warning. The `custom.offline` block is also
    // registered permissively because `customAuthenticationProvider` lives there
    // (exact parity with the community serverless-offline plugin, which reads
    // that single key from `custom.offline`). This plugin is skipped whenever
    // the community `serverless-offline` plugin is in `plugins:` (it owns the
    // same registration), so this never collides. The constructor runs during
    // plugin load — before config validation — so the schema is in place in
    // time. Wrapped defensively so construction never throws on the
    // registration.
    try {
      serverless?.configSchemaHandler?.defineCustomProperties?.({
        properties: {
          'serverless-offline': CUSTOM_SERVERLESS_OFFLINE_SCHEMA,
          offline: { type: 'object', additionalProperties: true },
        },
      })
    } catch {
      // no-op: schema registration is best-effort
    }

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
    // properties. Read serverless-offline's plugin config from the canonical
    // raw-config location (`custom.serverless-offline`) so users who configure
    // the community plugin are honored by the built-in command, falling back
    // to `service.custom['serverless-offline']` for compatibility.
    const pluginCustom =
      serverless.service.initialServerlessConfig?.custom?.[
        'serverless-offline'
      ] ??
      serverless.service.custom?.['serverless-offline'] ??
      {}
    const provider = serverless.service.provider ?? {}
    const cliOptions = this.options ?? {}

    // 2. Read config values.
    //    Precedence (highest wins): CLI flag → custom.serverless-offline.<key>
    //    in YAML → built-in default. Framework's CLI parser returns option
    //    values as strings (e.g. --httpPort 4000 arrives as "4000"); coerce
    //    port strings to integers locally.
    const {
      httpPort,
      websocketPort,
      albPort,
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
      lambdaPort,
      localEnvironment,
      noAuth,
      noPrependStageInUrl,
      noTimeout,
      prefix,
      terminateIdleLambdaTime,
      useDocker,
      useInProcess,
      watchEnabled,
      webSocketHardTimeout,
      webSocketIdleTimeout,
    } = resolveOfflineOptions({ cliOptions, pluginCustom })

    // Surface serverless-offline options that the built-in command cannot
    // honor (no local equivalent). Emitted once at boot so users aren't
    // silently misled.
    const ignoredKeys = collectUnsupportedKeys({ cliOptions, pluginCustom })
    if (ignoredKeys.length > 0) {
      logger.warning(
        `Ignoring serverless-offline option(s) not supported by the built-in offline command: ${ignoredKeys.join(
          ', ',
        )}. These have no local equivalent.`,
      )
    }
    const stage = getStage(serverless)
    const domainName = `${host}:${httpPort}`
    // NOTE: servicePath is intentionally NOT captured here — it must be read
    // lazily each time it's needed so that bundler plugins (e.g. built-in
    // esbuild) that swap serverless.config.servicePath in their
    // before:offline:start:init hook are reflected correctly.
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

    // Refuse to start when two Hapi servers would bind to the same port —
    // doing so produces an opaque EADDRINUSE deep inside Hapi instead of a
    // clear actionable error. Run this check after CLI / YAML / default
    // resolution so the values we test are the ones we'd actually bind.
    // Port 0 means "let the OS assign a free port" (used by integration
    // tests) and never actually collides, so it's excluded from the check.
    const portsToCheck = [
      ['httpPort', httpPort],
      ['lambdaPort', lambdaPort],
      ['websocketPort', websocketPort],
      ['albPort', albPort],
    ]
    const seenPorts = new Map()
    for (const [name, value] of portsToCheck) {
      if (value === 0) continue
      if (seenPorts.has(value)) {
        const other = seenPorts.get(value)
        throw new ServerlessError(
          `httpPort, lambdaPort, websocketPort, and albPort must be pairwise distinct, ` +
            `but ${other} and ${name} both resolved to ${value}. ` +
            'Adjust the corresponding --httpPort / --lambdaPort / --websocketPort / --albPort ' +
            'flags or the custom.serverless-offline entries in serverless.yml.',
          'OFFLINE_PORT_COLLISION',
        )
      }
      seenPorts.set(value, name)
    }

    // 3. Resolve + download Lambda layers using the developer's real AWS
    //    credentials (env or shared-config profile). Docker-only; a per-layer
    //    failure soft-warns and never blocks boot.
    const layersDir =
      cliOptions.layersDir ??
      pluginCustom.layersDir ??
      path.join(
        serverless.serviceDir ?? process.cwd(),
        '.serverless-offline',
        'layers',
      )
    const layerLogger = log.get('sls:offline:layers')
    const { byFunction: functionLayers, skipped: skippedLayers } =
      resolveFunctionLayers(serverless)
    /** @type {Map<string, string>} functionKey -> extracted /opt dir */
    const layerOptDirs = new Map()

    for (const { functionKey, ref } of skippedLayers) {
      layerLogger.notice(
        `Function "${functionKey}" references a locally-defined layer (${JSON.stringify(
          ref,
        )}); offline supports published-ARN layers only — skipping.`,
      )
    }

    if (functionLayers.size > 0) {
      if (!useDocker) {
        layerLogger.notice(
          `${functionLayers.size} function(s) declare Lambda layers; layers require --useDocker offline and are ignored on host runners.`,
        )
      } else {
        const layerClient = new LambdaClient({
          region: provider.region ?? FAKE_REGION,
        })
        const optDirBySet = new Map()
        for (const [setKey, arns] of uniqueLayerSets(functionLayers)) {
          const { optDir } = await downloadLayerSet({
            arns,
            setKey,
            layersDir,
            lambdaClient: layerClient,
            logger: layerLogger,
          })
          optDirBySet.set(setKey, optDir)
        }
        for (const [functionKey, arns] of functionLayers) {
          layerOptDirs.set(functionKey, optDirBySet.get(layerSetKey(arns)))
        }
      }
    }

    // 4. Compute the offline runtime values injected into each invoked
    //    handler's env (IS_OFFLINE, region, and AUTHORIZER under --noAuth).
    //    These reach handler scope via the Lambda function facade — they are
    //    deliberately NOT written onto the host process.
    const offlineRuntime = {
      noAuth,
    }

    // 5. Create the runner.
    //    Worker-thread (default) receives handlerPath at invoke()-time (already
    //    fully resolved), so servicePath in workerData is unused — pass a
    //    placeholder that will be overwritten before any invocation. The real
    //    resolution happens lazily in resolveHandlerPath below, after
    //    bridge.fireInit() has run.
    //    In-process runner (--useInProcess) shares the offline server's process
    //    and ignores terminateIdleLambdaTime (no workers to recycle).
    //    When any function uses the Go runtime family, also create the shared
    //    invocation queue that bridges the runner to the AWS Lambda Runtime
    //    API routes mounted on the aws-api-server (see step 8).
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
    // when Docker-backed functions are present. (The "AWS endpoint" line in
    // the boot summary shows the resulting bind host; the rationale lives in
    // the offline docs rather than a boot notice.)
    const lambdaBindHost = hasDockerFunctions ? '0.0.0.0' : host
    const hostRuntimeApiBase = `http://${host}:${lambdaPort}/runtime`
    const dockerRuntimeApiBase = `http://${lambdaBindHost}:${lambdaPort}/runtime`
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
    // to the runner pool. Used by every trigger source (HTTP API, REST API,
    // ALB, WebSocket, Schedule, direct Lambda invoke) so the shape stays
    // consistent.
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
          layerOptDir: layerOptDirs.get(functionKey) ?? null,
          offlineRuntime,
        })
        lambdaFunctions.set(functionKey, fn)
      }
      return fn
    }

    // 6. Construct the scheduler. Construction validates every schedule
    //    expression and pre-creates croner instances (paused), so a typo'd
    //    cron throws at boot rather than failing at first tick. start() is
    //    deferred until after teardowns are registered (below).
    const scheduler = createScheduler({
      serverless,
      getLambdaFunction,
      logger: log.get('sls:offline:scheduler'),
      region: provider.region ?? FAKE_REGION,
    })

    // 7. Boot the HTTP server (Hapi v21) for REST + HTTP API traffic. ALB
    //    and WebSocket get their own Hapi servers on their own ports below.
    /** @type {{ method: string, path: string, functionKey: string }[]} */
    let albRoutes = []
    /** @type {{ method: string, path: string, functionKey: string }[]} */
    let httpApiRoutes = []
    /** @type {{ method: string, path: string, mountedPath: string, functionKey: string }[]} */
    let restApiRoutes = []
    // Detect ALB and WebSocket events up front so the dedicated servers for
    // each surface are only bound when matching events exist. A plain
    // HTTP-only service must not bind albPort / websocketPort, attach an idle
    // WebSocket upgrade handler, or print ALB / WebSocket banner lines for
    // empty servers (parity with the community serverless-offline plugin,
    // which gates #createAlb / #createWebSocket on event presence).
    const hasAlb = hasAlbEvents(serverless)
    // Compute the WebSocket route map once here and reuse it for both the
    // create-or-skip decision and route registration, so this function never
    // normalizes twice with potentially divergent results. (The WebSocket
    // server independently re-derives its own copy for dispatch.)
    const webSocketEvents = normalizeWebsocketEvents(serverless)
    const hasWebSocketEvents = webSocketEvents.size > 0
    /** @type {Map<string, { functionKey: string, authorizer?: object }>} */
    const wsRoutes = hasWebSocketEvents ? webSocketEvents : new Map()
    /** @type {{ stop: () => Promise<void> } | null} */
    let wsController = null
    // When a private route has no configured api key, the api-key store
    // generates one at boot. Surface it here so the boot summary can print it
    // for the user to copy into the `x-api-key` header. Null unless a key was
    // generated (i.e. private routes exist AND no apiGateway.apiKeys configured).
    let generatedApiKey = null
    const appServer = await createAppServer({
      port: httpPort,
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

        // Capture an auto-generated api key (private route + no configured key)
        // so the boot summary can print it. `apiKeyStore` is non-null only when
        // the api-key scheme was registered (i.e. a private route exists).
        if (authStrategies.apiKeyStore?.generated) {
          const [key] = authStrategies.apiKeyStore.keys
          generatedApiKey = key
        }

        httpApiRoutes = registerHttpApiRoutes({
          server,
          serverless,
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

    // 8. Boot the ALB server on its own port — but only when the service
    //    declares an `alb` event. ALB routes register before REST / HTTP API
    //    on their own Hapi server, so there's no longer a cross-surface
    //    path-collision ordering concern — ALB lives alone. Left null when no
    //    ALB events exist so albPort stays unbound and the banner omits it.
    const albServer = hasAlb
      ? await createAppServer({
          port: albPort,
          host,
          httpsProtocol,
          logger: log.get('sls:offline:alb'),
          async registerRoutes(server) {
            albRoutes = registerAlbRoutes({
              server,
              serverless,
              async onRequest(functionKey, event) {
                return getLambdaFunction(functionKey).invoke(event)
              },
            })
          },
        })
      : null

    // 9. Boot the WebSocket server on its own port — but only when the service
    //    declares a `websocket` event. The Hapi server's `upgrade` event hands
    //    incoming WS handshakes to a dedicated ws.Server; the
    //    ApiGatewayManagementApi (@connections) HTTP routes mount on the same
    //    server. Because WS binds its own port, the event factory derives
    //    `domainName = localhost:<websocketPort>` from the upgrade request, so
    //    handler-composed @connections endpoints target this server. Left null
    //    when no WebSocket events exist so websocketPort stays unbound, no idle
    //    upgrade handler is attached, and the banner omits it.
    const wsHapiServer = hasWebSocketEvents
      ? await createAppServer({
          port: websocketPort,
          host,
          httpsProtocol,
          logger: log.get('sls:offline:websocket'),
          async registerRoutes(server) {
            const wsRegistry = createConnectionRegistry()
            wsController = createWebSocketServer({
              hapiServer: server,
              serverless,
              onRequest: async (functionKey, event) =>
                getLambdaFunction(functionKey).invoke(event),
              registry: wsRegistry,
              stage,
              accountId: FAKE_ACCOUNT_ID,
              region: FAKE_REGION,
              noAuth,
              webSocketHardTimeout,
              webSocketIdleTimeout,
              logger: log.get('sls:offline:websocket'),
            })

            // ApiGatewayManagementApi: HTTP routes at /<stage>/@connections/{id}.
            registerManagementApiRoutes({
              hapiServer: server,
              registry: wsRegistry,
              stage,
            })
          },
        })
      : null

    // 10. Boot the AWS API server (Hapi starts listening here). It exposes the
    //    Lambda Invoke API and, when needed, the Lambda Runtime API.
    const awsApiServer = await createAwsApiServer({
      lambdaPort,
      host: lambdaBindHost,
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

    // 11. Register teardowns for the servers (LIFO — runner and
    //    watcher are added after bridge.fireInit so they appear last,
    //    meaning they are torn down first).
    //    Registration order here: awsApiServer → wsHapiServer → albServer →
    //    appServer → wsController.
    //    LIFO teardown for these: wsController, appServer, albServer,
    //    wsHapiServer, awsApiServer (uncreated servers are null-guarded).
    orchestrator.onShutdown(() => awsApiServer.stop({ timeout: 5000 }))
    orchestrator.onShutdown(() =>
      wsHapiServer ? wsHapiServer.stop({ timeout: 5000 }) : undefined,
    )
    orchestrator.onShutdown(() =>
      albServer ? albServer.stop({ timeout: 5000 }) : undefined,
    )
    orchestrator.onShutdown(() => appServer.stop({ timeout: 5000 }))
    // The WS control object closes all open sockets (code 1001) before the
    // WebSocket Hapi server tears down its listener. Order matters: shut the
    // sockets first so clients get a clean close frame, not a TCP RST.
    orchestrator.onShutdown(() =>
      wsController ? wsController.stop() : undefined,
    )
    // Scheduler teardown registered BEFORE runner.terminate so LIFO drains
    // in-flight schedule invocations before runners shut down.
    orchestrator.onShutdown(() => scheduler.stop())

    // 12. Fire the `offline:start:init` lifecycle (mirrors community
    //     `offline start`) so that bundler plugins (e.g. built-in esbuild) can
    //     bundle TS handlers and swap serverless.config.servicePath to the
    //     build output directory BEFORE the watcher resolves handler paths or
    //     the runner is used for the first time.
    await bridge.fireInit()

    // 13. Start the native file watcher AFTER fireInit so it resolves
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
    // LIFO teardown: watcher → runner → (appServer, albServer, wsHapiServer,
    // awsApiServer above).
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
        // Fire the `offline:start:ready` lifecycle once every component is up.
        await bridge.fireReady()
        // Boot summary — printed after every component is up so users get a
        // single coherent diagnostic block instead of interleaved listening
        // lines per subsystem.  `server.info.uri` is the URL Hapi actually
        // bound (matters when httpPort/lambdaPort is 0 → OS-assigned).
        logBootSummary({
          logger,
          appUrl: appServer.info.uri,
          albUrl: albServer ? albServer.info.uri : null,
          wsUrl: wsHapiServer ? wsHapiServer.info.uri : null,
          awsApiUrl: awsApiServer.info.uri,
          albRoutes,
          wsRoutes,
          httpApiRoutes,
          restApiRoutes,
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
          layerCount: layerOptDirs.size,
          scheduledCount: scheduler.scheduledCount,
          disabledScheduleCount: scheduler.disabledCount,
          generatedApiKey,
        })
      },
    })

    let shutdownError
    try {
      await shutdownPromise
    } catch (err) {
      shutdownError = err
    } finally {
      // Fire the `offline:start:end` lifecycle on shutdown so companion
      // emulators tear down (mirrors community `offline start`).
      await bridge.fireEnd()
    }
    if (shutdownError) throw shutdownError
  }
}
