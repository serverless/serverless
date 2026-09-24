import { globSync } from 'glob'
import path from 'path'
import fse from 'fs-extra'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * This helper will check if we're using static cache and have max
 * versions enabled and will delete older versions in a fifo fashion
 * @param  {Object} options
 * @param  {Object} serverless
 * @return {undefined}
 */
function checkForAndDeleteMaxCacheVersions({ serverless, options, log }) {
  // If we're using the static cache, and we have static cache max versions enabled
  if (
    options.useStaticCache &&
    options.staticCacheMaxVersions &&
    parseInt(options.staticCacheMaxVersions) > 0
  ) {
    // Get the list of our cache files
    const files = globSync(
      [path.join(getUserCachePath(options), '*_slspyc/')],
      { mark: true },
    )
    // Check if we have too many
    if (files.length >= options.staticCacheMaxVersions) {
      // Sort by modified time
      files.sort(function (a, b) {
        return fse.statSync(a).mtime.getTime() - fse.statSync(b).mtime.getTime()
      })
      // Remove the older files...
      var items = 0
      for (
        var i = 0;
        i < files.length - options.staticCacheMaxVersions + 1;
        i++
      ) {
        fse.removeSync(files[i])
        items++
      }

      // Log the number of cache files flushed
      if (log) {
        log.info(
          `Removed ${items} items from cache because of staticCacheMaxVersions`,
        )
      } else {
        serverless.cli.log(
          `Removed ${items} items from cache because of staticCacheMaxVersions`,
        )
      }
    }
  }
}

/**
 * A short hash of the settings that change what an install of a given
 * requirements.txt produces: the interpreter and runtime, where and how pip
 * runs and with which extra arguments, and what is stripped from or added to
 * the result. Every static cache name includes it, so changing one of them
 * installs afresh instead of reusing an install made another way (for
 * example macOS wheels cached before switching to Docker or to Linux wheels).
 * @param  {Object} options
 * @param  {Object} serverless
 * @return {string}
 */
function installSettingsHash(options, serverless) {
  const settings = [
    options.pythonBin,
    serverless?.service?.provider?.runtime,
    options.installer,
    options.dockerizePip,
    options.dockerImage,
    options.dockerFile,
    options.pipCmdExtraArgs,
    options.slim,
    options.slimPatterns,
    options.slimPatternsAppendDefaults,
    options.vendor,
  ]
  return createHash('sha256')
    .update(JSON.stringify(settings))
    .digest('hex')
    .slice(0, 12)
}

/**
 * The working path that all requirements will be compiled into
 * @param  {string} subfolder
 * @param  {string} requirementsTxtDirectory
 * @param  {Object} options
 * @param  {Object} serverless
 * @param  {string} [architectureOverride] - Optional architecture override (e.g., 'arm64' for AgentCore agents)
 * @return {string}
 */
function getRequirementsWorkingPath(
  subfolder,
  requirementsTxtDirectory,
  options,
  serverless,
  architectureOverride,
) {
  // If we want to use the static cache
  if (options && options.useStaticCache) {
    if (subfolder) {
      // Use architecture override if provided (for agents), otherwise use provider architecture
      const architecture =
        architectureOverride ||
        serverless.service.provider.architecture ||
        'x86_64'
      subfolder = `${subfolder}_${installSettingsHash(options, serverless)}_${architecture}_slspyc`
    }
    // If we have max number of cache items...

    return path.join(getUserCachePath(options), subfolder)
  }

  // If we don't want to use the static cache, then fallback to the way things used to work
  return path.join(requirementsTxtDirectory, 'requirements')
}

/**
 * Path of a cached requirements layer archive file
 * @param  {string} subfolder
 * @param  {string} fallback
 * @param  {Object} options
 * @param  {Object} serverless
 * @return {string}
 */
function getRequirementsLayerPath(hash, fallback, options, serverless) {
  // If we want to use the static cache
  if (hash && options && options.useStaticCache) {
    const architecture = serverless.service.provider.architecture || 'x86_64'
    hash = `${hash}_${installSettingsHash(options, serverless)}_${architecture}_slspyc.zip`
    return path.join(getUserCachePath(options), hash)
  }

  // If we don't want to use the static cache, then fallback to requirements file in .serverless directory
  return fallback
}

/**
 * The default per-user cache directory. On macOS and Linux the paths match
 * the historical defaults, so existing users' pip caches stay where they
 * are; changing them would silently orphan those caches. On Windows the
 * cache lives under the 'ServerlessFramework' vendor directory.
 * @param  {string} platform
 * @param  {Object} env
 * @return {string}
 */
function getDefaultUserCachePath(
  platform = process.platform,
  env = process.env,
) {
  const appName = 'serverless-python-requirements'
  if (platform === 'win32') {
    return path.join(
      env.LOCALAPPDATA || env.APPDATA,
      'ServerlessFramework',
      appName,
      'Cache',
    )
  }
  if (platform === 'darwin') {
    return path.join(env.HOME, 'Library', 'Caches', appName)
  }
  if (env.XDG_CACHE_HOME) {
    return path.join(env.XDG_CACHE_HOME, appName)
  }
  return path.join(env.HOME, '.cache', appName)
}

/**
 * The static cache path that will be used for this system + options, used if static cache is enabled
 * @param  {Object} options
 * @return {string}
 */
function getUserCachePath(options) {
  // If we've manually set the static cache location
  if (options && options.cacheLocation) {
    return path.resolve(options.cacheLocation)
  }

  // Otherwise, find/use the python-ey appdirs cache location
  return getDefaultUserCachePath()
}

/**
 * Helper to get the md5 a a file's contents to determine if a requirements has a static cache
 * @param  {string} fullpath
 * @return {string}
 */
function sha256Path(fullpath) {
  return createHash('sha256').update(readFileSync(fullpath)).digest('hex')
}

/**
 * pip compiles every dependency to a .pyc at install time. By default a .pyc is
 * only valid while it records its source's exact mtime, and the packaged zip pins
 * every entry to a fixed date (so unchanged code is not redeployed), which makes
 * every shipped .pyc stale on arrival: Lambda recompiles all of them on each cold
 * start, and its read-only filesystem can never keep the result.
 *
 * When SOURCE_DATE_EPOCH is set, py_compile writes hash-based .pyc files instead
 * (PEP 552, checked-hash). Those stay valid whatever the timestamps say, and a
 * source that does not match its .pyc is still recompiled, never run stale.
 * Only the presence of the variable matters to Python. The value is the zip
 * format's earliest date (1980-01-01), the lowest that every build tool reading
 * the variable can represent.
 *
 * Needs Python 3.7 or later, which is every runtime Lambda still supports. Older
 * Pythons ignore the variable and compile exactly as they did before.
 */
const DEFAULT_SOURCE_DATE_EPOCH = '315532800'

/**
 * The SOURCE_DATE_EPOCH the dependency install should run with: the user's own,
 * if they have set one, so reproducible-build setups keep their value
 * @param  {Object} env
 * @return {string}
 */
function getSourceDateEpoch(env = process.env) {
  return env.SOURCE_DATE_EPOCH || DEFAULT_SOURCE_DATE_EPOCH
}

export {
  checkForAndDeleteMaxCacheVersions,
  getRequirementsWorkingPath,
  getRequirementsLayerPath,
  getDefaultUserCachePath,
  getUserCachePath,
  installSettingsHash,
  getSourceDateEpoch,
  sha256Path,
}
