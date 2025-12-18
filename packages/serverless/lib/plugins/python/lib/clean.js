import fse from 'fs-extra'
import path from 'path'
import { globSync } from 'glob'
import { getUserCachePath } from './shared.js'

/**
 * clean up .requirements and .requirements.zip and unzip_requirements.py
 * @return {Promise}
 */
async function cleanup() {
  const artifacts = ['.requirements']
  if (this.options.zip) {
    // Step 1: Get all Python functions and set default module
    const pythonFuncs = this.targetFuncs
      .filter((func) => {
        const runtime = func.runtime || this.serverless.service.provider.runtime
        return runtime && runtime.match(/^python.*/)
      })
      .map((func) => {
        // Default module to '.' if not specified
        if (!func.module) {
          func.module = '.'
        }
        return func
      })

    // Step 2: Separate functions by packaging mode
    // Check BOTH function-level AND service-level package.individually
    const individuallyPackagedFuncs = []
    const sharedPackagedFuncs = []

    for (const func of pythonFuncs) {
      // A function is individually packaged if EITHER:
      // 1. It has package.individually: true at function level, OR
      // 2. The service has package.individually: true at service level
      const isFunctionIndividual = func.package?.individually === true
      const isServiceIndividual =
        this.serverless.service.package?.individually === true

      if (isFunctionIndividual || isServiceIndividual) {
        individuallyPackagedFuncs.push(func)
      } else {
        sharedPackagedFuncs.push(func)
      }
    }

    // Step 3: Add cleanup artifacts for individually packaged functions
    for (const func of individuallyPackagedFuncs) {
      artifacts.push(path.join(func.module, '.requirements.zip'))
      artifacts.push(path.join(func.module, 'unzip_requirements.py'))
    }

    // Step 4: Add cleanup artifacts for shared package
    // Only add if there are Python functions using the shared package
    if (sharedPackagedFuncs.length > 0) {
      artifacts.push('.requirements.zip')
      artifacts.push('unzip_requirements.py')
    }
  }

  await Promise.all(
    artifacts.map((artifact) =>
      fse.remove(path.join(this.servicePath, artifact)),
    ),
  )
}

/**
 * Clean up static cache, remove all items in there
 * @return {Promise}
 */
async function cleanupCache() {
  const cacheLocation = getUserCachePath(this.options)
  if (fse.existsSync(cacheLocation)) {
    let cleanupProgress
    if (this.serverless) {
      if (this.log) {
        cleanupProgress = this.progress.get('python-cleanup-cache')
        cleanupProgress.notice('Removing static caches')
        this.log.info(`Removing static caches at: ${cacheLocation}`)
      } else {
        this.serverless.cli.log(`Removing static caches at: ${cacheLocation}`)
      }
    }

    // Only remove cache folders that we added, just incase someone accidentally puts a weird
    // static cache location so we don't remove a bunch of personal stuff
    const files = globSync([path.join(cacheLocation, '*slspyc/')], {
      mark: true,
      dot: false,
    })
    try {
      await Promise.all(files.map((file) => fse.remove(file)))
    } finally {
      cleanupProgress && cleanupProgress.remove()
    }
  } else {
    if (this.serverless) {
      if (this.log) {
        this.log.info(`No static cache found`)
      } else {
        this.serverless.cli.log(`No static cache found`)
      }
    }
    return
  }
}

export { cleanup, cleanupCache }
