import path from 'path'
import fsp from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import micromatch from 'micromatch'
import ServerlessError from '../../../serverless-error.js'
import parseS3URI from '../../aws/utils/parse-s3-uri.js'
import { log } from '@serverless/util'

export default {
  defaultExcludes: [
    '.git/**',
    '.gitignore',
    '.DS_Store',
    'npm-debug.log',
    'yarn-*.log',
    '.serverless/**',
    '.serverless_plugins/**',
  ],

  getIncludes(include) {
    const packageIncludes = [
      ...(this.serverless.service.package.include || []),
      ...(this.serverless.service.package.patterns || []),
    ]
    return _.union(packageIncludes, include)
  },

  getRuntime(runtime) {
    const defaultRuntime = 'nodejs20.x'
    return runtime || this.serverless.service.provider.runtime || defaultRuntime
  },

  getExcludes(exclude, excludeLayers) {
    const packageExcludes = this.serverless.service.package.exclude || []
    // add local service plugins Path
    const pluginsLocalPath = this.serverless.pluginManager.parsePluginsObject(
      this.serverless.service.plugins,
    ).localPath
    const localPathExcludes = []
    if (pluginsLocalPath) {
      localPathExcludes.push(pluginsLocalPath)
    }
    // add layer paths
    const layerExcludes = excludeLayers
      ? this.serverless.service
          .getAllLayers()
          .map((layer) => `${this.serverless.service.getLayer(layer).path}/**`)
      : []
    // add defaults for exclude

    const serverlessConfigFileExclude = this.serverless.configurationFilename
      ? [this.serverless.configurationFilename]
      : []

    const configurationInput = this.serverless.configurationInput
    const envFilesExclude =
      configurationInput && configurationInput.useDotenv ? ['.env*'] : []

    return _.union(
      this.defaultExcludes,
      serverlessConfigFileExclude,
      localPathExcludes,
      packageExcludes,
      layerExcludes,
      envFilesExclude,
      exclude,
    )
  },

  async packageService() {
    let shouldPackageService = false
    let shownFuncPackageWarning = false
    const allFunctions = this.serverless.service.getAllFunctions()
    let packagePromises = allFunctions.map(async (functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName)
      if (functionObject.image) return
      functionObject.package = functionObject.package || {}
      if (functionObject.package.disable) {
        log.info(`Packaging disabled for function: "${functionName}"`)
        return
      }
      if (functionObject.package.artifact) {
        if (parseS3URI(functionObject.package.artifact)) return
        try {
          await fsp.access(
            path.resolve(
              this.serverless.serviceDir,
              functionObject.package.artifact,
            ),
          )
          return
        } catch (error) {
          throw new ServerlessError(
            'Cannot access package artifact at ' +
              `"${functionObject.package.artifact}" (for "${functionName}"): ${error.message}`,
            'INVALID_PACKAGE_ARTIFACT_PATH',
          )
        }
      }
      if (
        functionObject.package.individually ||
        this.serverless.service.package.individually
      ) {
        await this.packageFunction(functionName)
        return
      }

      // show warning if package patterns in function are provided
      // without package.individually set to true at service level or function level.
      if (functionObject.package.patterns && !shownFuncPackageWarning) {
        shownFuncPackageWarning = true
        log.warning()
        const warningMessage = [
          'Package patterns at function level are only applicable ',
          'if package.individually is set to true at service level or function level in serverless.yaml.',
          ' The framework will ignore the patterns defined at the function level and apply only the service-wide ones.',
        ].join('')
        log.warning(warningMessage)
      }

      shouldPackageService = true
    })
    const allLayers = this.serverless.service.getAllLayers()
    packagePromises = packagePromises.concat(
      allLayers.map(async (layerName) => {
        const layerObject = this.serverless.service.getLayer(layerName)
        layerObject.package = layerObject.package || {}
        if (layerObject.package.artifact) return
        await this.packageLayer(layerName)
      }),
    )

    // Package agents that need code deployment
    const agentsToPackage = this.getAgentsToPackage()
    packagePromises = packagePromises.concat(
      agentsToPackage.map(async ({ name, config }) => {
        config.package = config.package || {}
        if (config.package.artifact) return
        log.info(`Packaging agent "${name}"`)
        await this.packageAgent(name)
      }),
    )

    await Promise.all(packagePromises)
    if (shouldPackageService) {
      if (this.serverless.service.package.artifact) {
        if (parseS3URI(this.serverless.service.package.artifact)) return
        try {
          await fsp.access(
            path.resolve(
              this.serverless.serviceDir,
              this.serverless.service.package.artifact,
            ),
          )
          return
        } catch (error) {
          throw new ServerlessError(
            'Cannot access package artifact at ' +
              `"${this.serverless.service.package.artifact}": ${error.message}`,
            'INVALID_PACKAGE_ARTIFACT_PATH',
          )
        }
      }
      await this.packageAll()
    }
  },

  async packageAll() {
    const zipFileName = `${this.serverless.service.service}.zip`

    return this.resolveFilePathsAll().then((filePaths) =>
      this.zipFiles(filePaths, zipFileName).then((filePath) => {
        // only set the default artifact for backward-compatibility
        // when no explicit artifact is defined
        if (!this.serverless.service.package.artifact) {
          this.serverless.service.package.artifact = filePath
          this.serverless.service.artifact = filePath
        }
        return filePath
      }),
    )
  },

  async packageFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName)
    if (functionObject.image) return null

    const funcPackageConfig = functionObject.package || {}

    // use the artifact in function config if provided
    if (funcPackageConfig.artifact) {
      const filePath = path.resolve(
        this.serverless.serviceDir,
        funcPackageConfig.artifact,
      )
      functionObject.package.artifact = filePath
      return filePath
    }

    // use the artifact in service config if provided
    // and if the function is not set to be packaged individually
    if (
      this.serverless.service.package.artifact &&
      !funcPackageConfig.individually
    ) {
      const filePath = path.resolve(
        this.serverless.serviceDir,
        this.serverless.service.package.artifact,
      )
      funcPackageConfig.artifact = filePath

      return filePath
    }

    const zipFileName = `${functionName}.zip`

    const filePaths = await this.resolveFilePathsFunction(functionName)
    const artifactPath = await this.zipFiles(filePaths, zipFileName)
    funcPackageConfig.artifact = path.relative(
      this.serverless.serviceDir,
      artifactPath,
    )
    return artifactPath
  },

  async packageLayer(layerName) {
    const layerObject = this.serverless.service.getLayer(layerName)

    const zipFileName = `${layerName}.zip`

    return this.resolveFilePathsLayer(layerName)
      .then((filePaths) =>
        filePaths.map((f) =>
          path.resolve(
            this.serverless.serviceDir,
            path.join(layerObject.path, f),
          ),
        ),
      )
      .then((filePaths) =>
        this.zipFiles(
          filePaths,
          zipFileName,
          path.resolve(this.serverless.serviceDir, layerObject.path),
        ).then((artifactPath) => {
          layerObject.package = {
            artifact: artifactPath,
          }
          return artifactPath
        }),
      )
  },

  /**
   * Get all agents that need code packaging (have entryPoint, no containerImage/docker/s3.bucket)
   */
  getAgentsToPackage() {
    const agents =
      this.serverless.service.agents ||
      this.serverless.configurationInput?.agents ||
      {}

    return Object.entries(agents)
      .filter(([, config]) => {
        // Only runtime agents
        if (config.type !== 'runtime') return false

        const artifact = config.artifact || {}

        // Skip if using container image
        if (artifact.containerImage) return false

        // Skip if using Docker build
        if (artifact.docker) return false

        // Skip if user specified their own S3 bucket (manual management)
        if (artifact.s3?.bucket) return false

        // Need entryPoint for code deployment
        if (!artifact.entryPoint) return false

        return true
      })
      .map(([name, config]) => ({ name, config }))
  },

  /**
   * Package an agent for code deployment
   */
  async packageAgent(agentName) {
    const agents =
      this.serverless.service.agents ||
      this.serverless.configurationInput?.agents ||
      {}
    const agentConfig = agents[agentName]

    if (!agentConfig) return null

    const agentPackageConfig = agentConfig.package || {}

    // Use the artifact in agent config if provided (pre-packaged)
    if (agentPackageConfig.artifact) {
      const filePath = path.resolve(
        this.serverless.serviceDir,
        agentPackageConfig.artifact,
      )
      agentConfig.package = agentConfig.package || {}
      agentConfig.package.artifact = filePath
      return filePath
    }

    const zipFileName = `agent-${agentName}.zip`

    const filePaths = await this.resolveFilePathsAgent(agentName)
    const artifactPath = await this.zipFiles(filePaths, zipFileName)

    agentConfig.package = agentConfig.package || {}
    agentConfig.package.artifact = path.relative(
      this.serverless.serviceDir,
      artifactPath,
    )

    return artifactPath
  },

  async resolveFilePathsAgent(agentName) {
    const agents =
      this.serverless.service.agents ||
      this.serverless.configurationInput?.agents ||
      {}
    const agentConfig = agents[agentName]
    const agentPackageConfig = agentConfig?.package || {}

    // Agent-specific exclusions (Python cache files)
    const agentExcludes = [
      '**/__pycache__/**',
      '**/*.pyc',
      '**/*.pyo',
      '**/.pytest_cache/**',
      '**/*.egg-info/**',
    ]

    return this.resolveFilePathsFromPatterns(
      await this.excludeDevDependencies({
        exclude: this.getExcludes(
          [...agentExcludes, ...(agentPackageConfig.exclude || [])],
          true,
        ),
        include: this.getIncludes([
          ...(agentPackageConfig.include || []),
          ...(agentPackageConfig.patterns || []),
        ]),
        contextName: `agent "${agentName}"`,
      }),
    )
  },

  async resolveFilePathsAll() {
    return this.resolveFilePathsFromPatterns(
      await this.excludeDevDependencies({
        exclude: this.getExcludes([], true),
        include: this.getIncludes(),
        contextName: 'service package',
      }),
    )
  },

  async resolveFilePathsFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName)
    const funcPackageConfig = functionObject.package || {}

    return this.resolveFilePathsFromPatterns(
      await this.excludeDevDependencies({
        exclude: this.getExcludes(funcPackageConfig.exclude, true),
        include: this.getIncludes([
          ...(funcPackageConfig.include || []),
          ...(funcPackageConfig.patterns || []),
        ]),
        contextName: `function "${functionName}"`,
      }),
    )
  },

  async resolveFilePathsLayer(layerName) {
    const layerObject = this.serverless.service.getLayer(layerName)
    const layerPackageConfig = layerObject.package || {}

    return this.resolveFilePathsFromPatterns(
      await this.excludeDevDependencies({
        exclude: this.getExcludes(layerPackageConfig.exclude, false),
        include: this.getIncludes([
          ...(layerPackageConfig.include || []),
          ...(layerPackageConfig.patterns || []),
        ]),
        contextName: `layer "${layerName}"`,
      }),
      layerObject.path,
    )
  },

  async resolveFilePathsFromPatterns(params, prefix) {
    const patterns = []
    const devDependencyExcludeSet = params.devDependencyExcludeSet || new Set()

    params.exclude.forEach((pattern) => {
      // Ensure to apply dev dependency exclusion as last
      if (devDependencyExcludeSet.has(pattern)) return
      if (pattern.charAt(0) !== '!') {
        patterns.push(`!${pattern}`)
      } else {
        patterns.push(pattern.substring(1))
      }
    })

    // push the include globs to the end of the array
    // (files and folders will be re-added again even if they were excluded beforehand)
    params.include.forEach((pattern) => {
      patterns.push(pattern)
    })

    for (const pattern of devDependencyExcludeSet) {
      if (pattern.charAt(0) !== '!') {
        patterns.push(`!${pattern}`)
      } else {
        patterns.push(pattern.substring(1))
      }
    }

    // NOTE: please keep this order of concatenating the include params
    // rather than doing it the other way round!
    // see https://github.com/serverless/serverless/pull/5825 for more information
    return globby(['**'].concat(params.include), {
      cwd: path.join(this.serverless.serviceDir, prefix || ''),
      dot: true,
      silent: true,
      follow: true,
      nodir: true,
      expandDirectories: false,
    }).then((allFilePaths) => {
      const filePathStates = allFilePaths.reduce(
        (p, c) => Object.assign(p, { [c]: true }),
        {},
      )
      patterns
        // micromatch only does / style path delimiters, so convert them if on windows
        .map((p) => {
          return process.platform === 'win32' ? p.replace(/\\/g, '/') : p
        })
        .forEach((p) => {
          const exclude = p.startsWith('!')
          const pattern = exclude ? p.slice(1) : p
          micromatch(allFilePaths, [pattern], { dot: true }).forEach((key) => {
            filePathStates[key] = !exclude
          })
        })
      const filePaths = Object.entries(filePathStates)
        .filter((r) => r[1] === true)
        .map((r) => r[0])
      if (filePaths.length !== 0) return filePaths
      throw new ServerlessError(
        'No file matches include / exclude patterns',
        'NO_MATCHED_FILES',
      )
    })
  },
}
