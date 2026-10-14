/**
 * Starts the laptop half of a Dev Mode session once its functions are attached: the local Lambda
 * Runtime API and credentials endpoint, the invocation stream, the dev build, the file watcher and,
 * with `relay`, the relay that brings the attached functions' invocations to this machine (once the
 * first build is done). `stop()` undoes all of it; the session calls it on every exit path.
 */
import path from 'path'
import { stat } from 'fs/promises'
import { ServerlessError } from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { progress as defaultProgress } from '@serverless/util/src/logger/index.js'
import { adapterFor } from './adapters/index.js'
import { nodeCodeRoot } from './adapters/node.js'
import { createDevBuild } from './build.js'
import {
  isLoaderVariable,
  isMachineOnlyVariable,
  isStartUpVariable,
  knownLambdaValues,
  nodeOptionsLeftOut,
} from './environment.js'
import { createInvocationOutput } from './invocation-output.js'
import { mcpServersOf } from './mcp.js'
import {
  buildFailedLines,
  changedLine,
  configChangedLine,
  configFileFailedMessage,
  leftOutLine,
  leftOutSummaryLine,
  localRuntimeFailedMessage,
  reloadFailedLine,
  reloadedLine,
  reloadNowLine,
  watcherFailedLine,
} from './messages.js'
import { removeStaleTestFeed } from './leftovers.js'
import { scrubLine } from '../state/events.js'
import { createRelay } from '../relay/relay.js'
import { createLocalRuntime } from './runtime.js'
import { startTestFeed, testFeedEnabled } from './test-feed.js'
import { createWatcher, handlerModulesOf } from './watcher.js'

/**
 * After the runtime stopped, how long `stop()` waits for the relay to send what the invocations it
 * ended answered (their callers get an error instead of waiting for their timeout).
 */
const STOP_SETTLE_MS = 2_000

// The esbuild plugin's code (spelled this way) for a compile error esbuild has already printed.
const ESBUILD_PRINTED = 'ESBULD_BUILD_ERROR'

/**
 * The invocation output and the recorder, called alike: the output first (what a person sees), then
 * the recorder, whose failure is a debug line and never reaches the output or the invocation.
 */
const alongside = (output, recorder, logger) =>
  Object.fromEntries(
    ['start', 'log', 'end', 'workerExited'].map((name) => [
      name,
      (details) => {
        try {
          output[name](details)
        } finally {
          try {
            recorder[name](details)
          } catch (error) {
            logger.debug?.(
              `Dev Mode could not record an invocation's ${name}: ${error?.message ?? error}`,
            )
          }
        }
      },
    ]),
  )

/** An error's first line as a record keeps it, without URLs. */
const firstLine = (error) =>
  scrubLine(
    String(error?.message ?? error ?? 'the build failed').split(/\r?\n/)[0],
  )

/**
 * The width the invocation stream keeps its start lines within: the terminal's, when both output
 * streams are one (0 otherwise: nothing is cut in a pipe or a log file).
 */
export const terminalWidth = (processRef = process) =>
  processRef.stdout?.isTTY && processRef.stderr?.isTTY
    ? Number(processRef.stderr.columns) || 0
    : 0

/**
 * What the names of the stack's resources start with, which the invocation stream leaves out of
 * them: the stack's name, and `<service>-<stage>` (the Framework's own names).
 */
const resourcePrefixesOf = (serverless) => {
  try {
    const provider = serverless.getProvider?.('aws')
    const stage = provider?.getStage?.()
    const names = [
      provider?.naming?.getStackName?.(),
      stage && `${serverless.service.service}-${stage}`,
    ]
    return [...new Set(names.filter(Boolean).map((name) => `${name}-`))]
  } catch {
    return []
  }
}

const configFileOf = async (serverless, options, serviceDir) => {
  if (typeof options.config === 'string' && options.config) {
    return path.resolve(serviceDir, path.basename(options.config))
  }
  const filename = serverless.configurationFilename ?? 'serverless'
  const declared = path.resolve(serviceDir, filename)
  // A file-system error names the file it was reading: with the stem, that is `<stem>.<extension>`.
  const unreadable = (error) =>
    new ServerlessError(
      configFileFailedMessage({ file: error?.path ?? declared, error }),
      'DEV_MODE_CONFIG_FILE_UNREADABLE',
      { stack: false },
    )
  try {
    if ((await stat(declared)).isFile()) return declared
  } catch (error) {
    if (error.code !== 'ENOENT') throw unreadable(error)
  }
  // The source runner passes the file's stem. Reuse its supported-extension resolver.
  const { getConfigFilePath } =
    await import('@serverlessinc/sf-core/src/utils/fs/index.js')
  try {
    return (
      (await getConfigFilePath({
        configFileName: filename,
        configFileDirPath: serviceDir,
      })) ?? (path.extname(filename) ? declared : `${declared}.yml`)
    )
  } catch (error) {
    throw unreadable(error)
  }
}

export const startLaptopRuntime = async ({
  serverless,
  options = {},
  functions,
  localRuntimes,
  logger,
  timers,
  now = Date.now,
  processRef = process,
  env = process.env,
  // { connection, sessionId, sessionKey, deployedNames: Map<deployed name, key>, sideChannel,
  // onNotRun, onPassed }: the session's relay connection and what the relay needs.
  relay,
  // The session's event log (`emit(type, fields)`), for the reload records.
  events = { emit() {} },
  // Called once the reload spinner is gone: the session's keys take the terminal back.
  onSpinnerDone = () => {},
  // The invocation recorder (state/invocations.js), which hears every invocation the output does.
  recorder = null,
  // The session's spinner (`guardedProgress`): while it shows (a stop, a restore), an invocation's
  // lines take its place, and it comes back after them.
  spinner = null,
  deps = {},
}) => {
  const {
    createRuntime = createLocalRuntime,
    createBuild = createDevBuild,
    watch,
    // How long the start waits for the watcher's first scan (watcher.js READY_WAIT_MS).
    watchReadyMs,
    startFeed = startTestFeed,
    // The flags this machine's Node.js, which runs the handlers, accepts in NODE_OPTIONS.
    allowedNodeFlags = process.allowedNodeEnvironmentFlags,
    progress: progressFactory = defaultProgress,
    width = () => terminalWidth(processRef),
  } = deps
  // The reload spinner's own line, so a reload never takes over another task's text.
  const progress = progressFactory.get('dev-reload')
  const serviceDir = serverless.serviceDir ?? serverless.config?.serviceDir
  const configFile = await configFileOf(serverless, options, serviceDir)
  const devDir = path.join(serviceDir, '.serverless', 'dev')
  try {
    removeStaleTestFeed({ dir: devDir })
  } catch (error) {
    logger.debug?.(
      `Dev Mode could not remove a test feed file left behind: ${error?.message ?? error}`,
    )
  }
  const keys = functions.map(({ key }) => key)
  const mcp = mcpServersOf(serverless)
  // Whether the reload spinner shows. A line printed under it gets a blank line after it, which
  // would split an invocation's lines: the first one printed takes the spinner's place instead.
  let spinnerShown = false
  const spinnerDone = () => {
    try {
      onSpinnerDone()
    } catch (error) {
      logger.debug?.(
        `Dev Mode could not take the terminal back after a reload: ${error?.message ?? error}`,
      )
    }
  }
  const removeSpinner = () => {
    if (!spinnerShown) return
    spinnerShown = false
    progress.remove()
    spinnerDone()
  }
  const takeTerminal = () => {
    removeSpinner()
    spinner?.hold?.()
  }
  const output = createInvocationOutput({
    write: (line) => {
      takeTerminal()
      logger.notice(line)
    },
    warn: (line) => {
      takeTerminal()
      logger.warning(line)
    },
    // The session's logger prints one blank line between sections, never two (`gap`); under a
    // spinner, the one it keeps above itself.
    blank: () => {
      takeTerminal()
      if (logger.gap) logger.gap()
      else logger.blankLine?.()
    },
    idle: () => spinner?.release?.(),
    detailed: Boolean(options.detailed),
    mcpFunctions: new Set(keys.filter((key) => mcp.has(key))),
    provider: serverless.service?.provider ?? {},
    prefixes: resourcePrefixesOf(serverless),
    width,
  })
  const table = new Map(
    functions.map(({ key, live }) => {
      const adapter = adapterFor(live.Runtime)
      return [
        key,
        {
          key,
          adapter,
          local: localRuntimes?.[adapter?.name],
          runtime: live.Runtime,
          timeout: live.Timeout,
          config: serverless.service.getFunction(key),
          // What a handler runs with: the deployed configuration read with your credentials,
          // never variables an invocation brings (see functionVariables).
          deployedVariables: live.Environment?.Variables ?? {},
          lambdaValues: knownLambdaValues(live),
        },
      ]
    }),
  )
  const nodeKeys = functions
    .filter(({ live }) => adapterFor(live.Runtime)?.name === 'node')
    .map(({ key }) => key)
  // The functions a dev build has built this session: they run the build's output from then on,
  // the last good one after a failed build. With the handler file the build named for each, when
  // it named one (relative to .serverless/build).
  const builtSoFar = new Set()
  const builtFiles = new Map()
  // Once per session: what of the deployed configuration does not apply here, by name only.
  const leftOutOf = (pick) => {
    const found = functions
      .map(({ key, live }) => ({
        key,
        names: pick(key, live.Environment?.Variables ?? {}),
      }))
      .filter(({ names }) => names.length)
    return found.length
      ? {
          functions: found.map(({ key }) => key),
          names: [...new Set(found.flatMap(({ names }) => names))],
        }
      : null
  }
  const flagsLeftOut = new Map(
    functions
      .filter(({ key }) => nodeKeys.includes(key))
      .map(({ key, live }) => [
        key,
        nodeOptionsLeftOut(live.Environment?.Variables?.NODE_OPTIONS, {
          allowed: allowedNodeFlags,
          serviceDir,
          taskRoot: nodeCodeRoot({ built: builtSoFar.has(key), serviceDir }),
        }),
      ]),
  )
  const flagsOf = (reason) => (key) => flagsLeftOut.get(key)?.[reason] ?? []
  const nodeOptions = leftOutOf(flagsOf('notApplied'))
  const packages = leftOutOf(flagsOf('packages'))
  const outside = leftOutOf(flagsOf('outside'))
  const refused = leftOutOf(flagsOf('refused'))
  const loader = leftOutOf((key, variables) =>
    Object.keys(variables).filter(isLoaderVariable),
  )
  const machineOnly = leftOutOf((key, variables) =>
    Object.keys(variables).filter(isMachineOnlyVariable),
  )
  const startUp = leftOutOf((key, variables) =>
    Object.keys(variables).filter((name) =>
      isStartUpVariable(name, variables[name]),
    ),
  )
  if (
    nodeOptions ||
    packages ||
    outside ||
    refused ||
    loader ||
    machineOnly ||
    startUp
  ) {
    const clauses = {
      nodeOptions,
      packages,
      outside,
      refused,
      loader,
      machineOnly,
      startUp,
    }
    logger.warning(leftOutSummaryLine(clauses))
    logger.debug?.(leftOutLine(clauses))
  }
  const build = nodeKeys.length
    ? createBuild({ serverless, functionKeys: nodeKeys, options, now })
    : null
  const runtime = createRuntime({
    serverless,
    serviceDir,
    functions: table,
    output: recorder ? alongside(output, recorder, logger) : output,
    logger,
    timers,
    now,
    processRef,
    machineEnv: env,
    isBuilt: (key) => builtSoFar.has(key),
    builtFile: (key) => builtFiles.get(key) ?? null,
  })
  try {
    await runtime.start()
  } catch (error) {
    await runtime.stop().catch(() => {})
    throw new ServerlessError(
      localRuntimeFailedMessage(error),
      'DEV_MODE_LOCAL_RUNTIME_FAILED',
      {
        stack: false,
      },
    )
  }

  // The functions a failed build affects: those the build covers (all Node.js functions when the
  // build does not say), and any that run a good build from earlier. Every other function runs from
  // its source files whatever the build does.
  const affectedBy = (result) => {
    const covered = new Set(result.functions ?? nodeKeys)
    return nodeKeys.filter((key) => covered.has(key) || builtSoFar.has(key))
  }
  /** Whether the build succeeded; after a failure, says so and returns the functions it affects. */
  const built = (result) => {
    for (const key of result.built ?? []) {
      builtSoFar.add(key)
      if (result.files?.[key]) builtFiles.set(key, result.files[key])
      else builtFiles.delete(key)
    }
    if (result.ok) return { ok: true, affected: [] }
    const affected = affectedBy(result)
    const lines = buildFailedLines({
      error: result.error,
      functions: affected,
      // What a build plugin never built runs from source (the adapters' rule).
      unbuilt: affected.filter((key) => !builtSoFar.has(key)),
      configFile: path.basename(configFile),
    })
    // esbuild prints its own compile errors; every other failure is explained only here.
    logger.warning(
      (result.error?.code === ESBUILD_PRINTED
        ? [lines[0], lines[lines.length - 1]]
        : lines
      ).join('\n'),
    )
    return { ok: false, affected }
  }
  try {
    if (build) built(await build.run())
  } catch (error) {
    await runtime.stop()
    throw error
  }
  // Set once the session's stop has begun (stopAccepting or stop): nothing reloads from then on, and
  // a rebuild that was running says nothing (Ctrl+C in a terminal reaches the build's own processes,
  // which fail it).
  let stopped = false
  let reloading = Promise.resolve()

  const reload = async (files) => {
    if (stopped) return
    const started = now()
    try {
      // The blank line the spinner keeps above itself, printed here so that the session's logger
      // knows of it: the invocation that takes the spinner's place adds no second one.
      logger.gap?.()
      progress.notice(
        files.length ? changedLine(files, serviceDir) : reloadNowLine,
      )
      spinnerShown = true
      events.emit('reload.start', { files: files.length, functions: keys })
      const result = build ? await build.run() : null
      if (stopped) return
      // The spinner goes before any line: a line printed under a spinner gets a blank line.
      removeSpinner()
      const { ok, affected } = result
        ? built(result)
        : { ok: true, affected: [] }
      // A function the failed build affects keeps what it runs; every other one reloads.
      const reloaded = keys.filter((key) => !affected.includes(key))
      runtime.reload(reloaded)
      if (reloaded.length)
        logger.notice(
          reloadedLine({ functions: reloaded, all: keys, ms: now() - started }),
        )
      events.emit('reload.end', {
        ok,
        functions: reloaded,
        ms: now() - started,
        error: ok ? undefined : firstLine(result.error),
      })
    } catch (error) {
      removeSpinner()
      if (stopped) return
      logger.warning(reloadFailedLine(error))
      events.emit('reload.end', {
        ok: false,
        functions: [],
        ms: now() - started,
        error: firstLine(error),
      })
    } finally {
      // Unless an invocation took its place already.
      removeSpinner()
    }
  }
  // One reload at a time: a reload asked for while another runs (a saved file, the `r` key) starts
  // when that one ends, so two builds never run at once. Every reload asked for before the waiting
  // one starts joins it (a held `r` key is one more rebuild, not one per repeat). The chain never
  // rejects, so a reload whose failure report itself failed does not stop the reloads after it.
  let waiting = null
  const onChange = (files) => {
    if (waiting) {
      for (const file of files) waiting.files.add(file)
      return waiting.done
    }
    const next = { files: new Set(files) }
    next.done = reloading
      .then(() => {
        if (waiting === next) waiting = null
        return reload([...next.files])
      })
      .catch((error) => {
        try {
          logger.debug?.(
            `Dev Mode could not finish a reload: ${error?.message ?? error}`,
          )
        } catch {
          // Nothing left to report to; the chain still settles.
        }
      })
    waiting = next
    reloading = next.done
    return reloading
  }
  let watcherErrorShown = false
  let watcher
  try {
    watcher = createWatcher({
      serviceDir,
      configFiles: [configFile],
      handlerModules: handlerModulesOf({
        serviceDir,
        functions: [...table.values()].map(({ adapter, config }) => ({
          handler: config?.handler,
          module: config?.module,
          python: adapter?.name === 'python',
        })),
      }),
      timers,
      ...(watch && { watch }),
      ...(watchReadyMs !== undefined && { readyWaitMs: watchReadyMs }),
      onChange,
      onConfigChange: async () =>
        logger.warning(configChangedLine(path.basename(configFile))),
      onError: (error) => {
        if (watcherErrorShown) return
        watcherErrorShown = true
        logger.warning(watcherFailedLine(error))
      },
    })
  } catch (error) {
    await runtime.stop()
    throw error
  }
  // A save before the watcher's first scan ends is not seen: the session is on only after it.
  if (!(await watcher.ready())) {
    logger.debug?.(
      'Dev Mode is still scanning the service directory for changes; saves are seen once the scan ends.',
    )
  }

  // The Framework's live tests hand the runtime invocations through this, until the relay exists.
  let feed = null
  if (testFeedEnabled(env)) {
    try {
      feed = await startFeed({ runtime, dir: devDir })
    } catch (error) {
      stopped = true
      try {
        await watcher.close()
        await reloading
      } finally {
        await runtime.stop()
      }
      throw error
    }
  }

  // From here on invocations reach this machine: the first build is done, so none runs sources the
  // build is about to replace. Before this, the bridges' requests go unanswered and the deployed
  // code answers them.
  let relayed = null
  if (relay) {
    relayed = createRelay({
      sessionId: relay.sessionId,
      key: relay.sessionKey,
      functions: relay.deployedNames,
      runtime,
      publish: (message) => relay.connection.transport.publish(message),
      sideChannel: relay.sideChannel,
      now,
      timers,
      logger,
      onNotRun: relay.onNotRun,
      onPassed: relay.onPassed,
    })
    relay.connection.setReceiver((topic, payload) =>
      relayed.receive(topic, payload),
    )
    relay.connection.onReconnected?.(() => relayed.reconnected())
  }

  let stopping
  return {
    runtime,
    relay: relayed,
    /** From now on every relayed request is left to the deployed code, and nothing reloads. */
    stopAccepting: () => {
      stopped = true
      relayed?.stopAccepting()
    },
    /** The `r` key: rebuilds and reloads every function now, the way a file change does. */
    reloadNow: () => onChange([]),
    /** The `v` key: detailed output on or off; returns the new state. */
    toggleDetailed: () => output.setDetailed(!output.isDetailed()),
    /** Waits up to `ms` for the relayed invocations already accepted to send their results. */
    drain: (ms) => relayed?.drain(ms) ?? Promise.resolve(),
    stop() {
      stopping ??= (async () => {
        stopped = true
        relayed?.stopAccepting()
        try {
          await feed?.stop()
          await watcher.close()
          await reloading
        } finally {
          await runtime.stop()
          await relayed?.drain(STOP_SETTLE_MS)
        }
      })()
      return stopping
    },
  }
}
