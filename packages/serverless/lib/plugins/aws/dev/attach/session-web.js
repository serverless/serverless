/**
 * The web apps of a Dev Mode session, beside its functions: which ones it runs and how
 * (`readWebApps`), their attach and restore in AWS (`createWebAttach`), and, while the session
 * runs, their servers on this machine, the local listeners and the role credentials
 * (`createWebRuntime`). A service without web apps never reaches any of this: its session makes no
 * Lambda Web call.
 *
 * A web app runs in `dev` mode (its real URL reaches the server on this machine, through the web
 * relay) or `local` mode (`--local-only`: only its local URL does, and its real URL keeps
 * serving the deployed code). Each attach reports what it creates as it goes; every exit path
 * aborts the attaches still running, waits for them, and deletes exactly what they created, then
 * reads AWS again for an interrupted one, so a Ctrl+C half way leaves nothing behind and `main`
 * where it was.
 */
import os from 'os'
import { stripVTControlCharacters } from 'util'
import path from 'path'
import pLimit from 'p-limit'
import { randomBytes as nodeRandomBytes } from 'crypto'
import { CONTROL_PLANE_PARALLELISM } from './attach.js'
import { isAccessDenied } from './aws.js'
import { getWebAppsConfig } from '../../lib/web-apps.js'
import { getWebAppFunctionName } from '../../web-apps/compilers/function.js'
import {
  attachWebApp,
  deleteCreated,
  findAttachedWebApps,
  sessionResourceCounts,
  restoreWebApp,
} from '../web/attach.js'
import { classifyWebApp, selectWebApps } from '../web/eligibility.js'
import { resolveStartSource } from '../web/start-sources.js'
import {
  createLocalWebServer,
  createWebAppCredentials,
} from '../web/local-server.js'
import { createHttpDispatch } from '../web/http-dispatch.js'
import { startLocalProxy } from '../web/local-proxy.js'
import { createLocalOnlyCredentials } from '../web/local-credentials.js'
import { webAppEnvironment } from '../local/environment.js'
import { versionMismatches } from '../local/adapters/index.js'
import { configChangedLine, versionMismatchLine } from '../local/messages.js'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { stringToSafeColor } from '@serverless/util/src/logger/index.js'
import { openRuntimeResources } from '../local/runtime-resources.js'
import { processAlive } from '../local/leftovers.js'
import { configFileOf } from '../local/index.js'
import { createWatcher } from '../local/watcher.js'

/**
 * The service's web apps as Dev Mode reads them: `{ key, functionName, config }`, in their order.
 */
export const webAppsOf = (serverless, provider) => {
  const ctx = {
    serviceName: serverless.service.service,
    stage: provider.getStage(),
  }
  return Object.entries(getWebAppsConfig(serverless)).map(([key, webApp]) => ({
    key,
    functionName: getWebAppFunctionName(ctx, key, webApp),
    config: webApp ?? {},
  }))
}

/**
 * The web app selection of `--web-app`, `--skip-web-app` and `--local-only` (see eligibility.js).
 */
export const selectSessionWebApps = ({ webApps, options = {} }) =>
  selectWebApps({
    names: webApps.map(({ key }) => key),
    only: [].concat(options['web-app'] ?? []),
    skip: [].concat(options['skip-web-app'] ?? []),
    localOnly: [].concat(options['local-only'] ?? []),
  })

/** Whether a web app row runs on this machine. */
export const runsHere = (row) => row.mode === 'dev' || row.mode === 'local'

/**
 * Each web app's row (web/eligibility.js) from what AWS says about its web function: its endpoints,
 * its revisions and the Dev Mode session it is attached to, if any (whether that session runs is
 * asked through `liveness`, as for functions). Unselected web apps are not read. Returns the rows,
 * in the service's order, and per key the `details` the attach and the server need: `functionName`,
 * `config`, `start` (resolveStartSource's) and `found` (the session holding it, or null).
 *
 * When AWS denies a read, every selected web app's row is `deployed` (`lambda_web_denied`), and
 * `denied` is the error: the session decides whether it can run without them.
 */
export const readWebApps = async ({
  lambdaWeb,
  webApps,
  selection,
  serviceDir,
  liveness,
  context,
  resolveStart = resolveStartSource,
}) => {
  const selected = webApps.filter(({ key }) => selection.get(key).selected)
  try {
    return await readSelected({
      lambdaWeb,
      webApps,
      selected,
      selection,
      serviceDir,
      liveness,
      context,
      resolveStart,
    })
  } catch (error) {
    if (!isAccessDenied(error)) throw error
    // Rows without AWS: the selected web apps run the deployed code (`denied` says why).
    const rows = webApps.map(({ key, config }) =>
      selection.get(key).selected
        ? deployedWebRow(
            { webApp: key },
            'lambda_web_denied',
            LAMBDA_WEB_DENIED,
          )
        : classifyWebApp({
            key,
            config,
            selection: selection.get(key),
          }),
    )
    return { rows, details: new Map(), denied: error }
  }
}

/** The Lambda Web reads a session makes before it attaches web apps. */
export const LAMBDA_WEB_READS =
  'lambda:ListWebFunctionEndpoints, lambda:ListWebFunctionRevisions, lambda:GetWebFunctionRevision'
/** Why a web app runs the deployed code when its web function may not be read. */
const LAMBDA_WEB_DENIED = `your AWS credentials may not read its web function (${LAMBDA_WEB_READS})`

const readSelected = async ({
  lambdaWeb,
  webApps,
  selected,
  selection,
  serviceDir,
  liveness,
  context,
  resolveStart,
}) => {
  const found = new Map(
    (selected.length
      ? await findAttachedWebApps({ lambdaWeb, webApps: selected })
      : []
    ).map((entry) => [entry.key, entry]),
  )
  await liveness.cover([...found.values()].map((entry) => entry.sessionId))
  const readLimit = pLimit(CONTROL_PLANE_PARALLELISM)
  const deployed = new Map(
    await Promise.all(
      selected.map(({ key, functionName }) =>
        readLimit(async () => {
          const endpoints = await lambdaWeb.listEndpoints({ functionName })
          if (!endpoints.some(({ endpointName }) => endpointName === 'main')) {
            return [key, null]
          }
          const revisions = await lambdaWeb.listRevisions({ functionName })
          // The attach removes the found session's resources first (unless the web app stays
          // with it), so the quotas leave them out.
          const left = sessionResourceCounts({
            endpoints,
            revisions,
            sessionId: found.get(key)?.sessionId,
          })
          return [
            key,
            {
              revisionCount: revisions.length,
              endpointCount: endpoints.length,
              leftRevisionCount: left.revisions,
              leftEndpointCount: left.endpoints,
              ...(found.has(key) && {
                sessionId: found.get(key).sessionId,
                owner: found.get(key).owner,
              }),
            },
          ]
        }),
      ),
    ),
  )
  const details = new Map()
  const rows = webApps.map(({ key, functionName, config }) => {
    const start = selection.get(key).selected
      ? resolveStart({ key, webApp: config, serviceDir })
      : null
    details.set(key, {
      functionName,
      config,
      start,
      found: found.get(key) ?? null,
    })
    return classifyWebApp({
      key,
      config,
      deployed: deployed.get(key),
      selection: selection.get(key),
      startSource: start?.source ?? null,
      context: { ...context, liveness: liveness.known },
    })
  })
  return { rows, details }
}

/** A web app row once its attach ended (as `out.finalRow` for a function). */
export const finalWebRow = (row, outcome) => {
  if (!outcome || outcome.status === 'attached') return row
  const base = { webApp: row.webApp, mode: 'deployed', notes: [] }
  if (outcome.status === 'not_started') {
    return {
      ...base,
      reason: 'not_attached',
      why: 'not attached (session stopped)',
    }
  }
  return {
    ...base,
    reason: 'attach_failed',
    why: outcome.message
      ? `attach failed: ${outcome.message}`
      : 'attach failed',
  }
}

/** A web app row the session cannot run, for `reason` (`why` says what to do). */
export const deployedWebRow = (row, reason, why) => ({
  webApp: row.webApp,
  mode: 'deployed',
  reason,
  why,
  notes: [],
})

const EMPTY_RESULT = Object.freeze({
  restored: [],
  unchanged: [],
  skipped: [],
  missing: [],
  failed: [],
})

/**
 * The attach and restore of the session's web apps. `attachAll` attaches every row that runs here
 * (`dev` or `local`) in parallel, each after the Dev Mode resources another session left on it
 * were removed, and resolves each one's outcome by key. `restore()` (once, on every exit path)
 * aborts the attaches still running, waits for them, deletes what each created and, for one that
 * did not finish, removes whatever of this session AWS still shows; it resolves a result in
 * `restoreFunctions`' shape, each entry `{ name: key, webApp: true, message? }`. `abortAll()`
 * stops every attach before its next step (a forced exit). `pending()` names the web apps a
 * restore has still to take back, `attached()` those attached, as the watch reads them.
 */
export const createWebAttach = ({
  lambdaWeb,
  sessionId,
  sleep,
  now,
  isExiting = () => false,
}) => {
  const entries = new Map()
  const attachOne = async (row, detail, { bridge, session }) => {
    const entry = {
      key: row.webApp,
      functionName: detail.functionName,
      localOnly: row.mode === 'local',
      created: [],
      abort: new AbortController(),
      state: 'attaching',
      settled: false,
      result: null,
    }
    entries.set(entry.key, entry)
    entry.promise = (async () => {
      if (isExiting()) entry.abort.abort()
      // What another session left on it (one that ended, or one taken over) goes first: a dev
      // revision is never made from a dev revision.
      if (detail.found) {
        entry.abort.signal.throwIfAborted()
        const left = await restoreWebApp({
          lambdaWeb,
          functionName: entry.functionName,
          sessionId: detail.found.sessionId,
          sleep,
          now,
        })
        if (left.state === 'failed') throw new Error(left.message)
      }
      return attachWebApp({
        lambdaWeb,
        functionName: entry.functionName,
        bridge,
        session,
        localOnly: entry.localOnly,
        onCreated: (resource) => entry.created.push(resource),
        signal: entry.abort.signal,
        webApp: entry.key,
      })
    })()
    try {
      entry.result = await entry.promise
      entry.state = 'attached'
      return { status: 'attached' }
    } catch (error) {
      entry.state = 'failed'
      if (entry.abort.signal.aborted) return { status: 'not_started' }
      return { status: 'failed', message: error?.message ?? String(error) }
    }
  }

  const restoreOne = async (entry) => {
    entry.abort.abort()
    await entry.promise?.catch(() => {})
    const messages = []
    let changed = false
    if (entry.created.length) {
      const { failures } = await deleteCreated({
        lambdaWeb,
        created: entry.created,
        sleep,
        now,
      })
      messages.push(...failures.map(({ message }) => message))
      changed = true
    }
    // A create that landed in AWS but had not answered when the attach stopped is in no list:
    // AWS is read for whatever of this session is left.
    if (entry.state !== 'attached') {
      try {
        const left = await restoreWebApp({
          lambdaWeb,
          functionName: entry.functionName,
          sessionId,
          sleep,
          now,
        })
        if (left.state === 'failed') messages.push(left.message)
        if (left.state === 'restored') changed = true
      } catch (error) {
        messages.push(error?.message ?? String(error))
      }
    }
    if (!messages.length) entry.settled = true
    // The same cause (expired credentials, a denial) once, not once per resource.
    const message = [...new Set(messages)].join(' ')
    return {
      key: entry.key,
      state: message ? 'failed' : changed ? 'restored' : null,
      message,
    }
  }

  const restoreEntries = async (pending, onProgress = () => {}) => {
    const result = Object.fromEntries(
      Object.keys(EMPTY_RESULT).map((key) => [key, []]),
    )
    let done = 0
    const outcomes = await Promise.all(
      pending.map(async (entry) => {
        const outcome = await restoreOne(entry)
        done += 1
        onProgress({ done, total: pending.length })
        return outcome
      }),
    )
    for (const { key, state, message } of outcomes) {
      if (!state) continue
      result[state].push({
        name: key,
        webApp: true,
        ...(message && { message }),
      })
    }
    return result
  }

  let restoring = null
  return {
    async attachAll({ rows, details, bridge, session, onAttached = () => {} }) {
      const outcomes = new Map()
      await Promise.all(
        rows.filter(runsHere).map(async (row) => {
          const outcome = await attachOne(row, details.get(row.webApp), {
            bridge,
            session,
          })
          outcomes.set(row.webApp, outcome)
          if (outcome.status === 'attached') {
            onAttached(entries.get(row.webApp))
          }
        }),
      )
      return outcomes
    },
    abortAll() {
      for (const entry of entries.values()) entry.abort.abort()
    },
    pending: () =>
      [...entries.values()]
        .filter((entry) => !entry.settled)
        .map((entry) => entry.key),
    settledCount: () =>
      [...entries.values()].filter((entry) => entry.settled).length,
    attached: () =>
      [...entries.values()].filter((entry) => entry.state === 'attached'),
    /** An attached web app's attach result (web/attach.js `attachWebApp`'s). */
    resultOf: (key) => entries.get(key)?.result ?? null,
    /**
     * `--on-exit keep` (or `dev stop --keep`): the attached web apps stay in Dev Mode; what an
     * attach that did not finish created is removed, as `restore()` does. Resolves the same result
     * for those.
     */
    keepAttached() {
      return restoreEntries(
        [...entries.values()].filter(
          (entry) => !entry.settled && entry.state !== 'attached',
        ),
      )
    },
    restore({ onProgress = () => {} } = {}) {
      restoring ??= restoreEntries(
        [...entries.values()].filter((entry) => !entry.settled),
        onProgress,
      )
      return restoring
    },
  }
}

/**
 * The longest a web request keeps a session busy when its web app's timeout is unknown: Lambda's
 * limit.
 */
export const MAX_REQUEST_BUSY_MS = 900_000

/** A `--local-only` web app whose developer may not get its role's credentials. */
export const noRoleCredentialsLine = (key) =>
  `The web app ${key} runs on this machine without its role's credentials: your AWS credentials may not call its endpoint sls-dev-local (lambda:InvokeWebFunctionEndpoint). Allow that action, then start the session again to give it the credentials.`

/**
 * A web app's AWS values its server sees, as a function's knownLambdaValues for the Lambda ones.
 */
const knownWebValues = (region) =>
  region ? { AWS_REGION: region, AWS_DEFAULT_REGION: region } : {}

/**
 * The part of a running session that serves its web apps on this machine. Made before the relay
 * opens, so the relay gets `relayOptions(...)`: role credentials it takes before the servers run
 * are kept and handed to them once they do. `start(...)` opens the credentials endpoint and the
 * session's empty AWS config files, starts each web app's server and its local listener, and
 * for `--local-only` web apps asks for the role credentials (web/local-credentials.js).
 * `stopServers()` ends the servers at once (a Ctrl+C, which on Windows reaches them first);
 * `stop()` ends everything, and neither throws.
 *
 * `state` is what the session's output and `dev status` show, by key: `{ mode, port, localUrl,
 * credentials, serving, note }` (`credentials`: `relayed` for a `dev` web app, else the
 * local-only state: pending, ready, failed or denied).
 */
export const createWebRuntime = ({
  serverless,
  region,
  logger,
  timers,
  now = Date.now,
  processRef = process,
  events = { emit() {} },
  // The developer's credentials: what a `--local-only` web app's credentials request is signed
  // with.
  developerCredentials,
  // The session's web request recorder (state/requests.js); the relay and the dispatch tell it.
  recorder,
  // The command's options: which configuration file a session of web apps alone watches.
  options = {},
  // Each line a web app's server writes, prefixed with the web app (`web <key> │`).
  serverLine = (line) => logger.notice(line),
  deps = {},
}) => {
  const {
    createServer = createLocalWebServer,
    startProxy = startLocalProxy,
    openResources = (options) =>
      openRuntimeResources({
        tmpRoot: os.tmpdir(),
        pid: processRef.pid ?? process.pid,
        isAlive: processAlive,
        randomBytes: nodeRandomBytes,
        now,
        ...options,
      }),
    fetch,
    localCredentials = createLocalOnlyCredentials,
    configFile = () => configFileOf(serverless, options, serverless.serviceDir),
    watchFile = (file, { onConfigChange, onError }) =>
      // The configuration file alone: no code of the service is watched for it.
      createWatcher({
        serviceDir: file,
        configFiles: [file],
        timers,
        onChange: async () => {},
        onConfigChange,
        onError,
      }),
    // The Node.js an `entry` runs on: the CLI's own.
    nodeVersion = processRef.versions?.node ?? process.versions.node,
  } = deps
  const debug = (text) => {
    try {
      logger.debug(text)
    } catch {
      // Nothing else to tell it with.
    }
  }
  const servers = new Map()
  const proxies = new Map()
  const state = new Map()
  // The requests started and not ended yet, by id, with their web app and start: whatever their
  // source, they keep a detached session from being idle (`inFlight()`), each for at most its
  // web app's deployed timeout, as an invocation is held to its function's.
  const running = new Map()
  // Each web app's deployed timeout in ms (from start's results); MAX_REQUEST_BUSY_MS without one.
  const busyLimits = new Map()
  const counting = {
    ...(recorder?.captureBytes !== undefined && {
      captureBytes: recorder.captureBytes,
    }),
    ...(typeof recorder?.note === 'function' && {
      note: (fields) => recorder.note(fields),
    }),
    start(fields) {
      running.set(fields?.id, { key: fields?.key, at: now() })
      recorder?.start?.(fields)
    },
    end(fields) {
      running.delete(fields?.id)
      recorder?.end?.(fields)
    },
  }
  const { dispatch } = createHttpDispatch({
    servers,
    now,
    recorder: counting,
  })
  // The newest role credentials of each web app, until the servers' credentials exist.
  const latest = new Map()
  let bound = null
  const credentials = {
    update(key, values) {
      latest.set(key, values)
      bound?.update(key, values)
    },
  }
  let resources = null
  let local = null
  let configWatcher = null
  // Set by the first stopServers: from then on no server starts.
  let ended = false
  let stopping = null

  // Idempotent, as each server's stop is: a server started after a first call is stopped by the
  // next.
  const stopServers = () => {
    ended = true
    return Promise.all(
      [...servers.values()].map((server) =>
        Promise.resolve()
          .then(() => server.stop())
          .catch((error) =>
            debug(
              `Dev Mode could not stop the server of the web app ${server.key}: ${error?.message ?? error}`,
            ),
          ),
      ),
    )
  }

  /** In a session of web apps alone: a save of the configuration file says what it takes. */
  const watchConfiguration = async () => {
    try {
      const file = await configFile()
      if (ended) return
      configWatcher = watchFile(file, {
        onConfigChange: async () =>
          logger.warning(
            configChangedLine(path.basename(file), {
              functions: false,
              webApps: true,
            }),
          ),
        onError: (error) =>
          debug(
            `Dev Mode could not watch the configuration file: ${error?.message ?? error}`,
          ),
      })
    } catch (error) {
      debug(
        `Dev Mode could not watch the configuration file: ${error?.message ?? error}`,
      )
    }
  }

  const startAll = async ({ rows, details, results, watchConfig = false }) => {
    for (const row of rows) {
      const seconds = results.get(row.webApp)?.deployedTimeoutSeconds
      if (Number.isFinite(seconds) && seconds > 0) {
        busyLimits.set(row.webApp, seconds * 1000)
      }
    }
    resources = await openResources({ debug })
    if (watchConfig) await watchConfiguration()
    const webCredentials = createWebAppCredentials({
      credentialsServer: resources.credentials,
    })
    for (const row of rows) {
      const key = row.webApp
      const { start, config } = details.get(key)
      // An entry runs on the CLI's Node.js: one other than the deployed runtime's is said, as for
      // a function (a dev.command runs what it runs).
      if (start?.source === 'entry') {
        for (const mismatch of versionMismatches({
          functions: [
            {
              key: `web app ${key}`,
              runtime: results.get(key)?.deployedRuntime,
            },
          ],
          localRuntimes: { node: { available: true, version: nodeVersion } },
        })) {
          logger.warning(versionMismatchLine(mismatch))
        }
      }
      // NODE_OPTIONS settings left out on this machine are said once, as for a function.
      let droppedSaid = false
      // A prebuilt zip's server reads AWS_LAMBDA_HTTP_ENDPOINT, as Lambda gives it one: its entry
      // runs from source here (resolveStartSource's `entry` for a `package.artifact`).
      const prebuiltZip =
        start?.source === 'entry' && Boolean(config?.package?.artifact)
      const registration = webCredentials.register(key)
      const deployed = results.get(key)?.deployedVariables ?? {}
      state.set(key, {
        mode: row.mode,
        port: null,
        localUrl: null,
        credentials: row.mode === 'local' ? 'pending' : 'relayed',
        serving: false,
        note: null,
      })
      servers.set(
        key,
        createServer({
          key,
          start,
          env: ({ port, hostname }) => {
            const { env, dropped } = webAppEnvironment({
              machine: processRef.env ?? process.env,
              deployed,
              known: knownWebValues(region),
              credentials: registration,
              configFiles: resources.configFiles,
              port,
              hostname,
              prebuiltZip,
              serviceDir: serverless.serviceDir,
            })
            if (dropped?.length && !droppedSaid) {
              droppedSaid = true
              debug(
                `Dev Mode applies only the runtime settings and the service directory preloads of the NODE_OPTIONS of the web app ${key} on this machine; left out: ${dropped.join(', ')}`,
              )
            }
            return env
          },
          serviceDir: serverless.serviceDir,
          logger,
          events,
          timers,
          processRef,
          now,
          // Its output, attributed: with several web apps, or functions beside them, every
          // line says which server wrote it.
          onLine: ({ text }) => {
            // A blank line (spaces, or colour codes alone) would print as the prefix alone.
            if (!stripVTControlCharacters(String(text)).trim()) return
            try {
              serverLine(`${stringToSafeColor(key)(`web ${key} │`)} ${text}`)
            } catch (error) {
              debug(
                `Dev Mode could not show ${key}'s server output: ${error?.message ?? error}`,
              )
            }
          },
          onStatus: ({ serving, note }) =>
            Object.assign(state.get(key), { serving, note }),
        }),
      )
    }
    bound = webCredentials
    for (const [key, values] of latest) webCredentials.update(key, values)
    for (const [key, server] of servers) {
      if (ended) return
      await server.start()
      const proxy = await startProxy({ key, server, dispatch, logger })
      proxies.set(key, proxy)
      Object.assign(state.get(key), { port: server.port, localUrl: proxy.url })
    }
    if (ended) return
    const localOnly = rows
      .filter((row) => row.mode === 'local')
      .map((row) => ({
        key: row.webApp,
        url: results.get(row.webApp)?.localUrl,
      }))
      .filter(({ url }) => url)
    if (localOnly.length) {
      local = localCredentials({
        webApps: localOnly,
        region,
        credentials: developerCredentials,
        fetch,
        timers,
        logger,
        now,
        onState: (key, value) => {
          state.get(key).credentials = value
          // Once: the web app's row says it from then on (`no_role_credentials`).
          if (value === 'denied') logger.warning(noRoleCredentialsLine(key))
        },
      })
      local.start()
    }
  }
  let starting = null

  return {
    state,
    /** Sends a request to a web app's local server (`dev replay`), recorded by its `source`. */
    dispatch,
    /** Whether the web app `key` runs on this machine in this session. */
    runs: (key) => servers.has(key),
    /**
     * How many web requests run on this machine now (relayed, local and replayed) and still within
     * their web app's deployed timeout: an open event stream or long poll past it does not count.
     */
    inFlight: () => {
      const at = now()
      let count = 0
      for (const { key, at: startedAt } of running.values()) {
        if (at - startedAt < (busyLimits.get(key) ?? MAX_REQUEST_BUSY_MS)) {
          count += 1
        }
      }
      return count
    },
    /** The `r` key: every web app's server starts again, as a reload; never rejects. */
    reloadAll: () =>
      Promise.all(
        [...servers.values()].map((server) =>
          Promise.resolve()
            .then(() => server.reload?.([]))
            .catch((error) =>
              debug(
                `Dev Mode could not restart the server of the web app ${server.key}: ${error?.message ?? error}`,
              ),
            ),
        ),
      ),
    /** The `web` option of `openRelayRun` for `rows` (the rows that run here, with `details`). */
    relayOptions: ({ rows, details }) => ({
      functions: new Map(
        rows.map((row) => [details.get(row.webApp).functionName, row.webApp]),
      ),
      dispatch,
      credentials,
      recorder: counting,
      isServing: (key) => servers.get(key)?.serving ?? false,
      localOnly: new Set(
        rows.filter((row) => row.mode === 'local').map((row) => row.webApp),
      ),
    }),
    start(options) {
      starting ??= startAll(options)
      return starting
    },
    stopServers,
    stop() {
      stopping ??= (async () => {
        ended = true
        // A start still running ends first: what it opened is closed below.
        await starting?.catch(() => {})
        local?.stop()
        await Promise.resolve()
          .then(() => configWatcher?.close())
          .catch((error) =>
            debug(
              `Dev Mode could not stop watching the configuration file: ${error?.message ?? error}`,
            ),
          )
        await Promise.all(
          [...proxies.values()].map((proxy) =>
            Promise.resolve()
              .then(() => proxy.close())
              .catch((error) =>
                debug(
                  `Dev Mode could not close a local web app listener: ${error?.message ?? error}`,
                ),
              ),
          ),
        )
        await stopServers()
        await Promise.resolve()
          .then(() => resources?.close())
          .catch((error) =>
            debug(
              `Dev Mode could not close the web apps' credentials endpoint: ${error?.message ?? error}`,
            ),
          )
      })()
      return stopping
    },
  }
}
