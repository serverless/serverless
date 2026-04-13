import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)

let seaImportBridge = null

/**
 * Load an external module from the filesystem.
 *
 * In normal Node.js, this is equivalent to `import(pathToFileURL(filePath))`.
 * In a SEA binary, direct import() of filesystem modules is blocked.
 * This function provides a three-tier fallback:
 *
 *   1. import() — works outside SEA for both CJS and ESM
 *   2. createRequire() — works in SEA for CJS modules
 *   3. Bridge file — works in SEA for ESM modules (escapes the SEA loader
 *      by loading a CJS file via createRequire, whose import() runs under
 *      the normal filesystem loader)
 */
export default async function loadExternalModule(filePathOrUrl) {
  // Accept both file paths (strings) and URL objects (from pathToFileURL)
  const isUrl =
    filePathOrUrl instanceof URL ||
    (typeof filePathOrUrl === 'string' && filePathOrUrl.startsWith('file://'))
  const filePath = isUrl ? fileURLToPath(filePathOrUrl) : filePathOrUrl
  const fileUrl = isUrl
    ? typeof filePathOrUrl === 'string'
      ? filePathOrUrl
      : filePathOrUrl.href
    : pathToFileURL(filePath).href

  try {
    return await import(fileUrl)
  } catch (err) {
    if (err.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw err

    // SEA context — import() only works for built-in modules.
    // Try createRequire() for CJS modules.
    try {
      const mod = require(filePath)
      // Normalize to match import() return shape (default export + named exports)
      if (mod && typeof mod === 'object' && mod.__esModule) return mod
      return { default: mod, ...mod }
    } catch (reqErr) {
      if (reqErr.code !== 'ERR_REQUIRE_ESM') throw reqErr

      // ESM module in SEA — use the filesystem bridge.
      if (!seaImportBridge) {
        const bridgePath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          'sea-import-bridge.cjs',
        )
        seaImportBridge = require(bridgePath)
      }
      return await seaImportBridge(fileUrl)
    }
  }
}
