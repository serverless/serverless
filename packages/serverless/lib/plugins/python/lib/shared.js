import Appdir from 'appdirectory'
import { globSync } from 'glob'
import path from 'path'
import fse from 'fs-extra'
import sha256File from 'sha256-file'

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
 * The working path that all requirements will be compiled into
 * @param  {string} subfolder
 * @param  {string} servicePath
 * @param  {Object} options
 * @param  {Object} serverless
 * @return {string}
 */
function getRequirementsWorkingPath(
  subfolder,
  requirementsTxtDirectory,
  options,
  serverless,
) {
  // If we want to use the static cache
  if (options && options.useStaticCache) {
    if (subfolder) {
      const architecture = serverless.service.provider.architecture || 'x86_64'
      subfolder = `${subfolder}_${architecture}_slspyc`
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
    hash = `${hash}_${architecture}_slspyc.zip`
    return path.join(getUserCachePath(options), hash)
  }

  // If we don't want to use the static cache, then fallback to requirements file in .serverless directory
  return fallback
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
  const dirs = new Appdir({
    appName: 'serverless-python-requirements',
    appAuthor: 'UnitedIncome',
  })
  return dirs.userCache()
}

/**
 * Helper to get the md5 a a file's contents to determine if a requirements has a static cache
 * @param  {string} fullpath
 * @return {string}
 */
function sha256Path(fullpath) {
  return sha256File(fullpath)
}

export {
  checkForAndDeleteMaxCacheVersions,
  getRequirementsWorkingPath,
  getRequirementsLayerPath,
  getUserCachePath,
  sha256Path,
}
