/* jshint ignore:start */
// Internal version of the historical community plugin; exported so core can bundle it directly
import {
  addVendorHelper,
  removeVendorHelper,
  packRequirements,
} from './lib/zip.js'
import { injectAllRequirements } from './lib/inject.js'
import { layerRequirements } from './lib/layer.js'
import { installAllRequirements } from './lib/pip.js'
import { pipfileToRequirements } from './lib/pipenv.js'
import { uvToRequirements } from './lib/uv.js'
import { cleanup, cleanupCache } from './lib/clean.js'

class ServerlessPythonRequirements {
  /**
   * get the custom.pythonRequirements contents, with defaults set
   * @return {Object}
   */
  get options() {
    const options = Object.assign(
      {
        slim: false,
        slimPatterns: false,
        slimPatternsAppendDefaults: true,
        zip: false,
        layer: false,
        cleanupZipHelper: true,
        invalidateCaches: false,
        fileName: 'requirements.txt',
        usePipenv: true,
        usePoetry: true,
        useUv: true,
        installer: null,
        pythonBin:
          process.platform === 'win32'
            ? 'python.exe'
            : this.serverless.service.provider.runtime || 'python',
        dockerizePip: false,
        dockerSsh: false,
        dockerPrivateKey: null,
        dockerImage: null,
        dockerFile: null,
        dockerEnv: false,
        dockerBuildCmdExtraArgs: [],
        dockerRunCmdExtraArgs: [],
        dockerExtraFiles: [],
        dockerRootless: false,
        useStaticCache: true,
        useDownloadCache: true,
        cacheLocation: false,
        staticCacheMaxVersions: 0,
        pipCmdExtraArgs: [],
        noDeploy: [],
        vendor: '',
        requirePoetryLockFile: false,
        poetryWithGroups: [],
        poetryWithoutGroups: [],
        poetryOnlyGroups: [],
      },
      (this.serverless.service.custom &&
        this.serverless.service.custom.pythonRequirements) ||
        {},
    )
    if (
      options.pythonBin === this.serverless.service.provider.runtime &&
      !options.pythonBin.startsWith('python')
    ) {
      options.pythonBin = 'python'
    }
    if (/python3[0-9]+/.test(options.pythonBin)) {
      // "google" and "scaleway" providers' runtimes use python3XX
      options.pythonBin = options.pythonBin.replace(/3([0-9]+)/, '3.$1')
    }
    if (options.dockerizePip === 'non-linux') {
      options.dockerizePip = process.platform !== 'linux'
    }
    if (options.dockerizePip && process.platform === 'win32') {
      options.pythonBin = 'python'
    }
    if (
      !options.dockerizePip &&
      (options.dockerSsh ||
        options.dockerImage ||
        options.dockerFile ||
        options.dockerPrivateKey)
    ) {
      if (!this.warningLogged) {
        if (this.log) {
          this.log.warning(
            'You provided a docker related option but dockerizePip is set to false.',
          )
        } else {
          this.serverless.cli.log(
            'WARNING: You provided a docker related option but dockerizePip is set to false.',
          )
        }
        this.warningLogged = true
      }
    }
    if (options.dockerImage && options.dockerFile) {
      throw new Error(
        'Python Requirements: you can provide a dockerImage or a dockerFile option, not both.',
      )
    }

    if (options.layer) {
      // If layer was set as a boolean, set it to an empty object to use the layer defaults.
      if (options.layer === true) {
        options.layer = {}
      }
    }
    return options
  }

  get targetFuncs() {
    let inputOpt = this.serverless.processedInput.options
    return inputOpt.function
      ? [this.serverless.service.functions[inputOpt.function]]
      : Object.values(this.serverless.service.functions ?? {}).filter(
          (f) => !f.image,
        )
  }

  /**
   * Get agents that need Python requirements installation (code deployment)
   */
  get targetAgents() {
    const agents =
      this.serverless.service.agents ||
      this.serverless.configurationInput?.agents ||
      {}

    return Object.entries(agents)
      .filter(([, config]) => {
        // Only runtime agents (type defaults to 'runtime' if not specified)
        const agentType = config.type || 'runtime'
        if (agentType !== 'runtime') return false

        const artifact = config.artifact || {}

        // Skip if using container image (string or object with build config)
        if (artifact.image) return false

        // Skip if user specified their own S3 bucket
        if (artifact.s3?.bucket) return false

        // Need handler for code deployment (new schema)
        if (!config.handler) return false

        // Check for Python runtime (default is PYTHON_3_13)
        // Runtime is now at agent root level, not artifact.runtime
        const runtime = config.runtime || 'PYTHON_3_13'
        return runtime.startsWith('PYTHON')
      })
      .map(([name, config]) => ({
        name,
        config,
        module: '.', // Agents always use service root
        isAgent: true,
        architecture: 'arm64', // AgentCore always uses ARM64
      }))
  }

  /**
   * The plugin constructor
   * @param {Object} serverless
   * @param {Object} options
   * @param {Object} v3Utils
   * @return {undefined}
   */
  constructor(serverless, cliOptions, v3Utils) {
    this.serverless = serverless
    this.servicePath = this.serverless.config.servicePath
    this.warningLogged = false
    if (
      this.serverless.configSchemaHandler &&
      this.serverless.configSchemaHandler.defineFunctionProperties
    ) {
      this.serverless.configSchemaHandler.defineFunctionProperties('aws', {
        properties: {
          module: {
            type: 'string',
          },
        },
      })
    }

    if (v3Utils) {
      this.log = v3Utils.log
      this.progress = v3Utils.progress
      this.writeText = v3Utils.writeText
    }

    this.commands = {
      requirements: {
        commands: {
          clean: {
            usage: 'Remove .requirements and requirements.zip',
            lifecycleEvents: ['clean'],
          },
          install: {
            usage: 'install requirements manually',
            lifecycleEvents: ['install'],
          },
          cleanCache: {
            usage:
              'Removes all items in the pip download/static cache (if present)',
            lifecycleEvents: ['cleanCache'],
          },
        },
      },
    }

    if (this.serverless.cli.generateCommandsHelp) {
      Object.assign(this.commands.requirements, {
        usage: 'Serverless plugin to bundle Python packages',
        lifecycleEvents: ['requirements'],
      })
    } else {
      this.commands.requirements.type = 'container'
    }

    this.dockerImageForFunction = (funcOptions) => {
      const runtime =
        funcOptions.runtime || this.serverless.service.provider.runtime

      const architecture =
        funcOptions.architecture ||
        this.serverless.service.provider.architecture ||
        'x86_64'
      const defaultImage = `public.ecr.aws/sam/build-${runtime}:latest-${architecture}`
      return this.options.dockerImage || defaultImage
    }

    const isFunctionRuntimePython = (args) => {
      const providerRuntime = this.serverless.service.provider.runtime

      // If this is a function-level hook (functionObj exists), check that specific function
      if (args[1]?.functionObj) {
        const functionRuntime = args[1].functionObj.runtime
        const runtime = functionRuntime || providerRuntime
        return runtime ? runtime.startsWith('python') : false
      }
      // Service-level hook: check if ANY function uses Python
      const allFunctions = this.serverless.service.functions || {}
      const hasPythonFunction = Object.values(allFunctions).some((func) => {
        const runtime = func.runtime || providerRuntime
        return runtime && runtime.startsWith('python')
      })

      // Also check if any agents need Python requirements
      const hasPythonAgent = this.targetAgents.length > 0

      return hasPythonFunction || hasPythonAgent
    }

    const clean = async () => {
      await cleanup.call(this)
      await removeVendorHelper.call(this)
    }

    const setupArtifactPathCapturing = () => {
      // Reference:
      // https://github.com/serverless/serverless/blob/9591d5a232c641155613d23b0f88ca05ea51b436/lib/plugins/package/lib/packageService.js#L139
      // The packageService#packageFunction does set artifact path back to the function config.
      // As long as the function config's "package" attribute wasn't undefined, we can still use it
      // later to access the artifact path.
      for (const functionName in this.serverless.service.functions) {
        if (!serverless.service.functions[functionName].package) {
          serverless.service.functions[functionName].package = {}
        }
      }
    }

    const before = async () => {
      if (!isFunctionRuntimePython(arguments)) {
        return
      }
      await pipfileToRequirements.call(this)
      await uvToRequirements(this)
      await addVendorHelper.call(this)
      await installAllRequirements.call(this)
      await packRequirements.call(this)
      await setupArtifactPathCapturing()
    }

    const after = async () => {
      if (!isFunctionRuntimePython(arguments)) {
        return
      }
      await removeVendorHelper.call(this)
      await layerRequirements.call(this)
      await injectAllRequirements.call(
        this,
        arguments[1].functionObj && arguments[1].functionObj.package.artifact,
      )
    }

    const invalidateCaches = async () => {
      if (this.options.invalidateCaches) return clean
      return
    }

    const cleanCache = async () => cleanupCache.call(this)

    this.hooks = {
      'after:package:cleanup': invalidateCaches,
      'before:package:createDeploymentArtifacts': before,
      'after:package:createDeploymentArtifacts': after,
      'before:deploy:function:packageFunction': before,
      'after:deploy:function:packageFunction': after,
      'requirements:requirements': async () => {
        this.serverless.cli.generateCommandsHelp(['requirements'])
        return
      },
      'requirements:install:install': before,
      'requirements:clean:clean': clean,
      'requirements:cleanCache:cleanCache': cleanCache,
    }
  }
}

ServerlessPythonRequirements.shouldLoad = ({ serverless, log }) => {
  const pythonRequirementsConfig = serverless.service.custom?.pythonRequirements

  if (
    pythonRequirementsConfig === undefined ||
    pythonRequirementsConfig === null
  )
    return false

  const emitDisabledLog = () => {
    const message =
      'Skipping built-in python requirements packaging because custom.pythonRequirements.enabled is set to false.'
    if (log?.info) {
      log.info(message)
    } else if (serverless.cli?.log) {
      serverless.cli.log(message)
    }
  }

  if (typeof pythonRequirementsConfig === 'boolean') {
    if (pythonRequirementsConfig === false) emitDisabledLog()
    return pythonRequirementsConfig
  }

  if (pythonRequirementsConfig.enabled === false) {
    emitDisabledLog()
    return false
  }

  return true
}

export default ServerlessPythonRequirements
