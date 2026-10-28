/**
 * A web app's server on this machine, started from its start source (start-sources.js): `config`
 * runs `dev.command` in the user's shell like an npm script (`node_modules/.bin` first on PATH;
 * on Windows `cmd.exe`, Node.js's default shell), `entry` runs the entry from source with the CLI's
 * Node.js (TypeScript through the tsx loader, as an unbuilt function's handler runs) and restarts
 * it whenever a file in the service directory changes (local/watcher.js). A `config` command
 * reloads its own code (`next dev`, `vite`).
 *
 * The Framework picks the port: a free one on 127.0.0.1, kept for the whole session. The server
 * is `serving` once a TCP connect to that port succeeds; until then, and whenever its process has
 * exited, the relay leaves requests to the deployed code (`isServing`). `ready` resolves true once
 * it serves, or false when it has not within `readyTimeoutMs` or its process exited first: the
 * web app then has the LOCAL_SERVER_DOWN note, and the port is still tried every
 * DOWN_PROBE_INTERVAL_MS, so a server that listens late serves from then on. A process that exits
 * on its own is started again after a delay that doubles with every exit in a row, up to
 * RESTART_BACKOFF.maxMs (restartDelay); one that served starts the count again.
 *
 * Its process runs with the environment the caller gives (webAppEnvironment: the deployed
 * revision's variables, the role credentials from the loopback endpoint, PORT and HOSTNAME). On
 * POSIX it leads its own process group, as a function's worker does (local/adapters/spawn-
 * options.js), and stopping it signals the whole group, so what a shell command started (`next
 * dev`'s own processes) goes with it. Windows has no process groups: there `taskkill /T /F` ends
 * the process and every process it started.
 *
 * Events: `server.started { web_app, port, source }` for each process started,
 * `server.exited { web_app, code, signal }` for each one that ended, whatever ended it. A restart
 * asked for (`reload(files)`: an `entry` server's saved file, the `r` key) is also a reload, as a
 * function's rebuild is: `reload.start { files, web_apps }`, then `reload.end { ok, web_apps, ms,
 * error }` once the new process listens (`ok`) or will not (`ready` false), and the `⟳ Reloaded`
 * line when it listens.
 */
import {
  execFile as nodeExecFile,
  execFileSync as nodeExecFileSync,
  spawn as nodeSpawn,
} from 'child_process'
import { randomBytes as nodeRandomBytes } from 'crypto'
import net from 'net'
import path from 'path'
import { credentialsFrom } from '../local/environment.js'
import { createLineSplitter } from '../local/lines.js'
import { tsxLoaderUrl } from '../local/paths.js'
import { createWatcher } from '../local/watcher.js'
import { webReloadedLine } from '../local/messages.js'

/** The row note of a web app whose server on this machine is not serving. */
export const LOCAL_SERVER_DOWN = 'local_server_down'
export const READY_TIMEOUT_MS = 30_000
/** How often the port is tried until the server serves or `readyTimeoutMs` passes. */
export const PROBE_INTERVAL_MS = 250
/** How often it is tried after that, while the process runs. */
export const DOWN_PROBE_INTERVAL_MS = 1_000
/** How long a stopped server gets to exit before it and what it started are killed. */
export const STOP_GRACE_MS = 2_000
/** The delay before a server that exited on its own starts again: doubling, up to `maxMs`. */
export const RESTART_BACKOFF = Object.freeze({
  initialMs: 1_000,
  maxMs: 30_000,
})
/** After a process exited, how long its output may stay open before its exit is told anyway. */
export const CLOSE_WAIT_MS = 1_000
// A connect to a loopback port is refused at once; one that hangs counts as not listening.
const CONNECT_TIMEOUT_MS = 1_000
// Run through the tsx loader, as a Node.js handler from source is (local/adapters/node.js).
const NEEDS_LOADER = /\.([cm]?ts|[tj]sx)$/

/** The delay before the restart that follows `failures` exits in a row (0 for the first). */
export const restartDelay = (failures, backoff = RESTART_BACKOFF) =>
  Math.min(backoff.maxMs, backoff.initialMs * 2 ** Math.min(failures, 30))

const downMessage = (key, port) =>
  `${key}'s server on this machine isn't listening on port ${port}; requests run the deployed code until it is.`

/**
 * `env` with `node_modules/.bin` of `cwd` and of every directory above it first on PATH, as npm
 * runs a script. On Windows PATH keeps the name it is stored under (`Path`).
 */
export const scriptPath = (env, { cwd, platform = process.platform }) => {
  const paths = platform === 'win32' ? path.win32 : path.posix
  const bins = []
  for (let dir = paths.resolve(cwd); ; dir = paths.dirname(dir)) {
    bins.push(paths.join(dir, 'node_modules', '.bin'))
    if (paths.dirname(dir) === dir) break
  }
  const name =
    (platform === 'win32'
      ? Object.keys(env).find((existing) => existing.toUpperCase() === 'PATH')
      : 'PATH' in env && 'PATH') ?? 'PATH'
  return {
    ...env,
    [name]: [...bins, ...(env[name] ? [env[name]] : [])].join(paths.delimiter),
  }
}

/** A free port on `host`, as the system hands one out. */
export const findFreePort = (host = '127.0.0.1') =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host, port: 0 }, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

/** Whether a TCP connect to `host:port` succeeds. */
export const canConnect = (port, host = '127.0.0.1') =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })

/**
 * The role credentials of each web app's server, served from the session's credentials endpoint
 * (local/credentials.js) the way a function's worker gets them. `register(key)` gives the
 * `{ uri, token }` its environment points at (webAppEnvironment's `credentials`); `update(key,
 * { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN })` is what the web relay calls
 * with the credentials a bridge forwards (newest wins); `unregister(key)` stops serving them.
 */
export const createWebAppCredentials = ({
  credentialsServer,
  randomBytes = nodeRandomBytes,
}) => {
  const entries = new Map()
  const unregister = (key) => {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    credentialsServer.unregister(entry.id)
  }
  return {
    register(key) {
      unregister(key)
      // A random path, as for a worker: a web app's key can be longer than a path segment allows.
      const id = randomBytes(32).toString('hex')
      const registration = credentialsServer.register(id)
      entries.set(key, { id, registration })
      return { uri: registration.uri, token: registration.token }
    },
    update(key, values) {
      entries.get(key)?.registration.update(credentialsFrom(values))
    },
    unregister,
  }
}

/** Ends `pid` and every process it started, on Windows, where there are no process groups. */
const taskkill =
  ({ execFile = nodeExecFile, execFileSync = nodeExecFileSync } = {}) =>
  (pid, { sync = false } = {}) => {
    const args = ['/pid', String(pid), '/T', '/F']
    if (sync) {
      try {
        execFileSync('taskkill', args, { stdio: 'ignore', windowsHide: true })
      } catch {
        // Already gone.
      }
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      execFile('taskkill', args, { windowsHide: true }, (error) =>
        resolve(!error),
      )
    })
  }

export const createLocalWebServer = ({
  key,
  // The start source: { source: 'config', command, cwd } or { source: 'entry', entryFile, cwd }.
  start: startSource,
  // The server's environment, or a function of `{ port, hostname }` that gives it (called for every
  // process started).
  env,
  serviceDir,
  logger,
  events = { emit() {} },
  timers = { setTimeout, clearTimeout },
  processRef = process,
  now = Date.now,
  readyTimeoutMs = READY_TIMEOUT_MS,
  // The port to use; a free one is picked on the first start otherwise.
  port: givenPort = null,
  hostname = '127.0.0.1',
  probeIntervalMs = PROBE_INTERVAL_MS,
  downProbeIntervalMs = DOWN_PROBE_INTERVAL_MS,
  graceMs = STOP_GRACE_MS,
  restartBackoff = RESTART_BACKOFF,
  // Each line the server writes: { webApp, stream, text }.
  onLine = ({ text }) => logger.notice(text),
  // Told { serving, note } whenever either changes.
  onStatus = () => {},
  // Told { webApp, ms } once a reload's new process listens.
  onReloaded = (details) => logger.notice(webReloadedLine(details)),
  deps = {},
}) => {
  const {
    spawn = nodeSpawn,
    connect = canConnect,
    findPort = findFreePort,
    watch,
    platform = process.platform,
    signalProcess = (target, name) => process.kill(target, name),
    killTree = taskkill(),
    execPath = process.execPath,
    resolveTsx = tsxLoaderUrl,
  } = deps
  const cwd = startSource.cwd ?? serviceDir
  let port = givenPort
  let serving = false
  let note = null
  let stopped = false
  let started = false
  // The process running now: { child, ended, exited (promise), ... }.
  let current = null
  let readyPromise = Promise.resolve(false)
  let restartTimer = null
  // Exits in a row without the server serving in between.
  let failures = 0
  let watcher = null
  // One start or restart at a time.
  let queue = Promise.resolve()

  const debug = (text) => {
    try {
      logger.debug?.(text)
    } catch {
      // Nothing else to tell it with.
    }
  }
  const emit = (type, fields) => {
    try {
      events.emit(type, fields)
    } catch (error) {
      debug(`Dev Mode could not record ${type}: ${error?.message ?? error}`)
    }
  }
  const setStatus = (nextServing, nextNote) => {
    if (serving === nextServing && note?.reason === nextNote?.reason) return
    serving = nextServing
    note = nextNote
    try {
      onStatus({ serving, note })
    } catch (error) {
      debug(
        `Dev Mode could not show ${key}'s status: ${error?.message ?? error}`,
      )
    }
  }
  const down = () => ({
    reason: LOCAL_SERVER_DOWN,
    message: downMessage(key, port),
  })

  /** Signals the process and everything it started (see the top of this file). */
  const signalTree = (run, name) => {
    const pid = run.child?.pid
    if (!Number.isInteger(pid) || pid <= 0) return
    if (platform === 'win32') {
      killTree(pid).then((killed) => {
        if (killed) return
        try {
          run.child.kill()
        } catch {
          // Already gone.
        }
      })
      return
    }
    try {
      signalProcess(-pid, name)
      return
    } catch {
      // Not a group leader, or the group is gone: the process alone.
    }
    try {
      run.child.kill(name)
    } catch {
      // Already gone.
    }
  }
  /** On the CLI's own exit, synchronously: nothing the server started outlives the session. */
  const killAll = () => {
    const pid = current?.child?.pid
    if (!current || current.ended || !Number.isInteger(pid) || pid <= 0) return
    if (platform === 'win32') {
      killTree(pid, { sync: true })
      return
    }
    try {
      signalProcess(-pid, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }

  const command = () => {
    if (startSource.source === 'config') {
      return { file: startSource.command, args: [], shell: true }
    }
    const loader = NEEDS_LOADER.test(startSource.entryFile)
      ? resolveTsx()
      : null
    return {
      file: execPath,
      args: [
        ...(loader ? ['--import', loader] : []),
        '--enable-source-maps',
        startSource.entryFile,
      ],
      shell: false,
    }
  }

  const output = (run, stream) => {
    const readable = run.child[stream]
    if (!readable) return
    readable.setEncoding('utf8')
    const splitter = createLineSplitter({
      timers,
      onLine: (text) => {
        try {
          onLine({ webApp: key, stream, text })
        } catch (error) {
          debug(
            `Dev Mode could not show ${key}'s server output: ${error?.message ?? error}`,
          )
        }
      },
    })
    run.outputs.push(splitter)
    readable.on('data', (chunk) => splitter.push(chunk))
    readable.on('end', () => splitter.end())
  }

  /** Tries the port until the server serves; gives `ready` false after `readyTimeoutMs`. */
  const probe = (run) => {
    const attempt = async () => {
      run.probeTimer = null
      if (run.ended || stopped) return
      let listening = false
      try {
        listening = await connect(port, hostname)
      } catch {
        listening = false
      }
      if (run.ended || stopped) return
      if (listening) {
        timers.clearTimeout(run.readyTimer)
        run.readyTimer = null
        failures = 0
        run.served = true
        setStatus(true, null)
        run.resolveReady(true)
        return
      }
      run.probeTimer = timers.setTimeout(
        attempt,
        run.timedOut ? downProbeIntervalMs : probeIntervalMs,
      )
    }
    run.readyTimer = timers.setTimeout(() => {
      run.readyTimer = null
      if (run.ended || stopped || run.served) return
      run.timedOut = true
      setStatus(false, down())
      logger.warning(downMessage(key, port))
      run.resolveReady(false)
    }, readyTimeoutMs)
    attempt()
  }

  /**
   * The process exited: what it started and left running goes too, and the rest waits for its
   * output to be read to the end (`close`), so a crash's last lines show before its exit does.
   * A process it started on Windows can hold that output open: then CLOSE_WAIT_MS at most.
   */
  const onProcessExit = (run, { code = null, signal = null }) => {
    if (run.ended || run.closeTimer) return
    if (platform !== 'win32' && Number.isInteger(run.child?.pid)) {
      try {
        signalProcess(-run.child.pid, 'SIGKILL')
      } catch {
        // Nothing left.
      }
    }
    run.closeTimer = timers.setTimeout(
      () => onExit(run, { code, signal }),
      CLOSE_WAIT_MS,
    )
  }

  const onExit = (run, { code = null, signal = null }) => {
    if (run.ended) return
    run.ended = true
    timers.clearTimeout(run.probeTimer)
    timers.clearTimeout(run.readyTimer)
    timers.clearTimeout(run.killTimer)
    timers.clearTimeout(run.closeTimer)
    run.probeTimer = run.readyTimer = run.killTimer = run.closeTimer = null
    for (const splitter of run.outputs) splitter.end()
    emit('server.exited', { web_app: key, code, signal })
    run.resolveReady(false)
    run.resolveExit()
    if (current !== run) return
    current = null
    // A stop or a restart asked for this exit: the server is not down, it is starting again.
    setStatus(false, stopped || run.stopping ? null : down())
    if (stopped || run.stopping) return
    const said =
      code !== null
        ? `exited with code ${code}`
        : signal
          ? `ended (${signal})`
          : 'could not start'
    const delay = restartDelay(failures, restartBackoff)
    const line = `${key}'s server on this machine ${said}; requests run the deployed code until it listens on port ${port} again. Dev Mode starts it again in ${Math.ceil(delay / 1000)}s.`
    // Once per run of exits: a command that exits at once does not fill the terminal.
    if (failures === 0) logger.warning(line)
    else debug(line)
    failures += 1
    restartTimer = timers.setTimeout(() => {
      restartTimer = null
      if (!stopped && !current) enqueue(launch)
    }, delay)
  }

  const launch = async () => {
    if (stopped) return
    const { file, args, shell } = command()
    const run = {
      child: null,
      ended: false,
      stopping: false,
      served: false,
      timedOut: false,
      outputs: [],
      probeTimer: null,
      readyTimer: null,
      killTimer: null,
      closeTimer: null,
    }
    run.exited = new Promise((resolve) => {
      run.resolveExit = resolve
    })
    readyPromise = new Promise((resolve) => {
      run.resolveReady = resolve
    })
    try {
      let environment =
        typeof env === 'function' ? env({ port, hostname }) : { ...env }
      if (shell) environment = scriptPath(environment, { cwd, platform })
      run.child = spawn(file, args, {
        cwd,
        env: environment,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        // Its own process group on POSIX (see the top of this file).
        ...(platform !== 'win32' && { detached: true }),
      })
    } catch (error) {
      debug(
        `Dev Mode could not start ${key}'s server: ${error?.message ?? error}`,
      )
      current = run
      onExit(run, {})
      return
    }
    current = run
    output(run, 'stdout')
    output(run, 'stderr')
    run.child.on('exit', (code, signal) => onProcessExit(run, { code, signal }))
    run.child.on('close', (code, signal) => onExit(run, { code, signal }))
    run.child.on('error', (error) => {
      debug(
        `Dev Mode could not run ${key}'s server: ${error?.message ?? error}`,
      )
      onExit(run, {})
    })
    emit('server.started', {
      web_app: key,
      port,
      source: startSource.source,
    })
    probe(run)
  }

  /** Stops the process running now, if any: SIGTERM, then SIGKILL after `graceMs`. */
  const end = async () => {
    const run = current
    if (!run || run.ended) return
    run.stopping = true
    signalTree(run, 'SIGTERM')
    run.killTimer = timers.setTimeout(() => {
      run.killTimer = null
      signalTree(run, 'SIGKILL')
    }, graceMs)
    await run.exited
  }

  const enqueue = (step) => {
    const next = queue.then(step)
    queue = next.catch((error) =>
      debug(
        `Dev Mode could not start ${key}'s server: ${error?.message ?? error}`,
      ),
    )
    return next
  }

  const restart = () =>
    enqueue(async () => {
      if (stopped || !started) return
      timers.clearTimeout(restartTimer)
      restartTimer = null
      failures = 0
      await end()
      await launch()
    }).then(() => readyPromise)

  /** A restart asked for, with its reload records and line; resolves with its `ready`. */
  const reload = (files = []) => {
    if (stopped || !started) return Promise.resolve(false)
    const startedAt = now()
    emit('reload.start', { files: files.length, web_apps: [key] })
    return restart().then(
      (ok) => {
        // A stop ends the reload: it says nothing, as a function's reload does.
        if (stopped) return false
        const ms = now() - startedAt
        emit('reload.end', {
          ok,
          web_apps: [key],
          ms,
          ...(!ok && {
            error: `${key}'s server on this machine is not listening on port ${port}`,
          }),
        })
        if (ok) {
          try {
            onReloaded({ webApp: key, ms })
          } catch (error) {
            debug(
              `Dev Mode could not show ${key}'s reload: ${error?.message ?? error}`,
            )
          }
        }
        return ok
      },
      (error) => {
        emit('reload.end', {
          ok: false,
          web_apps: [key],
          ms: now() - startedAt,
          error: error?.message ?? String(error),
        })
        return false
      },
    )
  }

  const startWatching = () => {
    if (startSource.source !== 'entry') return
    try {
      watcher = createWatcher({
        serviceDir: cwd,
        timers,
        ...(watch && { watch }),
        // Not waiting for the new process to listen: a later save restarts it at once.
        onChange: (files) => {
          reload(files ?? []).catch(() => {})
        },
        onConfigChange: async () => {},
        onError: (error) =>
          debug(
            `Dev Mode could not watch ${key}'s files: ${error?.message ?? error}`,
          ),
      })
    } catch (error) {
      debug(
        `Dev Mode could not watch ${key}'s files: ${error?.message ?? error}`,
      )
    }
  }

  let stopping = null
  return {
    key,
    source: startSource.source,
    /** The port the server listens on (null before the first start). */
    get port() {
      return port
    },
    /**
     * Whether the server takes requests now: its process runs and a connect to its port succeeded.
     */
    get serving() {
      return serving
    },
    /**
     * LOCAL_SERVER_DOWN `{ reason, message }` while the server is not serving after a start, else
     * null.
     */
    get note() {
      return note
    },
    /** The current process's readiness: true once it serves, false (see the top of this file). */
    get ready() {
      return readyPromise
    },
    /** Starts the server; resolves once its process was started (`ready` says when it serves). */
    start: () =>
      enqueue(async () => {
        if (stopped || started) return
        started = true
        port ??= await findPort(hostname)
        processRef.on?.('exit', killAll)
        startWatching()
        await launch()
      }),
    stop() {
      stopping ??= (async () => {
        stopped = true
        timers.clearTimeout(restartTimer)
        restartTimer = null
        try {
          await watcher?.close()
        } catch (error) {
          debug(
            `Dev Mode could not stop watching ${key}'s files: ${error?.message ?? error}`,
          )
        }
        await queue
        await end()
        setStatus(false, note)
        processRef.removeListener?.('exit', killAll)
      })()
      return stopping
    },
    /** Stops the process and starts a new one; resolves with its `ready`. */
    restart,
    /** `restart()` as a reload (`files`: what changed, none for the `r` key): records and line. */
    reload,
  }
}
