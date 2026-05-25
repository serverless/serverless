import fs from 'node:fs'
import path from 'node:path'
import chokidar from 'chokidar'

// Extensions tried in order when resolving a handler file path.
const HANDLER_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts']

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a handler string (e.g. `'src/foo.handler'`) to an absolute file path.
 *
 * The handler string is `'<rel-path>.<exportName>'`. We split on the LAST `.`
 * to obtain the relative path, then try each supported extension.
 *
 * @param {string} handlerString  The raw handler string from serverless.yml.
 * @param {string} servicePath    Absolute path to the service root.
 * @returns {string | null}       Absolute path to the handler file, or null if
 *                                none of the candidate extensions resolve to an
 *                                existing file.
 */
function resolveHandlerFile(handlerString, servicePath) {
  // Split on the last `.` to separate the module path from the export name.
  const lastDot = handlerString.lastIndexOf('.')
  if (lastDot === -1) return null

  const relPath = handlerString.slice(0, lastDot)

  for (const ext of HANDLER_EXTENSIONS) {
    const candidate = path.resolve(servicePath, relPath + ext)
    try {
      fs.accessSync(candidate, fs.constants.F_OK)
      return candidate
    } catch {
      // Extension not found — try the next one.
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a native file watcher that calls `runner.invalidate(functionKey)`
 * whenever a watched handler source file changes.
 *
 * **Auto-disable rule**: if any plugin has registered a listener on the
 * `offline:functionsUpdated:cleanup` hook (e.g., the built-in esbuild plugin
 * or `serverless-esbuild`), chokidar is NOT started — the bundler plugin owns
 * invalidation and starting a second watcher would cause double-invalidation.
 *
 * @param {object} options
 * @param {object} options.serverless   Framework's serverless instance.
 * @param {string} options.servicePath  Absolute path to the service root.
 * @param {object} options.runner       Worker-thread runner; must expose `invalidate(functionKey)`.
 * @param {object} options.logger       Logger (exposes `.notice()`, `.warning()`).
 * @param {boolean} [options.enabled=true]  When `false`, the watcher is not
 *   started — useful for the `--noWatch` CLI flag or `offline.noWatch: true`
 *   in YAML. Returns an inert controller so the caller can wire teardown
 *   uniformly.
 * @returns {Promise<{
 *   pollingActive: boolean,
 *   watchedFiles: Set<string>,
 *   stop(): Promise<void>,
 * }>}
 */
export async function createWatcher({
  serverless,
  servicePath,
  runner,
  logger,
  enabled = true,
}) {
  // -------------------------------------------------------------------------
  // Explicit disable from caller (CLI --noWatch or offline.noWatch:true)
  // -------------------------------------------------------------------------

  if (!enabled) {
    logger.notice('Native file watcher disabled — hot reload is turned off')
    return {
      pollingActive: false,
      watchedFiles: new Set(),
      stop: async () => {},
    }
  }

  // -------------------------------------------------------------------------
  // Auto-disable check
  // -------------------------------------------------------------------------

  const cleanupHooks =
    serverless.pluginManager?.hooks?.['offline:functionsUpdated:cleanup'] ?? []

  if (cleanupHooks.length > 0) {
    logger.notice(
      'Native file watcher disabled — bundler plugin owns invalidation via offline:functionsUpdated:cleanup',
    )
    return {
      pollingActive: false,
      watchedFiles: new Set(),
      stop: async () => {},
    }
  }

  // -------------------------------------------------------------------------
  // Build file → [functionKey] reverse map
  // -------------------------------------------------------------------------

  /** @type {Map<string, Set<string>>} */
  const reverseMap = new Map()

  const functions = serverless.service?.functions ?? {}

  for (const [functionKey, fnConfig] of Object.entries(functions)) {
    const handlerString = fnConfig?.handler
    if (!handlerString) {
      logger.warning(
        `Function '${functionKey}' has no handler defined — skipping watcher.`,
      )
      continue
    }

    const absolutePath = resolveHandlerFile(handlerString, servicePath)
    if (!absolutePath) {
      logger.warning(
        `Handler file not found for function '${functionKey}' (handler: '${handlerString}') — skipping watcher for this function.`,
      )
      continue
    }

    if (!reverseMap.has(absolutePath)) {
      reverseMap.set(absolutePath, new Set())
    }
    reverseMap.get(absolutePath).add(functionKey)
  }

  const filesToWatch = [...reverseMap.keys()]
  const watchedFiles = new Set(filesToWatch)

  // If there are no handler files to watch (e.g. all functions use bundler),
  // return a no-op controller rather than starting an idle chokidar instance.
  if (filesToWatch.length === 0) {
    return {
      pollingActive: false,
      watchedFiles,
      stop: async () => {},
    }
  }

  // -------------------------------------------------------------------------
  // Start chokidar
  // -------------------------------------------------------------------------

  const watcher = chokidar.watch(filesToWatch, {
    persistent: false, // don't keep the Node event loop alive
    ignoreInitial: true, // don't fire 'add' events for existing files at startup
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  /** @param {string} filePath */
  function handleChange(filePath) {
    const functionKeys = reverseMap.get(filePath) ?? new Set()
    for (const functionKey of functionKeys) {
      logger.notice(`Source changed: ${functionKey} (${filePath})`)
      runner.invalidate(functionKey)
    }
  }

  watcher.on('change', handleChange)
  watcher.on('unlink', handleChange)

  // -------------------------------------------------------------------------
  // Controller
  // -------------------------------------------------------------------------

  let stopped = false

  return {
    pollingActive: true,
    watchedFiles,

    async stop() {
      if (stopped) return
      stopped = true
      await watcher.close()
    },
  }
}
