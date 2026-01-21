import fse from 'fs-extra'
import { globSync } from 'glob'
import path from 'path'
import JSZip from 'jszip'
import { writeZip, zipFile } from './zipTree.js'

/**
 * Inject requirements into packaged application.
 * @param {string} requirementsPath requirements folder path
 * @param {string} packagePath target package path
 * @param {string} injectionRelativePath installation directory in target package
 * @param {Object} options our options object
 * @return {Promise} the JSZip object constructed.
 */
async function injectRequirements(
  requirementsPath,
  packagePath,
  injectionRelativePath,
  options,
) {
  const noDeploy = new Set(options.noDeploy || [])
  const buffer = await fse.readFile(packagePath)
  const zip = await JSZip.loadAsync(buffer)
  const files = globSync([path.join(requirementsPath, '**')], {
    nodir: true,
    dot: true,
    follow: true,
  })
  const pairs = files
    .map((file) => [
      file,
      path.join(injectionRelativePath, path.relative(requirementsPath, file)),
    ])
    .filter(
      ([file, relativeFile]) =>
        !file.endsWith('/') &&
        !relativeFile.match(/^__pycache__[\\/]/) &&
        !noDeploy.has(relativeFile.split(/([-\\/]|\.py$|\.pyc$)/, 1)[0]),
    )

  for (const [file, relativeFile] of pairs) {
    const fileStat = await fse.stat(file)
    await zipFile(zip, relativeFile, fse.readFile(file), {
      unixPermissions: fileStat.mode,
      createFolders: false,
    })
  }
  await writeZip(zip, packagePath)
}

/**
 * Remove all modules but the selected module from a package.
 * @param {string} source path to original package
 * @param {string} target path to result package
 * @param {string} module module to keep
 * @return {Promise} the JSZip object written out.
 */
async function moveModuleUp(source, target, module) {
  const targetZip = new JSZip()
  const buffer = await fse.readFile(source)
  const sourceZip = await JSZip.loadAsync(buffer)
  const entries = sourceZip.filter(
    (file) =>
      file.startsWith(module + '/') ||
      file.startsWith('serverless_sdk/') ||
      file.match(/^s_.*\.py/) !== null,
  )
  for (const srcZipObj of entries) {
    await zipFile(
      targetZip,
      srcZipObj.name.startsWith(module + '/')
        ? srcZipObj.name.replace(module + '/', '')
        : srcZipObj.name,
      srcZipObj.async('nodebuffer'),
    )
  }
  await writeZip(targetZip, target)
}

/**
 * Inject requirements into packaged application.
 * @return {Promise} the combined promise for requirements injection.
 */
async function injectAllRequirements(funcArtifact) {
  if (this.options.layer) return

  let injectProgress
  if (this.progress && this.log) {
    injectProgress = this.progress.get('python-inject-requirements')
    injectProgress.update('Injecting required Python packages to package')
    this.log.info('Injecting required Python packages to package')
  } else {
    this.serverless.cli.log('Injecting required Python packages to package...')
  }

  let injectionRelativePath = '.'
  if (this.serverless.service.provider.name == 'scaleway') {
    injectionRelativePath = 'package'
  }

  try {
    const servicePath =
      this.servicePath ||
      this.serverless?.config?.servicePath ||
      this.serverless?.serviceDir ||
      process.cwd()

    const resolveArtifactPath = (artifactPath) => {
      if (!artifactPath) return null
      return path.isAbsolute(artifactPath)
        ? artifactPath
        : path.join(servicePath, artifactPath)
    }

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

    // Step 3: Handle module relocation for individually packaged functions
    // This is needed when functions are in subdirectories (have custom module paths)
    for (const func of individuallyPackagedFuncs) {
      if (func.module !== '.') {
        const artifact = func.package ? func.package.artifact : funcArtifact
        const sourceArtifact = resolveArtifactPath(artifact)
        const newArtifactRelative = path.join(
          '.serverless',
          `${func.module}-${func.name}.zip`,
        )
        const targetArtifact = resolveArtifactPath(newArtifactRelative)
        func.package = func.package || {}
        func.package.artifact = newArtifactRelative
        await moveModuleUp(sourceArtifact, targetArtifact, func.module)
      }
    }

    // Step 4: Inject requirements into individually packaged functions
    // Each function gets its own copy of dependencies
    for (const func of individuallyPackagedFuncs) {
      if (!this.options.zip) {
        const requirementsPath = path.join(
          this.serverless.serviceDir,
          '.serverless',
          func.module,
          'requirements',
        )
        const packagePath = resolveArtifactPath(func.package.artifact)

        await injectRequirements(
          requirementsPath,
          packagePath,
          injectionRelativePath,
          this.options,
        )
      }
    }

    // Step 5: Inject requirements into shared package
    // Only inject if there are functions using the shared package
    if (sharedPackagedFuncs.length > 0 && !this.options.zip) {
      const requirementsPath = path.join(
        this.serverless.serviceDir,
        '.serverless',
        'requirements',
      )
      const packagePath = resolveArtifactPath(
        this.serverless.service.package.artifact || funcArtifact,
      )

      await injectRequirements(
        requirementsPath,
        packagePath,
        injectionRelativePath,
        this.options,
      )
    }

    // Step 6: Inject requirements into agent packages
    const targetAgents = this.targetAgents || []
    for (const agent of targetAgents) {
      const agents =
        this.serverless.service.agents ||
        this.serverless.configurationInput?.agents ||
        {}
      const agentConfig = agents[agent.name]

      if (!agentConfig?.package?.artifact) continue

      const requirementsPath = path.join(
        this.serverless.serviceDir,
        '.serverless',
        `agent-${agent.name}`,
        'requirements',
      )

      // Skip if no requirements were installed
      if (!fse.existsSync(requirementsPath)) continue

      const packagePath = resolveArtifactPath(agentConfig.package.artifact)

      if (this.log) {
        this.log.info(`Injecting Python packages into agent "${agent.name}"`)
      }

      await injectRequirements(
        requirementsPath,
        packagePath,
        injectionRelativePath,
        this.options,
      )
    }
  } finally {
    injectProgress && injectProgress.remove()
  }
}

export { injectAllRequirements }
