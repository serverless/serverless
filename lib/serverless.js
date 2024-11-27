import path from 'path'
import os from 'os'
import _ from 'lodash'
import ensureString from 'type/string/ensure.js'
import ensureValue from 'type/value/ensure.js'
import ensureArray from 'type/array/ensure.js'
import ensureIterable from 'type/iterable/ensure.js'
import ensurePlainObject from 'type/plain-object/ensure.js'
import CLI from './classes/cli.js'
import Config from './classes/config.js'
import YamlParser from './classes/yaml-parser.js'
import PluginManager from './classes/plugin-manager.js'
import Utils from './classes/utils.js'
import Service from './classes/service.js'
import ConfigSchemaHandler from './classes/config-schema-handler/index.js'
import ServerlessError from './serverless-error.js'
import logDeprecation from './utils/log-deprecation.js'
import commmandsSchema from './cli/commands-schema.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log, progress } = utils
const logger = log.get('sls:lib:serverless')

/**
 * @typedef {Object} Compose
 * @property {Object} serviceParams - The service params from Compose.
 * @property {boolean} isWithinCompose - Flag indicating if within Compose.
 */

class Serverless {
  /**
   * Constructs a new Serverless instance. This constructor is responsible for
   * initializing various properties of the Serverless instance, including
   * providers, version, access key, credential providers, service directory,
   * commands, options, and various utility classes. It also handles validation
   * of service path and filename input, and throws errors for incompatible
   * configurations or outdated versions of the Framework.
   *
   *
   *
   * @param {Object} options - The options for the Serverless instance.
   * @param {string} options.version - The version of the Serverless instance.
   * @param {string} options.accessKey - The access key for the Serverless instance.
   * @param {Array} options.commands - The commands for the Serverless instance.
   * @param {Object} options.options - The options for the Serverless instance.
   * @param {string} options.servicePath - The service path for the Serverless instance.
   * @param {string} options.serviceConfigFileName - The service config file name.
   * @param {Object} options.service - The service for the Serverless instance.
   * @param {Object} options.credentialProviders - The credential providers.
   * @param {Compose} options.compose - The data from Compose.
   * @throws {ServerlessError} If there's an error in validation or incompatible configurations.
   */
  constructor({
    version = null,
    orgId = null,
    orgName = null,
    accessKey = null,
    commands,
    options,
    servicePath = null,
    serviceConfigFileName = null,
    service = {},
    credentialProviders = {},
    region = null,
    compose = {},
    instanceId,
  } = {}) {
    logger.debug(options)

    this.providers = {}
    this.integrations = {}
    this.version = version
    this.orgId = orgId || null
    this.orgName = orgName || null
    this.accessKey = accessKey || null
    this.credentialProviders = credentialProviders
    this.compose = {
      serviceParams: compose.serviceParams || {},
      isWithinCompose: compose.isWithinCompose || false,
    }
    /**
     * Validate Service path and filename input
     */
    this.serviceDir = ensureString(servicePath, {
      name: 'options.serviceDir',
      Error: ServerlessError,
      errorCode: 'INVALID_NON_STRING_SERVICE_DIR',
      isOptional: true,
    })

    if (this.serviceDir != null) {
      this.serviceDir = path.resolve(this.serviceDir)
      this.configurationFilename = ensureString(serviceConfigFileName, {
        name: 'configurationFilename',
        Error: ServerlessError,
        errorCode: 'INVALID_NON_STRING_CONFIGURATION_FILENAME',
      })
      if (path.isAbsolute(this.configurationFilename)) {
        throw new ServerlessError(
          `"configurationFilename" cannot be absolute path. Received: ${this.configurationFilename}`,
          'INVALID_ABSOLUTE_PATH_CONFIGURATION_FILENAME',
        )
      }
      // Store the original Service Configuration
      this.configurationInput = ensurePlainObject(service, {
        name: 'configuration',
        Error: ServerlessError,
        errorCode: 'INVALID_NON_OBJECT_CONFIGURATION',
      })
    }
    commands = ensureArray(commands)
    // Ensure that original `options` are not mutated, can be removed after addressing:
    // https://github.com/serverless/serverless/issues/2582
    const cliOptions = { ...ensurePlainObject(options) }
    this.processedInput = { commands, options: cliOptions }
    this.yamlParser = new YamlParser(this)
    this.utils = new Utils(this)
    this.service = new Service(this)
    // Old variables resolver is dropped, yet some plugins access service properties through
    // `variables` class. Below patch ensures those plugins won't get broken
    this.variables = { service: this.service }
    this.pluginManager = new PluginManager(this)
    this.configSchemaHandler = new ConfigSchemaHandler(this)
    this.config = new Config(this, { serviceDir: this.serviceDir })
    this.config.region = region
    this.instanceId = instanceId

    this.classes = {}
    this.classes.CLI = CLI
    this.classes.YamlParser = YamlParser
    this.classes.Utils = Utils
    this.classes.Service = Service
    this.classes.Error = ServerlessError
    this.classes.PluginManager = PluginManager
    this.classes.ConfigSchemaHandler = ConfigSchemaHandler

    this.serverlessDirPath = path.join(os.homedir(), '.serverless')
    this.triggeredDeprecations = logDeprecation.triggeredDeprecations
    this.isConfigurationExtendable = true
    this._commandsSchema = commmandsSchema
  }

  /**
   * Initializes the serverless instance. This method is responsible for creating
   * an instance ID, initializing a new CLI instance, setting CLI options and
   * commands, loading the service and all plugins, and setting the loaded plugins
   * and commands for the CLI. This is typically called at the start of a
   * serverless lifecycle.
   *
   * @async
   * @throws {Error} If there's an error in loading the service or plugins.
   */
  async init() {
    logger.debug('initializing')
    // create an instanceId (can be e.g. used when a predictable random value is needed)
    this.instanceId = this.instanceId ?? new Date().getTime().toString()

    // create a new CLI instance
    this.cli = new this.classes.CLI(this)

    // set the options and commands which were processed by the CLI
    this.pluginManager.setCliOptions(this.processedInput.options)
    this.pluginManager.setCliCommands(this.processedInput.commands)
    await this.service.load(this.processedInput.options)

    // load all plugins
    await this.pluginManager.loadAllPlugins(this.service.plugins)
    this.isConfigurationExtendable = false

    // give the CLI the plugins and commands so that it can print out
    // information such as options when the user enters --help
    this.cli.setLoadedPlugins(this.pluginManager.getPlugins())
    this.cli.setLoadedCommands(this.pluginManager.getCommands())
  }

  /**
   * Executes the Serverless instance. This method is responsible for reloading
   * service file parameters, validating commands, setting variables, merging
   * arrays, setting function names, validating the service configuration, and
   * initializing service outputs. It also triggers the plugin lifecycle for
   * processing commands. This method is typically called to run a Serverless
   * instance.
   *
   * @async
   * @throws {Error} If there's an error in command validation, service validation,
   * or during the plugin lifecycle.
   */
  async run() {
    if (this.configurationInput) this.service.reloadServiceFileParam()

    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands)

    // Some plugins acccess `options` through `this.variables`
    this.variables.options = this.pluginManager.cliOptions

    if (this.processedInput.commands[0] !== 'plugin') {
      // merge arrays after variables have been populated
      // (https://github.com/serverless/serverless/issues/3511)
      this.service.mergeArrays()

      // populate function names after variables are loaded in case functions were externalized
      // (https://github.com/serverless/serverless/issues/2997)
      this.service.setFunctionNames(this.processedInput.options)

      // If in context of service, validate the service configuration
      if (this.serviceDir) await this.service.validate()
    }

    this.serviceOutputs = new Map()
    this.servicePluginOutputs = new Map()

    /**
     * Remove the progress spinner.
     * Leave spinner responsibility to commands.
     * Hide the spinner here so that no blank space is shown,
     * between Framework init and a plugin using the spinner.
     */
    const progressMain = progress.get('main')
    progressMain.remove()

    // trigger the plugin lifecycle when there's something which should be processed
    await this.pluginManager.run(this.processedInput.commands)
  }

  addServiceOutputSection(sectionName, content) {
    sectionName = ensureString(sectionName, { name: 'sectionName' })
    if (typeof ensureValue(content, { name: 'content' }) !== 'string') {
      content = ensureIterable(content, {
        name: 'content',
        denyEmpty: true,
        ensureItem: ensureString,
      })
    } else if (!content) {
      throw new TypeError('Section content cannot be empty string')
    }
    if (
      this.serviceOutputs.has(sectionName) ||
      this.servicePluginOutputs.has(sectionName)
    ) {
      throw new TypeError(
        `Section content for "${sectionName}" was already set`,
      )
    }
    this.servicePluginOutputs.set(sectionName, content)
  }

  setProvider(name, provider) {
    this.providers[name] = provider
  }

  getProvider(name) {
    return this.providers[name] ? this.providers[name] : false
  }

  getVersion() {
    return this.version
  }

  // Only for internal use
  _logDeprecation(code, message) {
    return logDeprecation(code, message, {
      serviceConfig: this.configurationInput,
    })
  }

  // To be used by external plugins
  logDeprecation(code, message) {
    return this._logDeprecation(
      `EXT_${ensureString(code)}`,
      ensureString(message),
    )
  }

  extendConfiguration(configurationPathKeys, value) {
    configurationPathKeys = ensureArray(configurationPathKeys, {
      ensureItem: ensureString,
    })
    if (configurationPathKeys.length < 1) {
      throw new Error(
        'Cannot extend configuration: ConfigurationPathKeys needs to contain at least one element.',
      )
    }

    if (!this.isConfigurationExtendable) {
      throw new Error(
        'Cannot extend configuration: It can only be extended during initialization phase.',
      )
    }
    try {
      value = JSON.parse(JSON.stringify(value))
    } catch (error) {
      throw new Error(
        `Cannot extend configuration: Received non JSON value: ${value}`,
      )
    }

    _.set(this.configurationInput, configurationPathKeys, value)
    if (!_.isObject(value)) {
      const lastKey = configurationPathKeys.pop()
      value = { [lastKey]: value }
    }
  }
}

export default Serverless
