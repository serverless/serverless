/**
 * `serverless dev` in functions mode: check, list the changes, attach, wait, restore. Nothing
 * changes in AWS before the list of changes is printed (and, with --approve in a terminal,
 * confirmed). From the first change on, every exit path restores: Ctrl+C, SIGTERM, SIGHUP, an
 * error, --on-exit remove. A second Ctrl+C or SIGTERM exits at once with code 3 and names what
 * is still attached; those functions keep running their deployed code (the bridge passes
 * invocations through) until the next dev, deploy, remove or dev restore.
 *
 * A stage that was never deployed is deployed first, as a normal deployment of the working copy,
 * and attached afterwards; --approve asks before each of the two. A stop during that deployment
 * lets it end and attaches nothing.
 *
 * Invocations reach this machine through AWS IoT Core: the session connects before it attaches
 * anything, and stops in this order: stop accepting, restore, let the accepted invocations finish,
 * "Dev Mode off", stop the laptop runtime, say goodbye and disconnect, sweep the session's
 * payload objects (for up to ten seconds; the next session removes what is left).
 *
 * The service's web apps run in the same session (session-web.js): read after the functions,
 * attached after them, served on this machine beside them, and restored with them on every exit
 * path. A service without web apps makes no Lambda Web call.
 *
 * This module runs the session from start to end; the checks before the plan are in
 * session-preflight.js, the changes in AWS in session-attach.js, and the running session and its
 * end in session-run.js.
 */
import _ from 'lodash'
import {
  log,
  progress as defaultProgress,
  ServerlessError,
} from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { style } from '@serverless/util/src/logger/index.js'
import { brokerRoleArn, functionKeyOf, layerName } from './naming.js'
import { buildAttachVariables } from './undo-record.js'
import {
  classifyByConfig,
  classifyFunction,
  configuredArtifactOf,
  resolvedTimeoutSeconds,
  selectFunctions,
  unattachedDevModeLayers,
} from './eligibility.js'
import { createDevModeClients, credentialProvider } from './aws.js'
import { isNewBroker } from './broker.js'
import { credentialSourceOf } from '../relay/messages.js'
import {
  findLayerVersion,
  publishedByDevMode,
  readLayerArtifact,
} from './layer.js'
import {
  checkSessions,
  createSessionLiveness,
  startRelayConnection,
} from './session-relay.js'
import { createCredentialCache } from '../relay/credentials.js'
import { openSideChannel as openRelaySideChannel } from '../relay/side-channel.js'
import * as out from './output.js'
import {
  GLOBAL_TIMERS,
  OFF_UNCHANGED,
  defaultOwner,
  guardedLogger,
  guardedProgress,
  newSessionId,
  newSessionKey,
  quiet,
} from './session-support.js'
import { createStopControl } from './session-stop.js'
import { createRestore } from './session-restore.js'
import { createAttachmentWatch } from './session-watch.js'
import {
  createApproval,
  createLayerLambda,
  nothingToAttachError,
  refuseProtectedStage,
  runPreflight,
  stackExistsWith,
} from './session-preflight.js'
import {
  attachAll,
  detectRuntimes,
  ensureAccountSetup,
  publishMissingLayers,
  readLiveFunctions,
} from './session-attach.js'
import {
  createRunState,
  endSession,
  startRunning,
  waitForStop,
} from './session-run.js'
import { detectLocalRuntimes } from '../local/adapters/index.js'
import { startLaptopRuntime } from '../local/index.js'
import { terminalWidth } from '../local/terminal-width.js'
import { startHotkeys } from '../local/hotkeys.js'
import { createReplayHandler } from '../local/replay.js'
import { createRequestReplayHandler } from '../web/replay.js'
import { createRequestRecorder } from '../state/requests.js'
import { createRequestOutput, recordingWith } from '../web/request-output.js'
import { recordFilesOf } from '../state/record-files.js'
import {
  NO_IDLE,
  createIdleTimer,
  idleStopLine,
  idleTimeoutOf,
  withIdleActivity,
} from './session-idle.js'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { getDetectedAgent } from '@serverless/util/src/agent/index.js'
import { forcedExit } from '@serverless/util/src/forced-exit/index.js'
import {
  EMPTY_RESTORE,
  createSessionLifecycle,
  newSessionRecord,
  noSessionState,
  openSessionState,
  restoreCounts,
  webAppRestoreCounts,
  sameScope,
  selectionOf,
} from '../state/session-state.js'
import {
  awsProfileOf,
  reasonOf,
  restoreAfterStopNext,
} from '../commands/envelope.js'
import { FILES, SESSION_LOG_ENV, devDirOf } from '../state/paths.js'
import { LINKED_DIR_CODE } from '../state/real-dir.js'
import { sessionStatusFields } from '../commands/status.js'
import { healthOf } from '../control/client.js'
import { endpointListsOf, endpointsOf } from '../control/endpoints.js'
import {
  externalHttpApiEndpointOf,
  webAppUrlsOf,
} from '../../info/endpoints.js'
import { mcpServersOf } from '../local/mcp.js'
import { openSessionControl } from '../control/server.js'
import { classifyWebApp } from '../web/eligibility.js'
import {
  LAMBDA_WEB_READS,
  createWebAttach,
  createWebRuntime,
  deployedWebRow,
  finalWebRow,
  readWebApps,
  runsHere,
  selectSessionWebApps,
  webAppsOf,
} from './session-web.js'
import { uploadWebBridge } from '../web/bridge-artifact.js'
import { cliCommand } from '../commands/cli-names.js'

const defaultLogger = log.get('sls:dev')
export const WATCH_INTERVAL_MS = 60_000
/** How long a restore may take before the session gives up, names what is left and exits 3. */
export const RESTORE_TIMEOUT_MS = 5 * 60_000
export { defaultOwner, newSessionId } from './session-support.js'
export { WATCH_FAILURES_BEFORE_WARNING } from './session-watch.js'

/**
 * Keeps the package settings of the service and of each function as serverless.yml has them, and
 * returns a function that puts them back. Packaging replaces them with the artifacts it wrote
 * (and, packaging individually, drops each function's package.patterns), and a build plugin reads
 * a set artifact as "do not build": after the first deployment the dev build must see the
 * configuration, not what packaging left.
 */
const keepPackageSettings = (service) => {
  const savedService = _.cloneDeep(service.package)
  const savedFunctions = service.getAllFunctions().map((key) => {
    const config = service.getFunction(key)
    return {
      config,
      had: 'package' in config,
      saved: _.cloneDeep(config.package),
    }
  })
  return () => {
    if (savedService === undefined) delete service.package
    else if (
      _.isPlainObject(service.package) &&
      _.isPlainObject(savedService)
    ) {
      // In place: what holds the service's package object sees the settings again.
      for (const key of Object.keys(service.package))
        delete service.package[key]
      Object.assign(service.package, savedService)
    } else service.package = savedService
    for (const { config, had, saved } of savedFunctions) {
      if (had) config.package = saved
      else delete config.package
    }
  }
}

const runAttachedSession = async ({
  serverless,
  provider,
  options = {},
  deps = {},
}) => {
  const stage = provider.getStage()
  refuseProtectedStage(stage)
  const region = provider.getRegion()
  // What a restore the session suggests names: its stage, region and --aws-profile.
  const scope = { stage, region, aws_profile: awsProfileOf(options) }
  // The stack's outputs, as the stack check reads them: the endpoints `dev status` lists.
  const stackOutputs = []
  const {
    clients = createDevModeClients({ provider, region }),
    logger: rawLogger = defaultLogger,
    progress = defaultProgress,
    now = Date.now,
    sleep,
    owner = defaultOwner(),
    sessionId = newSessionId(),
    // A secret: written only to the attached functions, never printed.
    sessionKey = newSessionKey(),
    processRef = process,
    readArtifact = readLayerArtifact,
    stackExists = stackExistsWith(provider, stackOutputs),
    deployStage = () => serverless.pluginManager.spawn('deploy'),
    confirm = (question) => rawLogger.confirm(question),
    onReady = () => {},
    watchIntervalMs = WATCH_INTERVAL_MS,
    restoreTimeoutMs = RESTORE_TIMEOUT_MS,
    lookup,
    isAgent = () => getDetectedAgent().isAgent,
    timers = GLOBAL_TIMERS,
    detectLocal = detectLocalRuntimes,
    startLaptop = startLaptopRuntime,
    connectRelay = startRelayConnection,
    checkSessionsLiveness = checkSessions,
    openSideChannel = openRelaySideChannel,
    // The side channel's S3 client; by default made only when a session gets that far.
    s3,
    // The session's record (see runDevSession); a session run on its own writes none.
    state = noSessionState(),
    lifecycle = createSessionLifecycle({ state }),
    ending = {},
    live = {},
    recordExit = () => {},
    // Called right before the session's own stop handlers go in (see runDevSession).
    beforeStopHandling = () => {},
    createIdle = createIdleTimer,
    startKeys = startHotkeys,
    // The clock of the signal merge window: elapsed time, so a step of the wall clock never turns
    // one stop into two.
    elapsed = () => performance.now(),
    // The web bridge zip put in the deployment bucket: `{ bucket, key }`.
    uploadBridge = () => uploadWebBridge({ provider, serverless }),
    // What the web apps' servers, local listeners and credentials requests are made with
    // (session-web.js createWebRuntime's `deps`).
    web: webDeps = {},
  } = deps
  // Set once a forced exit begins (a second Ctrl+C or SIGTERM, or a restore that ran out of time):
  // the lines it printed are the session's last, and no function update starts after them.
  let exiting = false
  const logger = guardedLogger(rawLogger, () => exiting)
  const service = serverless.service
  const keys = service.getAllFunctions()
  const selection = selectFunctions({
    names: keys,
    only: [].concat(options.function ?? []),
    skip: [].concat(options['skip-function'] ?? []),
  })
  const deployedName = (key) => service.getFunction(key).name
  // The service's web apps: none, and the session makes no Lambda Web call.
  const webApps = webAppsOf(serverless, provider)
  const webSelection = selectSessionWebApps({ webApps, options })
  const webSelected = [...webSelection.values()].some(
    ({ selected }) => selected,
  )
  // The rows of web apps none of which is selected: they are not read, and say so.
  const unselectedWebRows = () =>
    webApps.map(({ key, config }) =>
      classifyWebApp({ key, config, selection: webSelection.get(key) }),
    )
  const webAttach = webSelected
    ? createWebAttach({
        lambdaWeb: clients.lambdaWeb,
        sessionId,
        sleep,
        now,
        isExiting: () => exiting,
      })
    : null
  // What reaches the session's end and `dev status` about its web apps: their rows and, while
  // they run here, their servers' state (session-web.js).
  live.webApps = {
    rows: [],
    state: new Map(),
    // A web app's real URL: as its attach read it, else as the stack's outputs give it.
    urlOf: (key) =>
      webAttach?.resultOf(key)?.url ??
      webAppUrlsOf({ serverless, outputs: stackOutputs }).find(
        (entry) => entry.name === key,
      )?.url,
  }
  // The session's spinner: while an invocation's lines print, it sits right under them.
  const main = guardedProgress(progress.get('main'), () => exiting, {
    gap: () => logger.gap(),
    setBlankLineAbove: (on) => progress.setBlankLineAboveSpinner?.(on),
  })
  // A stop before anything changed: its spinner goes, and this is the session's outcome.
  const offUnchanged = () => {
    main.remove()
    logger.success(OFF_UNCHANGED)
  }
  // Function keys, as every line names a function.
  const nameOf = functionKeyOf(service)
  const started = now()
  logger.notice(
    `Developing "${service.service}" on stage "${stage}" ${style.aside(`(${region})`)}`,
  )
  logger.gap()

  const layerLambda = createLayerLambda({ clients, region })
  const preflight = await runPreflight({
    provider,
    clients,
    region,
    stage,
    main,
    logger,
    lookup,
    stackExists,
  })
  const { iotEndpoint, identity, brokerName, brokerPolicy, deployFirst } =
    preflight
  let { broker } = preflight

  // A new stage has no live functions yet: the runtimes it will deploy with (the function's, else
  // the provider's, else the Framework default) determine eligibility before the first deploy. An
  // existing stage is detected from its live configuration below.
  const resolvedRuntime = (key) => {
    const config = service.getFunction(key)
    return config.image ? undefined : provider.getRuntime(config.runtime)
  }
  // MCP server functions need a newer Node.js on this machine than other Node.js functions.
  const mcpFunctions = mcpServersOf(serverless)
  let localRuntimes = deployFirst
    ? await detectLocal({
        runtimes: keys.map(resolvedRuntime),
        serviceDir: serverless.serviceDir,
      })
    : null

  const approveIfAsked = createApproval({ options, logger, isAgent, confirm })
  // The plan in full when --approve asks about it; otherwise a debug line, and `line` (if any) is
  // all a person needs to know of it.
  const showPlan = (planText, line) => {
    if (options.approve) {
      logger.gap()
      logger.notice(planText)
      logger.gap()
      return
    }
    logger.debug(planText)
    if (line) {
      logger.notice(line)
      logger.gap()
    }
  }

  // Functions an update was sent to and that may carry Dev Mode configuration now, by deployed
  // name. A function whose update failed after it was sent stays here: restore reads it first
  // and changes it only if it is attached to this session.
  const touched = new Set()
  const attached = new Set()
  const settled = new Set()
  // What a forced exit reports as restored and not restored.
  ending.soFar = () => {
    const names = [...touched]
    return {
      ...EMPTY_RESTORE,
      restored:
        names.filter((name) => settled.has(name)).length +
        (webAttach?.settledCount() ?? 0),
      failed:
        names.filter((name) => !settled.has(name)).length +
        (webAttach?.pending().length ?? 0),
    }
  }
  // The web apps among them.
  ending.webSoFar = () =>
    webAttach && (webAttach.settledCount() || webAttach.pending().length)
      ? {
          ...EMPTY_RESTORE,
          restored: webAttach.settledCount(),
          failed: webAttach.pending().length,
        }
      : null
  let deploying = false
  // What a stop restores, as the hints say it: the web apps when any is attached, and the
  // functions unless only web apps are.
  const restoring = () => {
    const webApps = webAttach?.attached().length ?? 0
    return {
      functions: attached.size > 0 || webApps === 0,
      webApps: webApps > 0,
    }
  }
  // Stop handling goes in before the first change in AWS: the first deployment, or the first
  // attach. From then on every exit path restores what was attached.
  const stops = createStopControl({
    processRef,
    logger,
    main,
    // What the first stop's spinner says: the functions the restore takes back, none when they
    // stay in Dev Mode.
    stoppingText: (request) =>
      out.stoppingProgress({
        deploying,
        keep: options['on-exit'] === 'keep' || request?.keep === true,
        count:
          [...touched].filter((name) => !settled.has(name)).length +
          (webAttach?.pending().length ?? 0),
        webApps: webAttach?.pending().length ?? 0,
      }),
    // `--on-exit keep`: a forced exit names what it leaves in Dev Mode as left there.
    keepOnExit: options['on-exit'] === 'keep',
    restoring: () => restoring(),
    isDeploying: () => deploying,
    // Web apps by key. A web app's clean-up already sent may still finish while the forced exit
    // waits for the CLI; what is left, the next dev, deploy or dev restore removes.
    unsettled: () => [
      ...[...touched].filter((name) => !settled.has(name)),
      ...(webAttach?.pending() ?? []).map(out.webAppName),
    ],
    stage,
    scope,
    now: elapsed,
    timers,
    onExiting: (code) => {
      exiting = true
      // No web app attach takes another step: `main` stays where it is.
      webAttach?.abortAll()
      try {
        recordExit(code)
      } catch {
        // The exit goes on.
      }
    },
    beforeHandling: beforeStopHandling,
  })
  // A stop aborts the web app attaches still running: each stops before its next step.
  if (webAttach) void stops.stopped.then(() => webAttach.abortAll())
  // What the phases of the running session share: its record, its lifecycle records, what its end
  // reports, what the control endpoint reads and asks for, and the stop control.
  const ctx = { state, lifecycle, ending, live, stops }
  // A stop asked for before this point (`dev stop` while the session checked AWS) applies now;
  // from here on `dev stop`, the idle timeout and the `q` key reach the stop control directly.
  live.requestStop = (request) => stops.request(request)
  if (live.pendingStop) stops.request(live.pendingStop)
  const tracked = {
    getFunction: (name) => clients.lambda.getFunction(name),
    updateFunctionConfiguration: (params) => {
      // Once a forced exit named what is attached, no attach starts: that list stays true.
      if (exiting) return Promise.reject(new Error('Dev Mode is exiting'))
      touched.add(params.FunctionName)
      return clients.lambda.updateFunctionConfiguration(params)
    },
  }

  const { restoreAttached } = createRestore({
    clients,
    scope,
    logger,
    main,
    nameOf,
    sessionId,
    sleep,
    now,
    timers,
    restoreTimeoutMs,
    processRef,
    touched,
    settled,
    signalled: stops.signal,
    isExiting: () => exiting,
    webApps: webAttach,
    onExiting: (code) => {
      exiting = true
      webAttach?.abortAll()
      try {
        recordExit(code)
      } catch {
        // The exit goes on.
      }
    },
  })

  // A normal deployment of the working copy. --function, --skip-function and the web app
  // selectors choose what is attached, not what the deployment ships, so the deploy plugins do
  // not see them; and devmodeEnabled stays unset, so bundling and packaging behave exactly as in
  // `deploy`. The package settings packaging replaces are put back afterwards, for the dev build.
  const deployWorkingCopy = async () => {
    const scoped = [
      'function',
      'f',
      'skip-function',
      'web-app',
      'skip-web-app',
      'local-only',
    ]
    const saved = Object.fromEntries(
      scoped.filter((key) => key in options).map((key) => [key, options[key]]),
    )
    for (const key of scoped) delete options[key]
    const restorePackageSettings = keepPackageSettings(service)
    const deployStarted = now()
    deploying = true
    try {
      await deployStage()
    } finally {
      deploying = false
      Object.assign(options, saved)
      restorePackageSettings()
      // The deploy plugins leave their last step on the shared progress line.
      main.remove()
    }
    // The outcome line `serverless deploy` prints.
    logger.success(
      `Service deployed to stack ${provider.naming.getStackName()} ${style.aside(`(${Math.round((now() - deployStarted) / 1000)}s)`)}`,
    )
    logger.gap()
  }

  // The developer's credentials as the relay reads them: for the check of other sessions, then
  // for every AWS IoT Core connect.
  const credentials = createCredentialCache({
    resolve: credentialProvider(provider),
  })

  // While the session waits, the attached functions are read every watchIntervalMs, and each one
  // found changed is reported once (see session-watch.js).
  // The web apps attached, as the watch reads them (filled once they are).
  const watchedWebApps = []
  const watch = createAttachmentWatch({
    clients,
    scope,
    logger,
    sessionId,
    owner,
    nameOf,
    attached,
    timers,
    watchIntervalMs,
    isStopping: () => Boolean(stops.signal()),
    onLost: (change) =>
      lifecycle.lost({
        name: nameOf(change.name),
        state: change.state,
        why: out.lostWhy(change),
      }),
    ...(webAttach && {
      webApps: watchedWebApps,
      onWebAppLost: (change) =>
        lifecycle.webAppLost({
          ...change,
          why: out.lostWebAppWhy({ ...change, you: owner }),
        }),
    }),
  })

  let attachFailed = false
  let brokerIsNew = false
  const run = createRunState({ logger, ctx, detailed: options.detailed })
  // A detached session stops after its idle timeout; a session in a terminal never does.
  const idleMs = idleTimeoutOf(options)
  const idle = idleMs
    ? createIdle({
        timeoutMs: idleMs,
        timers,
        now,
        // An invocation or a web app request still being handled on this machine is activity,
        // however long it takes: one the relay accepted, one a handler process runs (a replay
        // too), or a web request a local server has not answered to the end.
        isBusy: () =>
          (run.laptop?.relay?.inFlight?.() ?? 0) > 0 ||
          (live.webRuntime?.inFlight?.() ?? 0) > 0 ||
          (run.laptop?.runtime?.workers?.() ?? []).some(
            (worker) => worker.busy,
          ),
        onIdle: () => {
          logger.notice(idleStopLine(idleMs, out.restoresWhat(restoring())))
          live.requestStop({ trigger: 'idle_timeout' })
        },
      })
    : NO_IDLE
  live.idle = idle
  // The control server calls this on every authenticated status, replay and touch request.
  live.onActivity = () => idle.touch()
  // Invocation and reload records are activity too: everything that writes records takes the
  // wrapped log from here (the recorder, the laptop runtime's reload records, the relay).
  if (idleMs) state.events = withIdleActivity(state.events, idle)
  // `serverless dev replay`: the control endpoint reaches the laptop runtime through `live`.
  live.replay = createReplayHandler({
    serviceDir: serverless.serviceDir,
    scope,
    runtime: () => run.laptop?.runtime ?? null,
    recorder: () => live.recorder ?? null,
    isStopping: () => run.isStopping(),
    logger,
    now,
    timers,
  })
  // `serverless dev replay` of a web request: it reaches the web apps' servers through `live`.
  live.replayRequest = createRequestReplayHandler({
    serviceDir: serverless.serviceDir,
    runtime: () => live.webRuntime ?? null,
    recorder: () => live.requestRecorder ?? null,
    isStopping: () => run.isStopping(),
    logger,
    timers,
  })
  // The artifacts serverless.yml deploys functions from, read before the first deployment
  // packages anything (packaging sets one on every function it zips).
  const configuredArtifacts = new Map(
    keys.map((key) => [
      key,
      configuredArtifactOf({
        config: service.getFunction(key),
        servicePackage: service.package,
      }),
    ]),
  )
  try {
    if (deployFirst) {
      main.remove()
      // Nothing is deployed for a session that could attach nothing: what serverless.yml alone
      // rules out is known before the deployment.
      const byConfig = keys.map((key) => {
        const config = service.getFunction(key)
        return classifyByConfig({
          name: key,
          config,
          runtime: resolvedRuntime(key),
          timeout: resolvedTimeoutSeconds(config, service.provider),
          selection: selection.get(key),
          localRuntimes,
          mcp: mcpFunctions.has(key),
          artifact: configuredArtifacts.get(key),
          serviceDir: serverless.serviceDir,
        })
      })
      // A web app selected has its own rows (read once the stage is deployed).
      if (byConfig.every(Boolean) && !webSelected) {
        const notSelected = unselectedWebRows()
        logger.notice(out.renderModeTable(byConfig, notSelected))
        lifecycle.modes(byConfig)
        lifecycle.webModes(notSelected)
        throw nothingToAttachError({ webApps: webApps.length > 0 })
      }
      showPlan(
        out.renderPlan({
          plan: out.buildPlan({
            stage,
            deployFirst: true,
            brokerName,
            brokerExists: Boolean(broker),
            brokerPolicy,
            missingLayers: [],
            devRows: [],
          }),
          region,
        }),
        out.deployFirstLine(stage),
      )
      // A `dev stop` that came while the session checked AWS: nothing to ask about, nothing is
      // deployed.
      if (stops.signal()) {
        offUnchanged()
        return 0
      }
      if (!(await approveIfAsked())) {
        logger.notice('Nothing was changed.')
        return 0
      }
      stops.handleStops()
      // A `dev stop` that came while the question was asked.
      if (stops.signal()) {
        offUnchanged()
        return 0
      }
      await deployWorkingCopy()
      if (stops.signal()) {
        offUnchanged()
        return 0
      }
      // The stack's outputs (the endpoints) exist now.
      await stackExists().catch((error) =>
        logger.debug(
          `Dev Mode could not read the outputs of the new stack: ${error?.message ?? error}`,
        ),
      )
    }

    // Until the broker exists its ARN and ExternalId are placeholders of the final length, so the
    // environment budget is checked against what will really be written. The session key and the
    // endpoint are the real values. Never log or print this object: it holds the key.
    const session = {
      id: sessionId,
      owner,
      attachedAt: Math.floor(now() / 1000),
      broker: broker ?? {
        arn: brokerRoleArn({ identity, name: brokerName }),
        externalId: '0'.repeat(32),
      },
      key: sessionKey.toString('base64'),
      iotEndpoint,
    }
    const attachVariables = (variables, otherLayerArns) =>
      buildAttachVariables({ live: variables, otherLayerArns, session })
    // Whether the other sessions found on the functions are running: asked before anything
    // changes, and again for a session found on a function when its write is retried.
    const liveness = createSessionLiveness({
      sessionId,
      iotEndpoint,
      region,
      credentials,
      check: checkSessionsLiveness,
      logger,
      timers,
    })
    // Set once the functions are read: Dev Mode layers left without their wrapper (see below).
    let devModeLayerVersions = new Set()
    const classify = (key, live) =>
      classifyFunction({
        name: key,
        config: service.getFunction(key),
        live,
        context: {
          selection: selection.get(key),
          sessionId,
          owner,
          takeOver: Boolean(options['take-over']),
          attachVariables,
          localRuntimes,
          liveness: liveness.known,
          mcp: mcpFunctions.has(key),
          devModeLayerVersions,
          artifact: configuredArtifacts.get(key),
          serviceDir: serverless.serviceDir,
        },
      })

    main.notice(`Reading ${out.functionsWord(keys.length)}`)
    const lives = await readLiveFunctions({
      keys,
      selection,
      clients,
      deployedName,
    })
    localRuntimes = await detectRuntimes({
      lives,
      localRuntimes,
      detectLocal,
      serviceDir: serverless.serviceDir,
    })
    await liveness.start(lives)
    devModeLayerVersions = await publishedByDevMode({
      lambda: layerLambda,
      layerArns: unattachedDevModeLayers(lives.values()),
      logger,
    })
    let rows = keys.map((key) => classify(key, lives.get(key)))
    const devRows = rows.filter((row) => row.mode === 'dev')
    let webRows = webAttach ? [] : unselectedWebRows()
    let webDetails = new Map()
    if (webAttach) {
      main.notice('Reading web apps')
      let denied
      ;({
        rows: webRows,
        details: webDetails,
        denied,
      } = await readWebApps({
        lambdaWeb: clients.lambdaWeb,
        webApps,
        selection: webSelection,
        serviceDir: serverless.serviceDir,
        liveness,
        context: {
          sessionId,
          owner,
          takeOver: Boolean(options['take-over']),
        },
      }))
      live.webApps.rows = webRows
      // Web functions this session may not read: they run the deployed code, the functions here.
      if (denied) {
        if (!devRows.length) {
          throw new ServerlessError(
            `Dev Mode could not read the web apps of this stage: your AWS credentials need ${LAMBDA_WEB_READS} on their web functions. Allow them, then run "${cliCommand('dev')}" again.`,
            'DEV_MODE_WEB_ACCESS_DENIED',
            { stack: false },
          )
        }
        logger.warning(
          `Web apps run the deployed code: your AWS credentials need ${LAMBDA_WEB_READS} on their web functions to run them here.`,
        )
        logger.debug(
          `Dev Mode could not read the web apps: ${denied?.message ?? denied}`,
        )
      }
    }
    if (devRows.length === 0 && !webRows.some(runsHere)) {
      main.remove()
      logger.gap()
      logger.notice(out.renderModeTable(rows, webRows))
      lifecycle.modes(rows)
      lifecycle.webModes(webRows)
      throw nothingToAttachError({ webApps: webApps.length > 0 })
    }
    const artifacts = await Promise.all(
      [...new Set(devRows.map((row) => row.arch))].map((arch) =>
        readArtifact(arch),
      ),
    )
    const layerArns = {}
    for (const artifact of artifacts) {
      layerArns[artifact.arch] = await findLayerVersion({
        lambda: layerLambda,
        artifact,
        logger,
      })
    }
    const plan = out.buildPlan({
      stage,
      deployFirst: false,
      brokerName,
      brokerExists: Boolean(broker),
      brokerPolicy,
      missingLayers: artifacts
        .filter((a) => !layerArns[a.arch])
        .map((a) => layerName(a.arch)),
      devRows,
      webRows,
      widenBroker: Boolean(broker) && !broker.widened && webRows.some(runsHere),
    })
    main.remove()
    showPlan(out.renderPlan({ plan, region }))
    // A `dev stop` that came while the session checked AWS: nothing to ask about.
    if (stops.signal()) {
      offUnchanged()
      return 0
    }
    if (!(await approveIfAsked())) {
      logger.notice(
        deployFirst
          ? 'Stage deployed; nothing attached.'
          : 'Nothing was changed.',
      )
      return 0
    }
    stops.handleStops()
    // A stop that came while the first deployment ran or the functions were read: nothing is
    // attached, and the account setup is left for the next session.
    if (stops.signal()) {
      offUnchanged()
      return 0
    }
    serverless.devmodeEnabled = true

    let policyRepaired
    const setUp = (webAppsHere) =>
      ensureAccountSetup({
        broker,
        brokerPolicy,
        brokerName,
        identity,
        region,
        clients,
        main,
        logger,
        session,
        ...(webAppsHere && { webApps: true }),
      })
    const widenedBefore = Boolean(broker?.widened)
    const webAppsHere = webRows.some(runsHere)
    try {
      ;({ broker, policyRepaired } = await setUp(webAppsHere))
    } catch (error) {
      // The role cannot serve web apps: they run the deployed code, the functions run here.
      if (error?.code !== 'DEV_MODE_BROKER_UPDATE_DENIED' || !devRows.length) {
        throw error
      }
      logger.warning(error.message)
      webRows = webRows.map((row) =>
        runsHere(row)
          ? deployedWebRow(
              row,
              'broker_update_denied',
              `the IAM role ${brokerName} does not serve web apps yet (${cliCommand(`dev setup --region ${region}`)})`,
            )
          : row,
      )
      live.webApps.rows = webRows
      ;({ broker, policyRepaired } = await setUp(false))
    }
    // A trust widened now may take a while to reach every AWS Region's endpoints, as a new role.
    const brokerWidened =
      webRows.some(runsHere) &&
      Boolean(broker.widened) &&
      !widenedBefore &&
      !broker.created
    // A role an earlier start created moments ago is as new as one created now: the set-up line
    // names it with its age, and the note says it can take a while to work.
    brokerIsNew = isNewBroker(broker, now())
    // Connected before anything is attached: a missing AWS IoT Core permission fails the session
    // while no function has changed.
    if (stops.signal()) {
      offUnchanged()
      return 0
    }
    main.notice('Connecting to AWS IoT Core')
    run.relayConnection = await connectRelay({
      region,
      iotEndpoint,
      sessionId,
      sessionKey,
      resolveCredentials: credentialProvider(provider),
      credentials,
      credentialSource: credentialSourceOf(provider),
      logger,
      spinner: main,
      timers,
      now,
      record: (type, fields) => state.events.emit(type, fields),
    })
    if (stops.signal()) {
      offUnchanged()
      return 0
    }
    const publishedLayers = await publishMissingLayers({
      artifacts,
      layerArns,
      layerLambda,
      main,
    })
    // The web bridge, once per session, for the dev revisions.
    let bridge = null
    if (webRows.some(runsHere)) {
      try {
        bridge = await uploadBridge()
      } catch (error) {
        webRows = webRows.map((row) =>
          runsHere(row)
            ? finalWebRow(row, { status: 'failed', message: error.message })
            : row,
        )
        live.webApps.rows = webRows
        if (!devRows.length) throw error
        logger.warning(
          `Web apps run the deployed code: ${error?.message ?? error}`,
        )
      }
    }
    const setupLine = out.accountSetupDoneLine({
      region,
      createdRole: broker.created ? brokerName : null,
      usedRole:
        brokerIsNew && !broker.created
          ? { name: brokerName, createdAt: broker.createdAt }
          : null,
      nowMs: now(),
      repairedRole: policyRepaired ? brokerName : null,
      layers: publishedLayers,
    })

    const attachStarted = now()
    const outcomes = await attachAll({
      devRows,
      deployedName,
      tracked,
      layerArns,
      sleep,
      now,
      liveness,
      classify,
      attachVariables,
      stops,
      attached,
      touched,
      main,
    })
    // The web apps, once the functions are attached: each in parallel.
    const webOutcomes =
      webAttach && webRows.some(runsHere) && !stops.signal()
        ? await webAttach.attachAll({
            rows: webRows,
            details: webDetails,
            bridge,
            session,
            onAttached: (entry) =>
              watchedWebApps.push({
                key: entry.key,
                functionName: entry.functionName,
                localOnly: entry.localOnly,
              }),
          })
        : new Map()
    webRows = webRows.map((row) =>
      runsHere(row) && !webOutcomes.has(row.webApp)
        ? finalWebRow(row, { status: 'not_started' })
        : finalWebRow(row, webOutcomes.get(row.webApp)),
    )
    live.webApps.rows = webRows
    const webAttached = webRows.filter(runsHere)
    main.remove()
    // What the local runtime starts from: the configuration each attach wrote against.
    for (const [key, outcome] of outcomes) {
      if (outcome.status === 'attached' && outcome.live) {
        lives.set(key, outcome.live)
      }
    }
    rows = rows.map((row) => out.finalRow(row, outcomes.get(row.function)))
    attachFailed = [...rows, ...webRows].some(
      (row) => row.reason === 'attach_failed',
    )
    lifecycle.modes(rows)
    lifecycle.webModes(webRows)
    if (setupLine) {
      logger.notice(setupLine)
      logger.gap()
    }

    if (!stops.signal() && attached.size === 0 && !webAttached.length) {
      // The table says why for each function and web app.
      logger.notice(out.renderModeTable(rows, webRows))
      logger.gap()
      const result = await restoreAttached()
      ending.restore = restoreCounts(result)
      ending.webApps = webAppRestoreCounts(result)
      if (attachFailed || result.failed.length) {
        const message = `No function${webRows.length ? ' or web app' : ''} could be attached.`
        logger.error(message)
        ending.failure = { reason: 'attach_incomplete', message }
        return 3
      }
      throw nothingToAttachError({ webApps: webApps.length > 0 })
    }
    // The web apps' servers on this machine, once they are attached.
    const web = webAttached.length
      ? (() => {
          // Every web request that runs here gets its file and records (when the session has a
          // record); its files count toward the invocation files' limits.
          live.requestRecorder =
            state.requestRecorder ??
            (state.dir
              ? createRequestRecorder({
                  dir: state.dir,
                  now,
                  events: state.events,
                  files: recordFilesOf(state, {
                    onError: (error) =>
                      logger.debug(
                        `Dev Mode could not remove an old request file: ${error?.message ?? error}`,
                      ),
                  }),
                  stage,
                  onError: (error) =>
                    logger.debug(
                      `Dev Mode could not write a web request file: ${error?.message ?? error}`,
                    ),
                  onWarning: (line) => logger.warning(line),
                })
              : null)
          // Each request's lines, as the invocations' (local/index.js): the spinner sits right
          // under them while a request runs.
          // A function's reload spinner goes before a web request's line, as before an
          // invocation's (local/index.js takeTerminal).
          const takeTerminal = () => {
            run.laptop?.clearSpinner?.()
            main.hold()
          }
          const requestOutput = createRequestOutput({
            write: (line) => {
              takeTerminal()
              logger.notice(line)
            },
            idle: () => main.release(),
            width: () => terminalWidth(processRef),
            detailed: () => run.detailed,
            now,
          })
          const runtime = createWebRuntime({
            serverless,
            region,
            logger,
            timers,
            now,
            processRef,
            events: state.events,
            recorder: recordingWith(live.requestRecorder, requestOutput),
            developerCredentials: () => credentials.refresh(),
            options,
            // A function's reload spinner goes before a server's line too.
            serverLine: (line) => {
              run.laptop?.clearSpinner?.()
              logger.notice(line)
            },
            deps: webDeps,
          })
          live.webApps.state = runtime.state
          live.webRuntime = runtime
          const results = new Map(
            webAttached.map((row) => [
              row.webApp,
              webAttach.resultOf(row.webApp),
            ]),
          )
          return {
            runtime,
            relay: runtime.relayOptions({
              rows: webAttached,
              details: webDetails,
            }),
            start: { rows: webAttached, details: webDetails, results },
          }
        })()
      : null
    if (!stops.signal()) {
      await startRunning({
        web,
        run,
        rows,
        lives,
        localRuntimes,
        deployedName,
        openSideChannel,
        startLaptop,
        provider,
        serverless,
        options,
        sessionId,
        sessionKey,
        s3,
        logger,
        timers,
        now,
        processRef,
        ctx,
        spinner: main,
      })
    }
    // A signal during the first build goes directly to restore, before readiness notices.
    if (!stops.signal()) {
      // Set before the session is on, so `dev status` lists them from its first answer and the
      // ready lines name them, in the lines `deploy` and `info` print for them. A configuration
      // they cannot be read from leaves the list empty; the session runs on.
      const mcpServers = [...mcpServersOf(serverless).values()]
      // An HTTP API that provider.httpApi.id names has no stack output: its URL comes from AWS, as
      // for `serverless info`. A failed lookup leaves its endpoints out.
      const externalHttpApiEndpoint = await externalHttpApiEndpointOf({
        provider,
        service,
      }).catch((error) => {
        logger.debug(
          `Dev Mode could not look up the HTTP API that provider.httpApi.id names, so its endpoints are not listed: ${error?.message ?? error}`,
        )
        return undefined
      })
      try {
        live.endpoints = endpointsOf({
          service,
          outputs: stackOutputs,
          naming: provider.naming,
          mcpServers,
          externalHttpApiEndpoint,
        })
        const lists = endpointListsOf({
          serverless,
          outputs: stackOutputs,
          naming: provider.naming,
          mcpServers,
          externalHttpApiEndpoint,
        })
        live.endpointText = lists.text
        live.endpointRows = lists.rows
      } catch (error) {
        logger.debug(
          `Dev Mode could not list the endpoints: ${error?.message ?? error}`,
        )
      }
      await waitForStop({
        rows,
        endpointRows: live.endpointRows,
        attachedCount: attached.size,
        total: keys.length,
        started,
        attachStarted,
        brokerIsNew,
        brokerWidened,
        watch,
        watchIntervalMs,
        stops,
        onReady,
        logger,
        timers,
        now,
        ctx,
        run,
        options,
        processRef,
        startKeys,
        webApps: webApps.length
          ? {
              rows: webRows,
              state: live.webApps.state,
              urlOf: live.webApps.urlOf,
              total: webApps.length,
            }
          : null,
      })
    }
    return await endSession({
      run,
      options,
      restoreAttached,
      attached,
      attachFailed,
      serverless,
      service,
      stage,
      region,
      confirm,
      stops,
      logger,
      ctx,
      isExiting: () => exiting,
      ...(webAttach && {
        keptWebApps: () => webAttach.attached().length,
        keepAttachedWebApps: async () => {
          const { failed } = await webAttach.keepAttached()
          const lines = failed.length
            ? out.notRestoredLines(failed, { scope })
            : []
          for (const [level, text] of lines) logger[level](text)
          return failed.length
        },
      }),
    })
  } catch (error) {
    // An error ends a running session; one before it was ready is its failure (the wrapper's record).
    run.beginStop(
      run.stopInfo() ?? (lifecycle.isReady ? { trigger: 'error' } : null),
    )
    if (touched.size === 0 && !webAttach?.pending().length) throw error
    const result = await restoreAttached({ beforeReport: run.finishLaptop })
    ending.restore = restoreCounts(result)
    ending.webApps = webAppRestoreCounts(result)
    if (result.failed.length) {
      logger.error(error.message)
      ending.failure = { reason: reasonOf(error), message: error.message }
      return 3
    }
    throw error
  } finally {
    // The session has ended: a `dev stop` that arrives while it tears down changes nothing.
    stops.finish()
    // An idle timer never outlives the session, whichever way it ended.
    idle.stop()
    await run.teardown()
    stops.done()
  }
}

/** The signals that end a session at once before its first change (see runDevSession). */
const EARLY_STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']

/**
 * The file-system errors that leave a session without its record (a directory it may not write, a
 * read-only or full disk, a link in the place of `.serverless/dev`): a session in a terminal runs,
 * says so, and `dev status`/`dev stop` cannot reach it; a session started with --detach ends its
 * start. Any other failure of the claim fails the start.
 */
const RECORD_IO_ERRORS = new Set([
  'EACCES',
  'EPERM',
  'EROFS',
  'ENOSPC',
  LINKED_DIR_CODE,
])

/**
 * `serverless dev` in functions mode, with its on-disk record: `session.json` is claimed right
 * after the stage check and the selection, before any AWS call. A session already running here
 * for the same stage, region and functions is reported (exit 0); one for another scope is an
 * error. From the claim on, the session writes its event log and ends with `session.ended`,
 * after which the session file is deleted.
 */
export const runDevSession = async ({
  serverless,
  provider,
  options = {},
  deps = {},
}) => {
  const stage = provider.getStage()
  refuseProtectedStage(stage)
  const region = provider.getRegion()
  const {
    logger: rawLogger = defaultLogger,
    now = Date.now,
    owner = defaultOwner(),
    sessionId = newSessionId(),
    processRef = process,
    timers = GLOBAL_TIMERS,
    pid = process.pid,
    openState = openSessionState,
    openControl = openSessionControl,
    env = process.env,
  } = deps
  const logger = guardedLogger(rawLogger)
  const service = serverless.service
  // A session process (`--detach`) is detached, writes its output to session.log and may stop
  // when idle; a session in a terminal is none of these.
  const detached = Boolean(options['session-process'])
  // The name of the log the --detach launcher started this process with, read once and taken out
  // of this process's environment, so no handler worker or other child ever inherits it.
  const ownLog = detached ? env[SESSION_LOG_ENV] : undefined
  delete env[SESSION_LOG_ENV]
  const idleMs = idleTimeoutOf(options)
  // A --function that is not in serverless.yml fails here, before anything is written.
  selectFunctions({
    names: service.getAllFunctions(),
    only: [].concat(options.function ?? []),
    skip: [].concat(options['skip-function'] ?? []),
  })
  // So is a --web-app, --skip-web-app or --local-only that names no web app of it.
  selectSessionWebApps({ webApps: webAppsOf(serverless, provider), options })
  const selection = selectionOf(options)
  let state = deps.state
  if (!state) {
    try {
      // A session file found here names a live session only when its endpoint answers for it.
      const dir = serverless.serviceDir ? devDirOf(serverless.serviceDir) : null
      state = await openState({
        serviceDir: serverless.serviceDir,
        record: newSessionRecord({
          sessionId,
          pid,
          service: service.service,
          stage,
          region,
          owner,
          selection,
          detached,
          idleTimeoutS: idleMs ? idleMs / 1000 : null,
          logFile: detached ? FILES.log : null,
          startedAt: now(),
          cliVersion: serverless.version ?? null,
          awsProfile: awsProfileOf(options),
          takeOver: Boolean(options['take-over']),
          onExit: options['on-exit'],
        }),
        now,
        timers,
        health: dir ? healthOf({ dir, timers }) : undefined,
        // A session file that names this process is stale, never a running session.
        selfPid: pid,
        // The log the --detach launcher started this process with, once it holds the directory.
        ...(ownLog && { ownLog }),
        onError: (error) =>
          logger.debug(
            `Dev Mode could not write its event log: ${error?.message ?? error}`,
          ),
      })
    } catch (error) {
      // Other starts keep taking the place: one session per directory, so this start fails.
      if (error?.reason === 'session_running') {
        throw Object.assign(
          new ServerlessError(error.message, 'DEV_MODE_SESSION_RUNNING', {
            stack: false,
          }),
          { next: [out.SESSION_RUNNING_NEXT] },
        )
      }
      if (!RECORD_IO_ERRORS.has(error?.code)) throw error
      // A session in the background is reached only through its record: without it the start
      // ends, before anything changes in AWS. Its message goes to the log the launcher shows.
      if (detached) {
        throw new ServerlessError(
          out.detachedRecordUnavailableMessage(error),
          'DEV_MODE_RECORD_UNAVAILABLE',
          { stack: false },
        )
      }
      logger.warning(out.recordUnavailableLine(error))
      state = noSessionState()
    }
  }
  if (!state.claimed) {
    const { existing } = state
    // A session no command can reach is never joined or replaced: it is stopped where it runs.
    if (existing.control_unavailable) {
      throw Object.assign(
        new ServerlessError(
          out.sessionUnreachableLine(existing),
          'DEV_MODE_SESSION_RUNNING',
          { stack: false },
        ),
        { next: [restoreAfterStopNext(existing)] },
      )
    }
    if (sameScope(existing, { stage, region, selection })) {
      // A session that is stopping is not one to join: it is about to restore and end.
      if (existing.state === 'stopping') {
        throw Object.assign(
          new ServerlessError(
            out.sessionStoppingLine(existing),
            'DEV_MODE_SESSION_RUNNING',
            { stack: false },
          ),
          { next: [out.SESSION_STOPPING_NEXT] },
        )
      }
      logger.notice(
        existing.state === 'starting'
          ? out.sessionHereLine(existing)
          : out.alreadyRunningLine(existing),
      )
      const kept = out.keptSettingsLine({ record: existing, options })
      if (kept) logger.notice(kept)
      return 0
    }
    throw Object.assign(
      new ServerlessError(
        out.sessionRunningLine(state.existing),
        'DEV_MODE_SESSION_RUNNING',
        { stack: false },
      ),
      { next: [out.SESSION_RUNNING_NEXT] },
    )
  }
  const lifecycle = createSessionLifecycle({ state, now })
  const awsProfile = awsProfileOf(options)
  lifecycle.starting({
    service: service.service,
    stage,
    region,
    ...(awsProfile && { aws_profile: awsProfile }),
    owner,
    pid,
    detached,
    selection,
  })
  // What the inner session found out, for the last record.
  const ending = {
    restore: null,
    webApps: null,
    kept: false,
    failure: null,
    soFar: null,
    webSoFar: null,
  }
  // What the control endpoint reports and asks for; the running session fills it in through
  // `ctx.live`. A stop asked for before the stop control exists waits in `pendingStop`.
  const live = {
    recorder: null,
    endpoints: [],
    endpointText: undefined,
    endpointRows: undefined,
    control: null,
    pendingStop: null,
    requestStop(request) {
      live.pendingStop ??= request
    },
    onActivity() {},
    status: () =>
      sessionStatusFields({
        record: state.sessionFile.record,
        rows: lifecycle.rows,
        webApps: {
          rows: lifecycle.webRows,
          state: live.webApps?.state,
          urlOf: live.webApps?.urlOf,
        },
        recorder: live.recorder,
        requestRecorder: live.requestRecorder,
        endpoints: live.endpoints,
        endpointText: live.endpointText,
        endpointRows: live.endpointRows,
        cursor: state.events.lastCursor(),
      }),
  }
  const end = (exitCode) =>
    lifecycle.ended({
      exitCode,
      restore: ending.restore ?? ending.soFar?.() ?? EMPTY_RESTORE,
      webApps: ending.restore ? ending.webApps : ending.webSoFar?.(),
      kept: ending.kept,
    })
  // From the claim until the session's own stop handling goes in, right before its first change in
  // AWS, a Ctrl+C, SIGTERM or hang-up ends it at once: nothing was changed, so its last record says
  // nothing was restored, and its record goes. Where the exit does not end the process, the stop
  // it asks for keeps the session from changing anything.
  let earlyStopOn = true
  const disposeEarlyStop = () => {
    if (!earlyStopOn) return
    earlyStopOn = false
    for (const name of EARLY_STOP_SIGNALS) processRef.off(name, earlyStop)
  }
  // A Ctrl+C that the checks' spinner passes on has no signal name: a SIGINT (see signals.js).
  const earlyStop = (signal = 'SIGINT') => {
    disposeEarlyStop()
    live.requestStop({ trigger: 'signal', signal })
    // The checks' spinner goes first: the outcome line is the session's last.
    quiet(() => (deps.progress ?? defaultProgress).get('main').remove())
    logger.success(OFF_UNCHANGED)
    lifecycle.stopping({ trigger: 'signal', signal })
    lifecycle.ended({ exitCode: 0, restore: EMPTY_RESTORE })
    void live.control?.close()
    forcedExit({ code: 0, processRef, timers })
  }
  for (const name of EARLY_STOP_SIGNALS) processRef.on(name, earlyStop)
  // A session started with --detach whose control endpoint could not open (see below).
  let controlFailure = null
  if (state.dir) {
    try {
      live.control = await openControl({
        dir: state.dir,
        sessionFile: state.sessionFile,
        sessionId,
        logger,
        timers,
        // Each handler reads `live` when it is called: later parts of the session replace them.
        handlers: {
          health: () => ({
            state: state.sessionFile.record?.state ?? 'starting',
          }),
          status: () => live.status(),
          stop: ({ keep }) =>
            live.requestStop({ trigger: 'stop_command', keep }),
          replay: ({ request_id, kind }) => {
            if (kind === 'request') {
              if (!live.replayRequest) {
                throw new Error(
                  `Dev Mode is still starting; replay once "${cliCommand('dev wait --for ready')}" returns.`,
                )
              }
              return live.replayRequest(request_id)
            }
            if (!live.replay) {
              throw new Error(
                `Dev Mode is still starting; replay once "${cliCommand('dev wait --for ready')}" returns.`,
              )
            }
            return live.replay(request_id)
          },
          touch: () => live.onActivity(),
        },
      })
    } catch (error) {
      if (detached) {
        // A session in the background is reached only through its endpoint: without it the start
        // fails, before anything changes in AWS.
        controlFailure = new ServerlessError(
          out.detachedControlUnavailableMessage(error),
          'DEV_MODE_CONTROL_UNAVAILABLE',
          { stack: false },
        )
      } else {
        logger.warning(out.controlUnavailableLine(error))
        // Without an endpoint the record must never look like a session that is still starting.
        state.sessionFile.update({ control_unavailable: true })
      }
    }
  }
  let exitCode = 1
  try {
    if (controlFailure) throw controlFailure
    exitCode = await runAttachedSession({
      serverless,
      provider,
      options,
      deps: {
        ...deps,
        logger: rawLogger,
        now,
        owner,
        sessionId,
        timers,
        processRef,
        state,
        lifecycle,
        ending,
        live,
        // A forced exit (a second Ctrl+C, a restore past its time limit) writes the last record
        // before it waits for the CLI's usage event and exits.
        recordExit: end,
        beforeStopHandling: disposeEarlyStop,
      },
    })
    if (exitCode !== 0) {
      lifecycle.failed({
        ...(ending.failure ?? {
          reason: 'error',
          message: 'Dev Mode stopped before it was ready.',
        }),
        exitCode,
      })
    }
    return exitCode
  } catch (error) {
    exitCode = 1
    lifecycle.failed({
      reason: reasonOf(error),
      message: error?.message,
      exitCode,
    })
    throw error
  } finally {
    disposeEarlyStop()
    end(exitCode)
    await live.control?.close()
  }
}
