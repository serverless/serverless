import path from 'path'
import { pathToFileURL } from 'url'
import { copyFile, readFile, rm, stat, writeFile } from 'fs/promises'
import { createWriteStream, existsSync } from 'fs'
import * as esbuild from 'esbuild'
import archiver from 'archiver'
import spawnExt from 'child-process-ext/spawn.js'
import _ from 'lodash'
import pLimit from 'p-limit'
import { globby } from 'globby'
import micromatch from 'micromatch'
import ServerlessError from '../../serverless-error.js'
import { log } from '@serverless/util'

const nodeRuntimeRe = /nodejs(?<version>\d+).x/

const logger = log.get('esbuild')

class Esbuild {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this._functions = undefined

    this._buildProperties = _.memoize(this._buildProperties.bind(this))
    this._readPackageJson = _.memoize(this._readPackageJson.bind(this))

    this.hooks = {
      'before:dev-build:build': async () => {
        if (await this._shouldRun('originalHandler')) {
          await this._build('originalHandler')
        }
      },
      'after:dev-build:build': async () => {},
      'before:invoke:local:invoke': async () => {
        if (await this._shouldRun()) {
          await this._build()
          this._setConfigForLocalInvocation()
        }
      },
      // Make sure we build for the serverless-offline plugin too
      'before:offline:start': async () => {
        if (await this._shouldRun()) {
          await this._build()
          this._setConfigForLocalInvocation()
        }
      },
      'before:package:createDeploymentArtifacts': async () => {
        if (await this._shouldRun()) {
          await this._build()
          await this._preparePackageJson()
          await this._package()
        }
      },
      'before:deploy:function:packageFunction': async () => {
        if (await this._shouldRun()) {
          await this._build()
          await this._preparePackageJson()
          await this._package()
        }
      },
      'before:esbuild-package': async () => {},
    }

    this.commands = {
      'esbuild-package': {
        groupName: 'main',
        options: {},
        usage:
          'Internal hook for esbuild to call for packaging logic prior to internal packaging',
        lifecycleEvents: ['package'],
        type: 'entrypoint',
      },
    }
  }

  async asyncInit() {
    this._defineSchema()
  }

  _defineSchema() {
    this.serverless.configSchemaHandler.defineBuildProperty('esbuild', {
      anyOf: [
        {
          type: 'object',
          properties: {
            // The node modules that should not be bundled
            external: { type: 'array', items: { type: 'string' } },
            // These are node modules that should not be bundled but also not included in the package.json
            exclude: { type: 'array', items: { type: 'string' } },
            // The packages config, this can be set to override the behavior of external
            packages: { type: 'string', enum: ['external'] },
            // The concurrency to use for building functions. By default it will be set to the number of functions to build.
            // Meaning that all functions will be built concurrently.
            buildConcurrency: { type: 'number' },
            // Whether to bundle or not. Default is true
            bundle: { type: 'boolean' },
            // Whether to minify or not. Default is false
            minify: { type: 'boolean' },
            // If set to a boolean, true, then framework uses external sourcemaps and enables it on functions by default.
            sourcemap: {
              anyOf: [
                { type: 'boolean' },
                {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['inline', 'linked', 'external'],
                    },
                    setNodeOptions: { type: 'boolean' },
                  },
                },
              ],
            },
          },
        },
        { type: 'boolean' },
      ],
    })
  }

  async _shouldRun(handlerPropertyName = 'handler') {
    const functions = await this.functions(handlerPropertyName)
    return Object.keys(functions).length > 0
  }

  /**
   * Get a record of functions that should be built by esbuild
   */
  async functions(handlerPropertyName = 'handler') {
    if (this._functions) {
      return this._functions
    }

    const functions = this.options.function
      ? {
          [this.options.function]: this.serverless.service.getFunction(
            this.options.function,
          ),
        }
      : this.serverless.service.functions

    const functionsToBuild = {}

    for (const [alias, functionObject] of Object.entries(functions)) {
      const shouldBuild = await this._shouldBuildFunction(
        functionObject,
        handlerPropertyName,
      )
      if (shouldBuild) {
        functionsToBuild[alias] = functionObject
      }
    }

    this._functions = functionsToBuild

    return functionsToBuild
  }

  static WillEsBuildRun(
    configFile,
    serviceDir,
    handlerPropertyName = 'handler',
  ) {
    if (!configFile || configFile?.build?.esbuild === false) {
      return false
    }

    const functions = configFile.functions || {}

    const willRun = Object.entries(functions).some(([, functionObject]) => {
      // If user provided a function-level artifact, do not build this function
      if (functionObject?.package?.artifact) {
        return false
      }

      // If user provided a service-level artifact and packaging is not individual for this function,
      // do not build this function
      const servicePackage = configFile.package || {}
      const functionPackage = functionObject.package || {}
      const isFunctionPackagedIndividually =
        functionPackage.individually === true
      // If a service-level artifact is provided and the function itself is not individually packaged,
      // do not build this function (matches packageFunction behavior)
      if (!isFunctionPackagedIndividually && servicePackage.artifact) {
        return false
      }

      const functionHandler = functionObject[handlerPropertyName]
      if (!functionHandler) {
        return false
      }

      const runtime = functionObject.runtime || configFile.provider.runtime
      if (!runtime || !runtime.startsWith('nodejs')) {
        return false
      }

      if (configFile.build?.esbuild) {
        return true
      }

      const functionName = path.extname(functionHandler).slice(1)
      const handlerPath = functionHandler.replace(`.${functionName}`, '')
      let parsedExtension = undefined
      for (const extension of [
        '.js',
        '.ts',
        '.cjs',
        '.mjs',
        '.cts',
        '.mts',
        '.jsx',
        '.tsx',
      ]) {
        if (existsSync(path.join(serviceDir, handlerPath + extension))) {
          parsedExtension = extension
          break
        }
      }

      if (
        parsedExtension &&
        ['.ts', '.cts', '.mts', '.tsx'].includes(parsedExtension)
      ) {
        return true
      }

      return false
    })
    return willRun
  }

  /**
   * Take a Function Configuration and determine if it should be built by esbuild
   * @param {Object} functionObject - A Framework Function Configuration Object
   * @returns
   */
  async _shouldBuildFunction(functionObject, handlerPropertyName = 'handler') {
    if (this.serverless.service.build?.esbuild === false) {
      return false
    }
    // If handler isn't set then it is a docker function so do not attempt to build
    if (!functionObject[handlerPropertyName]) {
      return false
    }
    // If user provided a function-level artifact, do not build this function
    if (functionObject?.package?.artifact) {
      return false
    }
    // If user provided a service-level artifact and packaging is not individual for this function,
    // do not build this function
    const isFunctionPackagedIndividually =
      functionObject?.package?.individually === true
    // If a service-level artifact is provided and the function itself is not individually packaged,
    // do not build this function (matches packageFunction behavior)
    if (
      !isFunctionPackagedIndividually &&
      this.serverless?.service?.package?.artifact
    ) {
      return false
    }
    const runtime =
      functionObject.runtime || this.serverless.service.provider.runtime
    const functionBuildParam = functionObject.build
    const providerBuildParam = this.serverless.service.build

    // If runtime is not node then should not build
    if (!runtime || !runtime.startsWith('nodejs')) {
      return false
    }

    // If the build property is not set then we use the zero-config checking which is simply
    // if the handler is a typescript file
    if (!functionBuildParam && !providerBuildParam) {
      log.debug(
        'Build property not set using default checking behavior for esbuild',
      )
      const extension = await this._extensionForFunction(
        functionObject[handlerPropertyName],
      )
      if (extension && ['.ts', '.cts', '.mts', '.tsx'].includes(extension)) {
        log.debug('Build property not set using esbuild since typescript')
        return true
      }
    }

    // If the build property on the function config is defined and is set to esbuild then
    // framework should build the function, otherwise if the build property is defined
    // but not set to esbuild then it should not be built
    if (functionBuildParam && functionBuildParam === 'esbuild') {
      return true
    } else if (functionBuildParam) {
      return false
    }

    // If the provider build property is set to esbuild then build by default
    if (
      providerBuildParam &&
      (providerBuildParam === 'esbuild' || providerBuildParam.esbuild)
    ) {
      return true
    }

    return false
  }

  // This is all the possible extensions that the esbuild plugin can build for
  async _extensionForFunction(functionHandler) {
    const functionName = path.extname(functionHandler).slice(1)
    const handlerPath = functionHandler.replace(`.${functionName}`, '')
    for (const extension of [
      '.js',
      '.ts',
      '.cjs',
      '.mjs',
      '.cts',
      '.mts',
      '.jsx',
      '.tsx',
    ]) {
      if (
        existsSync(
          path.join(this.serverless.config.serviceDir, handlerPath + extension),
        )
      ) {
        return extension
      }
    }
    return undefined
  }

  /**
   * Reads the package.json file in the service directory.
   * Note: This is a memoized function up in the constructor.
   *
   * @returns {Object} - The package.json object
   */
  async _readPackageJson(specifiedPackageJsonPath) {
    const packageJsonPath =
      specifiedPackageJsonPath ||
      path.join(this.serverless.serviceDir, 'package.json')

    if (existsSync(packageJsonPath)) {
      const packageJsonStr = await readFile(packageJsonPath, 'utf-8')
      return JSON.parse(packageJsonStr)
    }

    return {}
  }

  async _buildProperties() {
    const defaultConfig = { bundle: true, minify: false, sourcemap: true }

    const packageJson = await this._readPackageJson()

    // If the user explicitly set the type to "module" then we need to set the output format to ESM
    if (packageJson.type === 'module') {
      defaultConfig.format = `esm`
    }

    if (
      this.serverless.service.build &&
      this.serverless.service.build !== 'esbuild' &&
      this.serverless.service.build.esbuild
    ) {
      // For advanced use cases, users can provide a js file that exports a function that returns esbuild configuration options
      // This is useful for when users want to use esbuild plugins (which require calling a function) or other advanced configurations
      // That you can't really do in serverless.yml
      let jsConfig = {}
      if (this.serverless.service.build.esbuild.configFile) {
        // Resolve the absolute path to the config file
        const configFilePath = path.resolve(
          this.serverless.config.serviceDir,
          this.serverless.service.build.esbuild.configFile,
        )

        // This is a dynamic import because we want to support both CommonJS and ESM
        const configFile = await import(pathToFileURL(configFilePath).href)

        const configFunction = configFile.default || configFile

        // Print a nice error message if the export is not a function
        if (typeof configFunction !== 'function') {
          throw new ServerlessError(
            `Your build config "${path.basename(configFilePath)}" file must export a function that returns esbuild configuration options. For more details, please refer to the documentation: https://www.serverless.com/framework/docs/providers/aws/guide/building`,
            'ESBUILD_CONFIG_ERROR',
          )
        }

        // Passing the serverless instance can be useful
        // Ref: https://github.com/floydspace/serverless-esbuild/issues/168
        jsConfig = await configFunction(this.serverless)
      }

      // Users can use both serverless.yml and js file to configure esbuild
      // The yml config will take precedence over js config
      const mergedOptions = _.merge(
        defaultConfig,
        jsConfig,
        this.serverless.service.build.esbuild,
      )

      if (this.serverless.service.build.esbuild.sourcemap === true) {
        mergedOptions.sourcemap = true
      } else if (this.serverless.service.build.esbuild.sourcemap === false) {
        delete mergedOptions.sourcemap
      } else if (this.serverless.service.build.esbuild?.sourcemap?.type) {
        if (this.serverless.service.build.esbuild.sourcemap.type === 'linked') {
          mergedOptions.sourcemap = true
        } else {
          mergedOptions.sourcemap =
            this.serverless.service.build.esbuild.sourcemap.type
        }
      } else if (
        typeof this.serverless.service.build.esbuild.sourcemap === 'object'
      ) {
        // When sourcemap is an object without type (e.g., { setNodeOptions: false }),
        // default to true for esbuild compatibility
        mergedOptions.sourcemap = true
      }

      return mergedOptions
    }

    return defaultConfig
  }

  /**
   * Determine which modules to mark as external (i.e. added to the generated package.json) and which modules to be excluded all together
   * @param {string} runtime - The provider.runtime or functionObject.runtime value used to determine which version of the AWS SDK to exclude
   * @returns
   */
  async _getExternal(runtime) {
    const buildProperties = await this._buildProperties()
    let external = new Set(buildProperties.external || [])
    let exclude = new Set(buildProperties.exclude || [])
    if (buildProperties.exclude) {
      external = [...external, ...buildProperties.exclude]
    } else {
      const nodeRuntimeMatch = runtime.match(nodeRuntimeRe)
      if (nodeRuntimeMatch) {
        const version = parseInt(nodeRuntimeMatch.groups.version) || 18
        // If node version is 18 or greater then we need to exclude all @aws-sdk/ packages
        if (version >= 18) {
          external.add('@aws-sdk/*')
          exclude.add('@aws-sdk/*')
        } else {
          external.add('aws-sdk')
          exclude.add('aws-sdk')
        }
      }
    }
    return { external, exclude }
  }

  async _getDefaultExternalExcludes(runtime) {
    const external = []
    const exclude = []
    const nodeRuntimeMatch = runtime.match(nodeRuntimeRe)
    if (nodeRuntimeMatch) {
      const version = parseInt(nodeRuntimeMatch.groups.version) || 18
      logger.debug(
        'Setting default external for node version ',
        version,
        runtime,
      )
      // If node version is 18 or greater then we need to exclude all @aws-sdk/ packages
      if (version >= 18) {
        external.push('@aws-sdk/*')
        exclude.push('@aws-sdk/*')
      } else {
        external.push('aws-sdk')
        exclude.push('aws-sdk')
      }
    }
    return { external, exclude }
  }

  async _externals(runtime) {
    const packageJson = await this._readPackageJson()

    const buildProperties = await this._buildProperties()
    const { external: externalDefault, exclude: excludeDefault } =
      await this._getDefaultExternalExcludes(runtime)

    let external = Array.from(
      new Set([...externalDefault, ...(buildProperties.external ?? [])]),
    )
    let exclude = Array.from(
      new Set([...excludeDefault, ...(buildProperties.exclude ?? [])]),
    )

    const userDefinedExternalDefaults = (buildProperties.external ?? []).filter(
      (external) => externalDefault.includes(external),
    )
    const userDefinedExcludeDefaults = (buildProperties.exclude ?? []).filter(
      (exclude) => excludeDefault.includes(exclude),
    )

    logger.debug('Initial External ', external)
    logger.debug('Initial Exclude ', exclude)
    if (packageJson.dependencies) {
      const dependencies = Object.keys(packageJson.dependencies)
      const dependencyExternal =
        external.length > 0 ? micromatch(dependencies, external) : []
      const dependencyExclude =
        exclude.length > 0 ? micromatch(dependencies, exclude) : []

      external = [...external, ...dependencyExternal]
      exclude = [...exclude, ...dependencyExclude]

      logger.debug('External After Dependency ', external)
      logger.debug('Exclude After Dependency ', exclude)
      let externalToFilter = []
      let excludeToFilter = []
      if (micromatch(dependencies, externalDefault).length > 0) {
        externalToFilter = [...externalToFilter, ...externalDefault]
      }

      if (micromatch(dependencies, excludeDefault).length > 0) {
        excludeToFilter = [...excludeToFilter, ...excludeDefault]
      }

      let finalExternal = external.filter(
        (ex) => !ex.includes('!') && !externalToFilter.includes(ex),
      )
      let finalExclude = exclude.filter(
        (ex) => !ex.includes('!') && !excludeToFilter.includes(ex),
      )

      if (userDefinedExternalDefaults.length > 0) {
        finalExternal = [...finalExternal, ...userDefinedExternalDefaults]
      }
      if (userDefinedExcludeDefaults.length > 0) {
        finalExclude = [...finalExclude, ...userDefinedExcludeDefaults]
      }

      logger.debug('Externals to Filter ', externalToFilter)
      logger.debug('Excludes to Filter ', excludeToFilter)
      logger.debug('Final External ', finalExternal)
      logger.debug('Final Exclude ', finalExclude)
      return { external: finalExternal, exclude: finalExclude }
    }

    return { external: external, exclude: exclude }
  }

  /**
   * When invoking locally we need to set the servicePath to the build directory so that invoke local correctly uses the built function and does not
   * attempt to use the typescript file directly.
   */
  _setConfigForLocalInvocation() {
    this.serverless.config.servicePath = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      'build',
    )
  }

  /**
   * Take the current build context. Which could be service-wide or a given function and then build it
   * @param {string} handlerPropertyName - The property name of the handler in the function object. In the case of dev mode this will be different, so we need to be able to set it.
   */
  async _build(handlerPropertyName = 'handler') {
    const functionsToBuild = await this.functions(handlerPropertyName)

    if (Object.keys(functionsToBuild).length === 0) {
      log.debug('No functions to build with esbuild')
      return
    }

    const updatedFunctionsToBuild = {}

    const buildProperties = await this._buildProperties()

    for (const [alias, functionObject] of Object.entries(functionsToBuild)) {
      const functionName = path
        .extname(functionObject[handlerPropertyName])
        .slice(1)
      const handlerPath = functionObject[handlerPropertyName].replace(
        `.${functionName}`,
        '',
      )
      const runtime =
        functionObject.runtime || this.serverless.service.provider.runtime

      const external = (await this._externals(runtime)).external

      const extension = await this._extensionForFunction(
        functionObject[handlerPropertyName],
      )
      if (extension) {
        // Enrich the functionObject with additional values we will need for building
        updatedFunctionsToBuild[alias] = {
          ...functionObject,
          handlerPath: path.join(
            this.serverless.config.serviceDir,
            handlerPath + extension,
          ),
          extension,
          esbuild: {
            external,
          },
        }
      }
    }

    // Determine the concurrency to use for building functions, by default framework will attempt to build
    // all functions concurrently, but this can be overridden by setting the buildConcurrency property.
    const concurrency =
      buildProperties.buildConcurrency ?? Object.keys(functionsToBuild).length

    const limit = pLimit(concurrency)

    try {
      await Promise.all(
        Object.entries(updatedFunctionsToBuild).map(
          ([alias, functionObject]) => {
            return limit(async () => {
              const functionName = path
                .extname(functionObject[handlerPropertyName])
                .slice(1)
              const handlerPath = functionObject[handlerPropertyName].replace(
                `.${functionName}`,
                '',
              )
              const esbuildProps = {
                ...buildProperties,
                platform: 'node',
                ...(buildProperties.bundle === true
                  ? { external: functionObject.esbuild.external }
                  : { external: [] }),
                entryPoints: [functionObject.handlerPath],
                outfile: path.join(
                  this.serverless.config.serviceDir,
                  '.serverless',
                  'build',
                  handlerPath + '.js',
                ),
                logLevel: 'error',
              }

              // Remove the following properties from the esbuildProps as they are not valid esbuild properties
              delete esbuildProps.exclude
              delete esbuildProps.buildConcurrency
              delete esbuildProps.configFile

              const result = await esbuild.build(esbuildProps)

              /**
               * If the user has set the esbuild metafile option, we need to write the metafile to the build directory
               * so that they analyze the build output, just like the esbuild CLI does.
               */
              if (result.metafile) {
                await writeFile(
                  path.join(
                    this.serverless.config.serviceDir,
                    '.serverless',
                    'build',
                    'meta.json',
                  ),
                  JSON.stringify(result.metafile, null, 2),
                )
              }

              if (!this.serverless.builtFunctions) {
                this.serverless.builtFunctions = new Set()
              }
              this.serverless.builtFunctions.add(alias)
              if (
                this.serverless.service.build?.esbuild?.sourcemap ===
                  undefined ||
                this.serverless.service.build?.esbuild?.sourcemap === true ||
                this.serverless.service.build?.esbuild.sourcemap
                  ?.setNodeOptions === true
              ) {
                const functionObject =
                  this.serverless.service.getFunction(alias)
                if (functionObject.environment?.NODE_OPTIONS) {
                  functionObject.environment.NODE_OPTIONS = `${functionObject.environment.NODE_OPTIONS} --enable-source-maps`
                } else {
                  if (!functionObject.environment) {
                    functionObject.environment = {}
                  }
                  functionObject.environment.NODE_OPTIONS =
                    '--enable-source-maps'
                }
              }
            })
          },
        ),
      )
    } catch (err) {
      if (this.serverless.functionsDevModeEnabled === true) {
        return
      }
      throw new ServerlessError(err.message, 'ESBULD_BUILD_ERROR')
    }

    return
  }

  /**
   * Take the current build context. Which could be service-wide or a given function and then package it.
   *
   * This function takes package.individually into account and will either create a single zip file to use for all functions or a zip file per function otherwise.
   *
   * @param {string} handlerPropertyName - The property name of the handler in the function object. In the case of dev mode this will be different, so we need to be able to set it.
   */
  async _package(handlerPropertyName = 'handler') {
    const functions = await this.functions(handlerPropertyName)
    const buildProperties = await this._buildProperties()

    if (Object.keys(functions).length === 0) {
      log.debug('No functions to package')
      return
    }

    // If not packaging individually then package all functions together into a single zip
    if (!this.serverless?.service?.package?.individually) {
      await this._packageAll(functions, handlerPropertyName)
      return
    }

    const concurrency =
      buildProperties.buildConcurrency ?? Object.keys(functions).length

    const limit = pLimit(concurrency)

    await this.serverless.pluginManager.spawn('esbuild-package')

    const packageIncludes = await globby(
      this.serverless.service.package?.patterns ?? [],
      { cwd: this.serverless.serviceDir },
    )

    const zipPromises = Object.entries(functions).map(
      ([functionAlias, functionObject]) => {
        return limit(async () => {
          const zipName = `${this.serverless.service.service}-${functionAlias}.zip`
          const zipPath = path.join(
            this.serverless.config.serviceDir,
            '.serverless',
            'build',
            zipName,
          )

          const zip = archiver.create('zip')
          const output = createWriteStream(zipPath)

          const zipPromise = new Promise(async (resolve, reject) => {
            output.on('close', () => resolve(zipPath))
            output.on('error', (err) => reject(err))

            output.on('open', async () => {
              const functionIncludes = await globby(
                functionObject.package?.patterns ?? [],
                { cwd: this.serverless.serviceDir },
              )

              const includesToPackage = _.union(
                packageIncludes,
                functionIncludes,
              )

              zip.pipe(output)
              const functionName = path
                .extname(functionObject[handlerPropertyName])
                .slice(1)
              const handlerPath = functionObject[handlerPropertyName].replace(
                `.${functionName}`,
                '',
              )

              const packageJsonPath = path.join(
                this.serverless.config.serviceDir,
                '.serverless',
                'build',
                'package.json',
              )

              if (existsSync(packageJsonPath)) {
                zip.file(packageJsonPath, { name: `package.json` })
              }

              // Add lockfiles if they exist
              const lockFiles = {
                'package-lock.json': 'package-lock.json',
                'yarn.lock': 'yarn.lock',
                'pnpm-lock.yaml': 'pnpm-lock.yaml',
              }

              for (const [lockFile, destName] of Object.entries(lockFiles)) {
                const lockFilePath = path.join(
                  this.serverless.config.serviceDir,
                  '.serverless',
                  'build',
                  lockFile,
                )
                if (existsSync(lockFilePath)) {
                  zip.file(lockFilePath, { name: destName })
                }
              }

              const handlerZipPath = path.join(
                this.serverless.config.serviceDir,
                '.serverless',
                'build',
                handlerPath + '.js',
              )

              zip.file(handlerZipPath, { name: `${handlerPath}.js` })

              if (existsSync(`${handlerZipPath}.map`)) {
                zip.file(`${handlerZipPath}.map`, {
                  name: `${handlerPath}.js.map`,
                })
              }

              zip.directory(
                path.join(
                  this.serverless.config.serviceDir,
                  '.serverless',
                  'build',
                  'node_modules',
                ),
                'node_modules',
              )

              await Promise.all(
                includesToPackage.map(async (filePath) => {
                  const absolutePath = path.join(
                    this.serverless.config.serviceDir,
                    filePath,
                  )
                  const stats = await stat(absolutePath)
                  if (stats.isDirectory()) {
                    zip.directory(absolutePath, filePath)
                  } else {
                    zip.file(absolutePath, { name: filePath })
                  }
                }),
              )

              await zip.finalize()
              functionObject.package = {
                artifact: zipPath,
              }
            })
          })
          await zipPromise
        })
      },
    )

    try {
      await Promise.all(zipPromises)
    } catch (err) {
      throw new ServerlessError(err.message, 'ESBULD_PACKAGE_ERROR')
    }
  }

  async _packageAll(functions, handlerPropertyName = 'handler') {
    const zipName = `${this.serverless.service.service}.zip`
    const zipPath = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      'build',
      zipName,
    )

    await this.serverless.pluginManager.spawn('esbuild-package')

    const packageIncludes = await globby(
      this.serverless.service.package.patterns ?? [],
      { cwd: this.serverless.serviceDir },
    )

    const zip = archiver.create('zip')
    const output = createWriteStream(zipPath)
    const addedFiles = new Set()

    const zipPromise = new Promise(async (resolve, reject) => {
      output.on('close', () => resolve(zipPath))
      output.on('error', (err) => reject(err))

      output.on('open', async () => {
        zip.pipe(output)

        for (const [, functionObject] of Object.entries(functions)) {
          const functionName = path
            .extname(functionObject[handlerPropertyName])
            .slice(1)
          const handlerPath = functionObject[handlerPropertyName].replace(
            `.${functionName}`,
            '',
          )

          const packageJsonPath = path.join(
            this.serverless.config.serviceDir,
            '.serverless',
            'build',
            'package.json',
          )

          if (existsSync(packageJsonPath) && !addedFiles.has(packageJsonPath)) {
            zip.file(packageJsonPath, { name: `package.json` })
            addedFiles.add(packageJsonPath)
          }

          // Add lockfiles if they exist
          const lockFiles = {
            'package-lock.json': 'package-lock.json',
            'yarn.lock': 'yarn.lock',
            'pnpm-lock.yaml': 'pnpm-lock.yaml',
          }

          for (const [lockFile, destName] of Object.entries(lockFiles)) {
            const lockFilePath = path.join(
              this.serverless.config.serviceDir,
              '.serverless',
              'build',
              lockFile,
            )
            if (existsSync(lockFilePath) && !addedFiles.has(lockFilePath)) {
              zip.file(lockFilePath, { name: destName })
              addedFiles.add(lockFilePath)
            }
          }

          const handlerZipPath = path.join(
            this.serverless.config.serviceDir,
            '.serverless',
            'build',
            handlerPath + '.js',
          )

          if (!addedFiles.has(handlerZipPath)) {
            zip.file(handlerZipPath, { name: `${handlerPath}.js` })
            addedFiles.add(handlerZipPath)
          }

          if (
            existsSync(`${handlerZipPath}.map`) &&
            !addedFiles.has(`${handlerZipPath}.map`)
          ) {
            zip.file(`${handlerZipPath}.map`, {
              name: `${handlerPath}.js.map`,
            })

            addedFiles.add(`${handlerZipPath}.map`)
          }
        }

        zip.directory(
          path.join(
            this.serverless.config.serviceDir,
            '.serverless',
            'build',
            'node_modules',
          ),
          'node_modules',
        )

        await Promise.all(
          packageIncludes.map(async (filePath) => {
            const absolutePath = path.join(this.serverless.serviceDir, filePath)
            const stats = await stat(absolutePath)
            if (stats.isDirectory()) {
              zip.directory(absolutePath, filePath)
            } else if (!addedFiles.has(absolutePath)) {
              zip.file(absolutePath, { name: filePath })
              addedFiles.add(absolutePath)
            }
          }),
        )

        await zip.finalize()
        this.serverless.service.package.artifact = zipPath
      })
    })

    try {
      await zipPromise
    } catch (err) {
      throw new ServerlessError(err.message, 'ESBULD_PACKAGE_ALL_ERROR')
    }
  }

  /**
   * Searches for the directory containing the compose file up to 5 levels up.
   * @param {string} startDir - The directory to start the search from.
   * @param {number} maxLevelsUp - The maximum number of parent directories to search, default is 5.
   * @returns {string|null} - The directory path containing the file, or null if not found.
   */
  async _getComposeDir(startDir = process.cwd(), maxLevelsUp = 5) {
    let currentDir = path.resolve(startDir)

    for (let i = 0; i <= maxLevelsUp; i++) {
      const composeYmlPath = path.join(currentDir, 'serverless-compose.yml')
      const composeYamlPath = path.join(currentDir, 'serverless-compose.yaml')

      if (existsSync(composeYmlPath) || existsSync(composeYamlPath)) {
        return currentDir
      }

      const parentDir = path.dirname(currentDir)

      if (parentDir === currentDir) {
        // Reached root directory
        break
      }

      currentDir = parentDir
    }

    return null
  }

  /**
   * Take the package.json and add an updated version with no dev dependencies and external and excluded node_modules taken care of, to the .serverless/build directory
   */
  async _preparePackageJson() {
    const runtime = this.serverless.service.provider.runtime || 'nodejs18.x'
    const { external, exclude } = await this._externals(runtime)

    const packageJson = await this._readPackageJson()

    let composePackageJson = {}

    if (this.serverless.compose.isWithinCompose) {
      const composeDir = await this._getComposeDir(
        this.serverless.config.serviceDir,
      )

      if (composeDir) {
        composePackageJson = await this._readPackageJson(
          path.join(composeDir, 'package.json'),
        )
      } else {
        logger.info(
          'Could not locate serverless-compose.yml file. ' +
            'Dependencies from the compose root package.json will not be included in the build. ' +
            'This may cause issues if your service relies on dependencies defined at the compose level.',
        )
      }
    }

    const packageJsonNoDevDeps = {
      ...packageJson,
    }

    delete packageJsonNoDevDeps.devDependencies

    const buildProperties = await this._buildProperties()

    if (packageJson.dependencies || composePackageJson.dependencies) {
      if (buildProperties.packages !== 'external') {
        packageJsonNoDevDeps.dependencies = {}

        for (const key of external) {
          if (packageJson.dependencies && packageJson.dependencies[key]) {
            packageJsonNoDevDeps.dependencies[key] =
              packageJson.dependencies[key]
          }

          if (
            composePackageJson.dependencies &&
            composePackageJson.dependencies[key] &&
            !packageJsonNoDevDeps.dependencies[key]
          ) {
            packageJsonNoDevDeps.dependencies[key] =
              composePackageJson.dependencies[key]
          }
        }
      }

      for (const key of exclude) {
        delete packageJsonNoDevDeps.dependencies[key]
      }
    }

    const buildDir = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      'build',
    )

    // Copy package.json
    await writeFile(
      path.join(buildDir, 'package.json'),
      JSON.stringify(packageJsonNoDevDeps, null, 2),
    )

    // Copy appropriate lockfile if it exists
    const packager = this._determinePackager()
    const lockFiles = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml',
    }

    const lockFile = path.join(
      this.serverless.config.serviceDir,
      lockFiles[packager],
    )
    if (existsSync(lockFile)) {
      await copyFile(lockFile, path.join(buildDir, lockFiles[packager]))
    }

    /**
     * Make sure we copy over the pnpm-workspace.yml file if it exists so that
     * when we run pnpm install pnpm would know this is where to put node_modules.
     */
    if (packager === 'pnpm') {
      const workspaceFiles = ['pnpm-workspace.yaml', 'pnpm-workspace.yml']
      for (const workspaceFile of workspaceFiles) {
        const workspacePath = path.join(
          this.serverless.config.serviceDir,
          workspaceFile,
        )
        if (existsSync(workspacePath)) {
          await copyFile(workspacePath, path.join(buildDir, workspaceFile))
          break
        }
      }
    }

    // Install dependencies
    await new Promise((resolve, reject) => {
      let installArgs = ['install']

      if (packager === 'pnpm') {
        installArgs = ['install', '--no-frozen-lockfile']
      } else if (packager === 'yarn') {
        installArgs = ['install', '--no-immutable']
      }

      const p = spawnExt(
        packager,
        /**
         * In case of pnpm, we need to install with --no-frozen-lockfile
         * because pnpm fails to install by default if the lockfile is out of sync with the package.json file
         */
        installArgs,
        {
          cwd: buildDir,
        },
      )
      /**
       * Avoid unhandled rejections bubbling from spawnExt when the install exits non-zero.
       * Capture the error so we can append it if stdout/stderr stay empty.
       */
      let spawnError
      p.catch((error) => {
        spawnError = error
        logger.debug(
          `Failed to install dependencies with the "${packager}" packager: ${error.message}`,
        )
      })
      let stderr = ''
      let stdout = ''
      p.child.on('error', (error) => {
        logger.error('Error installing dependencies', error)
        reject(error)
      })
      p.child.stderr.on('data', (data) => {
        stderr += data
      })
      p.child.stdout.on('data', (data) => {
        stdout += data
      })
      p.child.on('close', (code) => {
        if (code !== 0) {
          let errorMessage = `Failed to install dependencies with the "${packager}" packager.`
          if (spawnError) errorMessage += ` ${spawnError.message}`
          if (stderr) errorMessage += `\n\n${stderr}`
          if (stdout) errorMessage += `\n\n${stdout}`
          return reject(new Error(errorMessage))
        }
        resolve()
      })
    })
  }

  _determinePackager() {
    if (existsSync(path.join(this.serverless.config.serviceDir, 'yarn.lock'))) {
      return 'yarn'
    } else if (
      existsSync(path.join(this.serverless.config.serviceDir, 'pnpm-lock.yaml'))
    ) {
      return 'pnpm'
    } else {
      return 'npm'
    }
  }

  /**
   * Cleanup, mainly removing build files and directories
   */
  async _cleanUp() {
    try {
      await rm(
        path.join(this.serverless.config.serviceDir, '.serverless', 'build'),
        {
          recursive: true,
          force: true,
        },
      )
    } catch (err) {
      // empty error
    }
  }
}

export default Esbuild
