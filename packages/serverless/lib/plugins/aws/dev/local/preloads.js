/**
 * Preloads named in the deployed NODE_OPTIONS (`--require`, `--import`) on this machine. The
 * deployed configuration can be changed by anyone allowed to edit the function in AWS, and here it
 * would run as the developer, so a preload applies only when it names one of the developer's own
 * files: a relative or absolute path to a regular file in the service directory, outside every
 * `node_modules` directory. Everything else is left out, with a reason:
 *
 * - `code`: code given inline or as a URL (`data:`, `https:`, `node:`, …);
 * - `package`: a package name (`dd-trace/init`), or a file inside a `node_modules` directory;
 * - `outside`: anything else that does not name a file in the service directory, such as a
 *   Lambda layer under /opt, a network or device path, or a file that is not there.
 *
 * The deployed text is first checked as a string, and only a path that names a place inside the
 * service directory ever reaches the file system: a network path (`\\host\share`) is never opened.
 * Then the real paths of both sides (every link followed) are checked again, and the real path is
 * what the handler process gets.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

/** Where Lambda puts the function's code: a path under it names the same file in the task root. */
const LAMBDA_TASK_ROOT = '/var/task/'
/** UNC and device namespaces: `\\host\share`, `//host/share`, `\\?\…`, `\\.\…`. */
const NETWORK_OR_DEVICE = /^[\\/]{2}/
const DRIVE = /^[A-Za-z]:/
const DRIVE_ROOT = /^[A-Za-z]:[\\/]/
const URL_SCHEME = /^[A-Za-z][A-Za-z\d+.-]+:/
const RELATIVE = /^\.\.?(?:[\\/]|$)/
const PACKAGES_DIR = 'node_modules'
/** The files `require()` tries for a path, in Node.js's order; directories are not followed. */
const REQUIRE_EXTENSIONS = ['', '.js', '.json', '.node']

const localFileSystem = Object.freeze({
  realpath: (name) => fs.realpathSync.native(name),
  isFile: (name) => {
    try {
      return fs.statSync(name).isFile()
    } catch {
      return false
    }
  },
})

/**
 * NODE_OPTIONS separates arguments by spaces and groups them with double quotes, inside which a
 * backslash escapes the next character. Outside quotes a backslash is an ordinary character.
 */
const nodeOptionsValue = (value) =>
  /[ "]/.test(value) ? `"${value.replace(/[\\"]/g, '\\$&')}"` : value

/**
 * Where `file` lies relative to `root`: `{ inside, packaged }`, from the strings alone. Case is
 * ignored where the file system usually ignores it (Windows, macOS); the real-path check that
 * follows decides for the file system actually in use.
 */
const placeOf = (root, file, { pathApi, caseless }) => {
  const fold = (value) => (caseless ? value.toLowerCase() : value)
  const relative = pathApi.relative(fold(root), fold(file))
  const inside =
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relative)
  return {
    inside,
    // Any spelling counts: on a case-insensitive file system they are one directory.
    packaged:
      inside &&
      relative
        .split(pathApi.sep)
        .some((segment) => segment.toLowerCase() === PACKAGES_DIR),
  }
}

/**
 * The deployed text as a path on this machine, `{ request }`, or `{ reason }` when its form alone
 * rules it out. No file system call happens here.
 */
const requestOf = (specifier, { imports, pathApi }) => {
  let request = String(specifier ?? '')
  if (!request) return { reason: 'code' }
  if (request.startsWith(LAMBDA_TASK_ROOT)) {
    request = `./${request.slice(LAMBDA_TASK_ROOT.length)}`
  }
  if (URL_SCHEME.test(request)) {
    if (!imports || !request.startsWith('file:')) return { reason: 'code' }
    let url
    try {
      url = new URL(request)
    } catch {
      return { reason: 'code' }
    }
    // A host names another machine: on Windows it would become a network path.
    if (url.host !== '') return { reason: 'outside' }
    try {
      request = fileURLToPath(url)
    } catch {
      return { reason: 'outside' }
    }
  }
  if (NETWORK_OR_DEVICE.test(request)) return { reason: 'outside' }
  // A drive is a path only in full (`C:\…`) and with Windows paths; `C:x` is relative to that
  // drive's current directory.
  if (
    DRIVE.test(request) &&
    !(pathApi === path.win32 && DRIVE_ROOT.test(request))
  ) {
    return { reason: 'outside' }
  }
  if (!RELATIVE.test(request) && !pathApi.isAbsolute(request)) {
    return { reason: 'package' }
  }
  return { request }
}

/**
 * The argument a deployed `--require <specifier>` (`-r`) or `--import <specifier>` becomes on this
 * machine, `{ argument }`, written so it works here: an absolute path for `--require`, a file URL
 * for `--import`; or `{ reason }` when it is left out. Relative paths are taken from the handler's
 * task root, then from the service directory; `--require` also tries the extensions `require()`
 * adds.
 */
export const preloadArgument = ({
  flag,
  specifier,
  serviceDir,
  taskRoot = serviceDir,
  pathApi = path,
  platform = process.platform,
  fileSystem = localFileSystem,
  fileUrl = (file) => pathToFileURL(file).href,
}) => {
  const imports = flag === '--import'
  const { request, reason } = requestOf(specifier, { imports, pathApi })
  if (reason) return { reason }
  const caseless = pathApi === path.win32 || platform === 'darwin'
  const options = { pathApi, caseless }
  let realRoot
  const realServiceDir = () => {
    realRoot ??= fileSystem.realpath(serviceDir)
    return realRoot
  }
  let found = 'outside'
  for (const root of [...new Set([taskRoot, serviceDir])]) {
    const candidate = pathApi.resolve(root, request)
    let place = placeOf(serviceDir, candidate, options)
    // An absolute path may name the service directory as given or by its real path. Spelled any
    // other way (an 8.3 short name, another link to it) it is left out on purpose, even when it
    // leads inside: deciding otherwise would mean opening a path the deployed value chose.
    if (!place.inside && pathApi.isAbsolute(request)) {
      try {
        place = placeOf(realServiceDir(), candidate, options)
      } catch {
        return { reason: 'outside' }
      }
    }
    if (!place.inside) continue
    if (place.packaged) {
      found = 'package'
      continue
    }
    for (const extension of imports ? [''] : REQUIRE_EXTENSIONS) {
      let real
      try {
        real = fileSystem.realpath(`${candidate}${extension}`)
        if (!fileSystem.isFile(real)) continue
        // Real paths are spelled as stored on both sides, so they compare exactly.
        const placed = placeOf(realServiceDir(), real, {
          pathApi,
          caseless: false,
        })
        if (!placed.inside) continue
        if (placed.packaged) {
          found = 'package'
          continue
        }
      } catch {
        continue
      }
      // A file URL cannot carry a backslash on POSIX: node refuses `%5C` in a specifier.
      if (imports && pathApi === path.posix && real.includes('\\')) continue
      return {
        argument: imports
          ? `--import=${fileUrl(real)}`
          : `--require=${nodeOptionsValue(real)}`,
      }
    }
  }
  return { reason: found }
}
