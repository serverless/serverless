import fse from 'fs-extra'
import path from 'path'
import uniqBy from 'lodash.uniqby'
import JSZip from 'jszip'
import { addTree, writeZip } from './zipTree.js'
import { fileURLToPath } from 'url'

/**
 * Get the path to unzip_requirements.py, handling both source and bundled environments
 * @return {string}
 */
function getUnzipRequirementsPath() {
  let __dirname = path.dirname(fileURLToPath(import.meta.url))

  // When bundled with esbuild, we're in the dist directory
  if (__dirname.endsWith('dist')) {
    // Adjust to lib/plugins/python directory structure
    return path.join(__dirname, '../lib/plugins/python/unzip_requirements.py')
  }

  // In source, we go up one level from lib directory
  return fileURLToPath(new URL('../unzip_requirements.py', import.meta.url))
}

/**
 * Add the vendor helper to the current service tree.
 * @return {Promise}
 */
async function addVendorHelper() {
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
        // Initialize package properties if needed
        if (!func.package) func.package = {}
        if (!func.package.patterns) func.package.patterns = []
        func.package.patterns.push('unzip_requirements.py')
        individuallyPackagedFuncs.push(func)
      } else {
        sharedPackagedFuncs.push(func)
      }
    }

    // Step 3: Add helper for individually packaged functions
    // Process each unique module once (functions can share modules)
    if (individuallyPackagedFuncs.length > 0) {
      const uniqueFunctions = uniqBy(
        individuallyPackagedFuncs,
        (func) => func.module,
      )
      for (const func of uniqueFunctions) {
        if (this.log) {
          this.log.info(`Adding Python requirements helper to ${func.module}`)
        } else {
          this.serverless.cli.log(
            `Adding Python requirements helper to ${func.module}...`,
          )
        }
        await fse.copy(
          getUnzipRequirementsPath(),
          path.join(this.servicePath, func.module, 'unzip_requirements.py'),
        )
      }
    }

    // Step 4: Add helper for shared package
    // Only add if there are Python functions using the shared package
    if (sharedPackagedFuncs.length > 0) {
      if (this.log) {
        this.log.info('Adding Python requirements helper')
      } else {
        this.serverless.cli.log('Adding Python requirements helper...')
      }

      if (!this.serverless.service.package) this.serverless.service.package = {}
      if (!this.serverless.service.package.patterns)
        this.serverless.service.package.patterns = []

      this.serverless.service.package.patterns.push('unzip_requirements.py')

      await fse.copy(
        getUnzipRequirementsPath(),
        path.join(this.servicePath, 'unzip_requirements.py'),
      )
    }
  }
}

/**
 * Remove the vendor helper from the current service tree.
 * @return {Promise} the promise to remove the vendor helper.
 */
async function removeVendorHelper() {
  if (this.options.zip && this.options.cleanupZipHelper) {
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

    // Step 3: Remove helper from individually packaged functions
    // Process each unique module once (functions can share modules)
    if (individuallyPackagedFuncs.length > 0) {
      const uniqueFunctions = uniqBy(
        individuallyPackagedFuncs,
        (func) => func.module,
      )
      for (const func of uniqueFunctions) {
        if (this.log) {
          this.log.info(
            `Removing Python requirements helper from ${func.module}`,
          )
        } else {
          this.serverless.cli.log(
            `Removing Python requirements helper from ${func.module}...`,
          )
        }
        await fse.remove(
          path.join(this.servicePath, func.module, 'unzip_requirements.py'),
        )
      }
    }

    // Step 4: Remove helper from shared package
    // Only remove if there are Python functions using the shared package
    if (sharedPackagedFuncs.length > 0) {
      if (this.log) {
        this.log.info('Removing Python requirements helper')
      } else {
        this.serverless.cli.log('Removing Python requirements helper...')
      }
      await fse.remove(path.join(this.servicePath, 'unzip_requirements.py'))
    }
  }
}

/**
 * Zip up .serverless/requirements or .serverless/[MODULE]/requirements.
 * @return {Promise} the promise to pack requirements.
 */
async function packRequirements() {
  if (this.options.zip) {
    const servicePath =
      this.servicePath ||
      this.serverless?.config?.servicePath ||
      this.serverless?.serviceDir ||
      process.cwd()
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

    // Step 3: Pack requirements for individually packaged functions
    // Process each unique module once (functions can share modules)
    if (individuallyPackagedFuncs.length > 0) {
      const uniqueFunctions = uniqBy(
        individuallyPackagedFuncs,
        (func) => func.module,
      )
      for (const func of uniqueFunctions) {
        let packProgress
        if (this.progress && this.log) {
          packProgress = this.progress.get(
            `python-pack-requirements-${func.module}`,
          )
          packProgress.update(
            `Zipping required Python packages for ${func.module}`,
          )
          this.log.info(`Zipping required Python packages for ${func.module}`)
        } else {
          this.serverless.cli.log(
            `Zipping required Python packages for ${func.module}...`,
          )
        }
        func.package.patterns.push(`${func.module}/.requirements.zip`)
        const zip = await addTree(
          new JSZip(),
          path.join(servicePath, '.serverless', func.module, 'requirements'),
        )
        try {
          await writeZip(
            zip,
            path.join(servicePath, func.module, '.requirements.zip'),
          )
        } finally {
          packProgress && packProgress.remove()
        }
      }
    }

    // Step 4: Pack requirements for shared package
    // Only pack if there are Python functions using the shared package
    if (sharedPackagedFuncs.length > 0) {
      let packProgress
      if (this.progress) {
        packProgress = this.progress.get(`python-pack-requirements`)
      } else {
        this.serverless.cli.log('Zipping required Python packages...')
      }
      this.serverless.service.package.patterns.push('.requirements.zip')
      const zip = await addTree(
        new JSZip(),
        path.join(servicePath, '.serverless', 'requirements'),
      )
      try {
        await writeZip(zip, path.join(servicePath, '.requirements.zip'))
      } finally {
        packProgress && packProgress.remove()
      }
    }
  }
}

export { addVendorHelper, removeVendorHelper, packRequirements }
