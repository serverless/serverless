import { Authentication } from '../auth/index.js'
import {
  resolveStateStore,
  progress,
  log,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import { readFile } from '../../utils/index.js'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import path from 'path'
import { variables } from '../resolvers/index.js'
import { ResolverManager } from '../resolvers/manager.js'
import {
  sanitizeNotifications,
  handleAndMaybeThrowNotifications,
} from './notification.js'

export { Runner }

/**
 * @typedef {Object} Command
 * @property {string} command - The command string. Supports positional arguments (e.g., 'server <mode>').
 * @property {string} description - A short description of the command's functionality.
 * @property {Subcommand[]} [builder] - Defines subcommands or additional configuration for the command.
 */

/**
 * @typedef {Object} Subcommand
 * @property {string} command - The subcommand string. Supports nested positional arguments (e.g., 'server <mode>').
 * @property {string} description - A short description of the subcommand's functionality.
 * @property {Subcommand[]} [builder] - Defines further nested subcommands or additional configuration for the subcommand.
 * @property {Object.<string, Option>} [options] - Options (flags) specific to the subcommand. These are key-value pairs where each key is an option name.
 * @property {Positional[]} [positional] - Positional arguments for the subcommand, specifying expected inputs.
 */

/**
 * @typedef {Object} Option
 * @property {string} [alias] - A short alias for the option (e.g., 'p' for `--port`).
 * @property {string} description - A description of the option's purpose.
 * @property {string} type - The type of the option value (e.g., 'string', 'number', 'boolean').
 * @property {boolean} [demandOption=false] - Indicates whether the option is required.
 * @property {any} [default] - The default value for the option if none is provided.
 */

/**
 * @typedef {Object} Positional
 * @property {string} name - The name of the positional argument.
 * @property {string} description - A description of the argument's purpose.
 * @property {string} type - The type of the argument (e.g., 'string', 'number').
 * @property {string[]} [choices] - A list of allowed values for the positional argument.
 */

/**
 * @typedef {Object} RunnerResult
 * @property {string} serviceUniqueId - The unique identifier for the service.
 * @property {Object} [state] - The optional state object.
 */

/**
 * Runner class for executing commands.
 *
 * Methods to be implemented by the Runner:
 * - run
 * - shouldRun
 * - getCliSchema
 * - getServiceUniqueId
 *
 * Optional Methods:
 * - getUsageEventDetails
 * - getAnalysisEventDetails
 * - getDeploymentEventDetails
 */
class Runner {
  command
  options
  config
  configFilePath
  versionFramework
  stage
  resolverManager
  compose

  authenticatedData
  state

  constructor({
    command,
    options,
    config,
    configFilePath,
    versionFramework,
    stage,
    resolverManager,
    compose,
  }) {
    this.command = command
    this.options = options
    this.config = config
    this.configFilePath = configFilePath
    this.versionFramework = versionFramework
    this.stage = stage
    this.resolverManager = resolverManager
    this.compose = compose
  }

  /**
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * FUNCTIONS TO BE IMPLEMENTED BY THE RUNNER IMPLEMENTATION
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   */

  /**
   * Retrieve the configuration file names for the Runner.
   *
   * Required.
   *
   * @returns {string[]} Array of configuration file names.
   */
  static configFileNames() {}

  /**
   * Determine whether the Runner should execute.
   * It must be implemented to decide if the Runner should proceed
   * based on the provided configuration.
   *
   * Required.
   *
   * @param {Object} options - Options object.
   * @param {Object} options.config - The service configuration object.
   * @param {string} options.configFilePath - The path to the configuration file.
   * @returns {Promise<boolean>}
   */
  static async shouldRun({ config, configFilePath }) {}

  /**
   * Retrieve the CLI schema for commands and their options.
   * It must be implemented to enable CLI validation and help generation.
   *
   * Required.
   *
   * @returns {Command[]} Array of command objects.
   */
  getCliSchema() {}

  /**
   * Execute the Runner's command.
   * This method contains the primary logic for the Runner's execution.
   *
   * IMPORTANT: Runner implementations must perform the following steps:
   * 1. Authenticate the user
   * 2. Resolve variables
   * 3. If necessary, resolve the state store
   *
   * To use the state store, the Runner must call the `resolveStateStore` method and either
   * store the state using the returned functions or return the state object from the `run` method.
   *
   * The implementation must return a RunnerResult object with the following properties:
   * - serviceUniqueId: The unique identifier for the service. Used in:
   * 1. Usage events to identify the service.
   * 2. State store to manage the service's state. This is required for the Compose work correctly.
   * - state (optional): The entire state object to be stored in the state store. No partial state management is supported.
   *
   * Required.
   *
   * @returns {Promise<RunnerResult>}
   */
  async run() {}

  /**
   * Generate the unique identifier for the service.
   * This method is required and is used to uniquely identify the service in usage events
   * and to manage its state in the state store.
   *
   * IMPORTANT: This function is called without any previous authentication, variable resolution, state store setup etc.
   * Implementation should take this into account and initialize any necessary data.
   *
   * Required.
   *
   * @returns {Promise<{serviceUniqueId: string}>} Resolves to the object containing the unique identifier.
   */
  async getServiceUniqueId() {}

  /**
   * Retrieve the custom configuration file path.
   * (e.g., provided by the user as an option).
   *
   * Optional.
   *
   * @returns {Promise<string>} Resolves to the custom configuration file path.
   */
  static async customConfigFilePath({ options }) {}

  /**
   * Retrieve additional details for the usage event.
   * Implement this method if the Runner needs to send supplementary details
   * as part of the usage event data.
   *
   * IMPORTANT: This data is sent to the Serverless, Inc. API.
   * Do not include any unnecessary or sensitive data in the usage event.
   *
   * Optional.
   *
   * @returns {Object} Additional details for the usage event
   */
  getUsageEventDetails() {}

  /**
   * Retrieve additional details for the analysis event.
   * Implement this method if the Runner needs to provide supplementary data
   * for analysis events.
   *
   * Optional.
   *
   * @returns {Object} Additional details for the analysis event
   */
  getAnalysisEventDetails() {}

  /**
   * Retrieve additional details for the deployment event.
   * Implement this method if the Runner needs to send supplementary deployment data.
   *
   * Optional.
   *
   * @returns {Object} Deployment event details
   */
  getDeploymentEventDetails() {}

  /**
   * Retrieve metadata to save in meta.json file.
   * Implement this method if the Runner needs to save additional metadata for
   * the support command.
   *
   * Optional.
   *
   * @returns {Object} Additional metadata to save in meta.json file
   */
  getMetadataToSave() {}
  /**
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   * FUNCTIONS TO BE USED BY THE RUNNER IMPLEMENTATION
   * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   */

  /**
   * Resolves all necessary variables and handles authentication.
   *
   * This function performs the following steps:
   * 1. Resolves the organization, application, service, and region information
   *    to retrieve relevant dashboard data.
   * 2. Resolves the provider profile to include it in the AWS credentials resolution process.
   * 3. Adds a default AWS credentials resolver to enable retrieving a license key
   *    from AWS services like SSM or Secrets Manager.
   * 4. Resolves the `licenseKey` configuration key for use in authentication.
   * 5. Authenticates the user by invoking the authentication mechanism.
   * 6. Loads dashboard data into the resolver manager for further use in subsequent
   *    variable resolution steps (e.g., resolving Dashboard parameters or
   *    Dashboard Provider AWS credentials).
   *
   * This function ensures all necessary data is available for authentication and
   * variables resolution while integrating dashboard data into the process.
   *
   *  @returns {Promise<Object>} Resolves to the authenticated data object.
   */
  async resolveVariablesAndAuthenticate() {
    const p = progress.get('resolve-variables-and-authenticate')
    p.notice('Resolving variables')
    await this.resolverManager?.resolveParams(
      ResolverManager.limitedProvidersSet,
    )
    // Resolve org, app, service, region to be able to retrieve dashboard data
    await this.resolverManager?.resolveOrgAppServiceRegion()
    // Resolve the provider profile to include it in AWS credentials resolution
    await this.resolverManager?.resolveProviderProfile()
    // Resolve AWS credentials resolver to be able to
    // get license key from SSM/Secrets Manager
    await this.resolverManager?.addDefaultAwsCredentialResolver()
    // If a license key is present in the service configuration,
    // authenticate after resolving the AWS credentials resolver,
    // allowing the use of SSM to resolve the license key.
    await this.resolverManager?.resolveLicenseKey()
    p.notice('Authenticating')
    const authentication = new Authentication({
      versionFramework: this.versionFramework,
    })
    this.authenticatedData = await authentication.authenticate(
      this.config,
      this.options,
      this.resolverManager,
      this.compose?.orgName,
    )
    // Load dashboard data to resolver manager for further use in the variables resolution
    // (params, AWS credentials)
    await this.resolverManager?.loadDashboardData(this.authenticatedData)
    // Process notifications for all runners once
    await this.processNotifications()
    p.remove()
    return this.authenticatedData
  }

  /**
   * Authenticate the user and retrieve the authenticated data.
   * Uses
   *   * org: `org` CLI option, `org` key in the config file, `SERVERLESS_ORG_NAME` environment variable
   *   * app: `app` CLI option, `app` key in the config file
   *   * service: `service` key in the config file
   *   * stage: `stage` CLI option, `provider.stage` key in the config file, defaults to `dev`
   *   * region: `region` CLI option, `provider.region` key in the config file, defaults to `us-east-1`
   *   * license key: `SERVERLESS_LICENSE_KEY` or `SERVERLESS_ORG_ACCESS_KEY` environment variable, `licenseKey` key in the config file, `/serverless-framework/license-key` SSM parameter in the AWS account used by the deployment
   *
   * @returns {Promise<Object>} Resolves to the authenticated data object.
   */
  async authenticate() {
    const p = progress.get('authenticate')
    p.notice('Authenticating')
    const authentication = new Authentication({
      versionFramework: this.versionFramework,
    })
    this.authenticatedData = await authentication.authenticate(
      this.config,
      this.options,
      this.resolverManager,
      this.compose?.orgName,
    )
    // Process notifications for all runners once
    await this.processNotifications()
    p.remove()
    return this.authenticatedData
  }

  /**
   * Display and throttle notifications from BFF, and block deploy/package when instructed.
   */
  async processNotifications() {
    if (this._notificationsHandled) return
    this._notificationsHandled = true

    try {
      const notifications = sanitizeNotifications(
        this?.authenticatedData?.notifications,
      )
      if (!notifications.length) return

      const { deferredNotifications } = await handleAndMaybeThrowNotifications({
        notifications,
        command: this.command,
      })
      if (deferredNotifications?.length) {
        this._notificationsToLog = deferredNotifications
      }
    } catch (err) {
      if (
        err instanceof ServerlessError &&
        err.code ===
          ServerlessErrorCodes.general.COMMAND_BLOCKED_BY_NOTIFICATION
      ) {
        // Re-throw the blocking error to stop the command
        throw err
      }
      // Log any other notification handling errors at debug level and continue
      const logger = log.get('core:notifications')
      logger.debug('Notification handling error:', err?.message || err)
    }
  }

  /**
   * Resolves all variables within the configuration file
   * using all loaded resolvers.
   *
   * This function performs the following steps:
   * 1. Resolves parameters specified in the configuration.
   * 2. Resolves the entire configuration file using the resolved parameters.
   *
   * @param {Object} options
   * @param {boolean} options.printResolvedVariables - Whether to print the resolved variables on `print` command.
   *
   * @returns {Promise<void>} Resolves when all variables in the configuration are processed.
   */
  async resolveVariables({ printResolvedVariables = false } = {}) {
    const p = progress.get('resolve-variables')
    p.notice('Resolving variables')
    await this.resolverManager.resolveConfigFile({
      printResolvedVariables,
    })
    p.remove()
  }

  /**
   * Reloads the configuration file and resolver manager
   * to reflect any changes made to the configuration file.
   * It is useful when the configuration file is updated during the execution.
   * It returns the updated configuration, resolver manager, and stage.
   * If the `configFilePath` is not provided, it uses the current configuration file path.
   *
   * @param {Object} options
   * @param {string} options.configFilePath
   * @returns {Promise<{configFilePath, resolverManager: ResolverManager, stage: *, configFileRaw: *, config: any}>}
   */
  async reloadConfig({ configFilePath = this.configFilePath }) {
    const config = await readConfig(configFilePath)
    const configFileRaw = await readFile(configFilePath)
    this.config = config
    this.configFilePath = configFilePath
    const { manager: resolverManager, stage } =
      (await variables.createResolverManager({
        options: this.options,
        serviceConfigFile: config,
        configFileDirPath: configFilePath && path.dirname(configFilePath),
        existingResolverProviders: this.compose?.resolverProviders,
        existingParams: this.compose?.params,
        loadAllResolvers: this.constructor.name === 'ComposeRunner',
        print: this.command?.[0] === 'print' && !!this.options?.debug,
        versionFramework: this.versionFramework,
      })) || {}
    this.resolverManager = resolverManager
    this.stage = stage
    return {
      config,
      configFilePath,
      configFileRaw,
      resolverManager,
      stage,
    }
  }

  /**
   * Resolve the state store and returns functions to get and set state.
   * Using these functions, you can store and retrieve state for the service
   * during the execution. However, if you need to store state only after
   * execution, you can just resolve the state store by calling this function
   * and return the state object from the `run` method (see RunnerResult).
   *
   * This function resolves the state store using the following steps:
   * 1. Resolves credentials for the state store provider.
   *    If the `state` configuration is set, it uses the specified provider
   *    Otherwise, it uses the deployment credentials
   * 2. Checks /serverless-framework/state/s3-bucket SSM parameter to get the bucket name
   *    If the parameter is not set, it generates a bucket name and sets the parameter
   *    If the parameter is set, it uses the bucket name from the parameter
   * 3. Checks if the bucket exists and creates it if it doesn't
   * 4. Returns functions to get and set state.
   *
   * @param {Object} options
   * @param {Function} options.credentialProvider - A function that resolves the credentials for the state store
   *
   * @returns {Promise<{putServiceState: function, getServiceState: function}>}
   * Resolves to an object containing functions to store and retrieve state.
   */
  async resolveStateStore({ credentialProvider }) {
    const p = progress.get('resolveStateStore')
    p.notice('Resolving state store')
    await this.resolverManager?.loadCustomStateResolver()
    const { putServiceState, getServiceState } = await resolveStateStore({
      resolverManager: this.resolverManager,
      service: this.config,
      credentialProvider,
    })
    this.state = {
      putServiceState,
      getServiceState,
    }
    p.remove()
    return this.state
  }

  /**
   * Retrieve the credentials for the specified provider.
   *
   * @param {Object} options
   * @param {string} options.providerName - The name of the provider
   *
   * @returns {Promise<Object>} Resolves to the provider credentials.
   */
  async getProviderCredentials({ providerName }) {
    const p = progress.get('getProviderCredentials')
    p.notice(`Resolving credentials for ${providerName}`)
    const provider = await this.resolverManager.loadAndResolveProvider({
      providerName,
    })
    const credentials = await provider.instance.resolveCredentials()
    p.remove()
    return credentials
  }

  /**
   * Fetch data using the specified provider and resolver.
   *
   * @param {Object} options
   * @param {string} options.providerName - The name of the provider
   * @param {string} options.resolverName - The name of the resolver
   * @param {string} options.key - The key to fetch data for
   *
   * @returns {Promise<any>} Resolves to the fetched data.
   */
  async fetchData({ providerName, resolverName, key }) {
    const provider = this.resolverManager.getProvider(providerName)
    const { resolver } = this.resolverManager.getResolver(
      provider,
      resolverName,
      key,
    )
    return await resolver(key)
  }

  /**
   * Store data using the specified provider and resolver.
   *
   * @param {Object} options
   * @param {string} options.providerName - The name of the provider
   * @param {string} options.resolverName - The name of the resolver
   * @param {string} options.key - The key to store data for
   * @param {any} options.value - The value to store
   *
   * @returns {Promise<void>} Resolves when the data is stored.
   */
  async storeData({ providerName, resolverName, key, value }) {
    const provider = this.resolverManager.getProvider(providerName)
    const { writer } = this.resolverManager.getWriter(
      provider,
      resolverName,
      key,
    )
    return await writer(key, value)
  }

  getNotificationsToLog() {
    return this._notificationsToLog || []
  }
}
