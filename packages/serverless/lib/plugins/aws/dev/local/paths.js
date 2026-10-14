/**
 * Files the laptop runtime starts handler processes with. In the source tree the runtime clients
 * sit in `clients/` next to this module. The released CLI runs every module from its bundle in
 * `<package>/dist`, and the release copies the clients to the source-tree layout under
 * `<package>/lib/...` (`packages/sf-core/scripts/prepareDistributionTarballs.js`), so the bundle
 * directory is mapped back onto that layout; the copy step and the release check call this same
 * function, so the three cannot drift.
 */
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { isReleasedBundleDir } from '../attach/naming.js'

export const CLIENT_FILES = Object.freeze({
  node: 'node-client.mjs',
  python: 'python_client.py',
})

/** Where the runtime client `name` lives, seen from the module directory `moduleDir`. */
export const clientPathFrom = (moduleDir, name) =>
  path.join(
    isReleasedBundleDir(moduleDir)
      ? path.join(moduleDir, '../lib/plugins/aws/dev/local')
      : moduleDir,
    'clients',
    name,
  )

/** The runtime client `name` for this running CLI. */
export const clientPath = (name) =>
  clientPathFrom(path.dirname(fileURLToPath(import.meta.url)), name)

/**
 * The tsx loader as a `file:` URL for `node --import`, resolved from this CLI's own dependencies
 * (the release ships tsx as files next to the bundle), or null when it cannot be found.
 */
export const tsxLoaderUrl = (
  resolve = createRequire(import.meta.url).resolve,
) => {
  try {
    return pathToFileURL(resolve('tsx')).href
  } catch {
    return null
  }
}
