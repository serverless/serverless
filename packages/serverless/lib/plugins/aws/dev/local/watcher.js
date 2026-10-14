/**
 * Watches the service directory for code changes. Dependencies, build output, VCS data, Python
 * caches and virtualenvs, coverage and test files are never watched. A write counts once it has
 * been stable for 300 ms, a burst of changes is one reload, and changes that arrive during a
 * reload cause exactly one more. The configuration file is reported on its own: code reloads do
 * not apply it. A failing reload never stops the watching.
 */
import path from 'path'
import chokidar from 'chokidar'
import { splitHandler } from './adapters/node.js'

export const IGNORED_DIRECTORIES = Object.freeze([
  '.serverless',
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  '.pytest_cache',
  '.mypy_cache',
  'coverage',
])
export const IGNORED_FILE_SUFFIXES = Object.freeze([
  '.test.js',
  '.spec.js',
  '.test.mjs',
  '.spec.mjs',
  '.test.cjs',
  '.spec.cjs',
  '.test.jsx',
  '.spec.jsx',
  '.test.ts',
  '.spec.ts',
  '.test.mts',
  '.spec.mts',
  '.test.cts',
  '.spec.cts',
  '.test.tsx',
  '.spec.tsx',
  '_test.py',
  '.test.py',
])
/** How often each watched file is polled; a write then counts once it has been stable 300 ms. */
export const POLL_INTERVAL_MS = 300
export const DEBOUNCE_MS = 100
/**
 * How long `ready()` waits for the first scan of the service directory: a save before the scan
 * ends is not seen, so a session waits for it before it says it is on, but never longer than this.
 */
export const READY_WAIT_MS = 5_000

const outside = (relative, paths) =>
  relative === '..' || relative.startsWith('../') || paths.isAbsolute(relative)

/**
 * Path rules of `platform`: Windows accepts either separator (chokidar hands `ignored` paths with
 * forward slashes) and compares paths without case.
 */
const pathsOf = (platform) => (platform === 'win32' ? path.win32 : path.posix)
/**
 * The form two paths of `platform` are compared in: absolute, and lower case on Windows and macOS,
 * whose default file systems compare names without case (Linux's compare them with case). On a
 * case-sensitive macOS volume a false match only watches one more file.
 */
const CASELESS = new Set(['win32', 'darwin'])
export const pathKey = (file, platform = process.platform) => {
  const resolved = pathsOf(platform).resolve(file)
  return CASELESS.has(platform) ? resolved.toLowerCase() : resolved
}

/**
 * The module of a handler string, as its runtime loads it: Python's ends at the last dot (a dotted
 * module is a package path), Node.js's at the first dot of the file name (`src/api.routes.get` is
 * `src/api`), as the Node.js adapter and Lambda read it. Empty when there is none.
 */
const handlerModuleOf = (handler, python) => {
  if (!python) return splitHandler(handler).modulePath
  const at = handler.lastIndexOf('.')
  return at > 0 ? handler.slice(0, at) : ''
}

/**
 * The configured handler modules of the session's functions, as absolute paths without an
 * extension: `{ handler, module?, python? }` each. A Python module may be dotted (`pkg.mod`).
 */
export const handlerModulesOf = ({
  serviceDir,
  functions = [],
  platform = process.platform,
}) => {
  const paths = pathsOf(platform)
  const modules = new Set()
  for (const { handler, module, python } of functions) {
    const text = String(handler ?? '')
    const name = handlerModuleOf(text, python)
    // A handler without an export (no dot) is one no runtime loads.
    if (!name || name === text) continue
    const root = module ? paths.join(serviceDir, module) : serviceDir
    modules.add(pathKey(paths.resolve(root, name), platform))
    if (python) {
      modules.add(
        pathKey(paths.resolve(root, name.split('.').join('/')), platform),
      )
    }
  }
  return modules
}

/**
 * Whether a file is never watched. A configured handler module (`handlerModules`, from
 * handlerModulesOf) is watched whatever its name, also when it looks like a test file.
 */
export const isIgnored = ({
  serviceDir,
  file,
  handlerModules,
  platform = process.platform,
}) => {
  const paths = pathsOf(platform)
  const relative = paths.relative(serviceDir, file).split(paths.sep).join('/')
  if (!relative || outside(relative, paths)) return false
  if (relative.split('/').some((part) => IGNORED_DIRECTORIES.includes(part))) {
    return true
  }
  if (handlerModules?.size) {
    const resolved = paths.resolve(file)
    const base = resolved.slice(
      0,
      resolved.length - paths.extname(resolved).length,
    )
    if (handlerModules.has(pathKey(base, platform))) return false
  }
  return IGNORED_FILE_SUFFIXES.some((suffix) => relative.endsWith(suffix))
}

export const createWatcher = ({
  serviceDir,
  configFiles = [],
  // Watched whatever their names (see isIgnored).
  handlerModules,
  onChange,
  onConfigChange,
  onError = () => {},
  timers,
  watch = (dir, options) => chokidar.watch(dir, options),
  debounceMs = DEBOUNCE_MS,
  readyWaitMs = READY_WAIT_MS,
  // How long after the first scan ready() waits for every polled file's first look.
  settleMs = POLL_INTERVAL_MS,
  platform = process.platform,
}) => {
  const configs = new Set(configFiles.map((file) => pathKey(file, platform)))
  const isConfig = (file) => configs.has(pathKey(file, platform))
  let pending = new Set()
  let timer = null
  let running = false
  let closed = false

  const flush = async () => {
    timer = null
    if (running) return
    running = true
    try {
      while (pending.size && !closed) {
        const files = [...pending]
        pending = new Set()
        const config = files.filter(isConfig)
        const code = files.filter((file) => !isConfig(file))
        try {
          if (config.length) await onConfigChange(config)
          if (code.length) await onChange(code)
        } catch (error) {
          onError(error)
        }
      }
    } finally {
      running = false
    }
  }

  const watcher = watch(serviceDir, {
    ignored: (file) =>
      isIgnored({ serviceDir, file, handlerModules, platform }),
    ignoreInitial: true,
    followSymlinks: false,
    // chokidar 4 has no fsevents; polling avoids EMFILE on large macOS projects.
    usePolling: true,
    interval: POLL_INTERVAL_MS,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })
  watcher.on('all', (event, file) => {
    if (closed || !file || event === 'addDir' || event === 'unlinkDir') return
    pending.add(file)
    timers.clearTimeout(timer)
    // flush reports its callbacks' failures through onError; an onError that throws must not
    // become an unhandled rejection.
    timer = timers.setTimeout(() => flush().catch(() => {}), debounceMs)
  })
  watcher.on('error', (error) => onError(error))
  let scanned = false
  let settleReady = null
  let settleTimer = null
  // The first scan is done, and one poll later every polled file has taken its first look: a save
  // made before that look would be a file's starting point rather than a change.
  watcher.once('ready', () => {
    settleTimer = timers.setTimeout(() => {
      settleTimer = null
      scanned = true
      settleReady?.()
    }, settleMs)
  })

  return {
    async close() {
      closed = true
      timers.clearTimeout(timer)
      timer = null
      timers.clearTimeout(settleTimer)
      settleTimer = null
      settleReady?.()
      await watcher.close()
    },
    /**
     * Resolves true once the first scan is done and saves are seen; false when it took longer than
     * `readyWaitMs` (or the watcher closed first): the watching goes on either way.
     */
    ready() {
      if (scanned) return Promise.resolve(true)
      if (closed) return Promise.resolve(false)
      return new Promise((resolve) => {
        const wait = timers.setTimeout(() => {
          settleReady = null
          resolve(false)
        }, readyWaitMs)
        settleReady = () => {
          settleReady = null
          timers.clearTimeout(wait)
          resolve(scanned)
        }
      })
    },
  }
}
