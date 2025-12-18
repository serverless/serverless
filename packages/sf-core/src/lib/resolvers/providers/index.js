/**
 * @typedef {Object} ProviderOptions
 * @property {Object} serviceConfigFile - The service configuration file.
 * @property {string} configFileDirPath - The path to the directory of the configuration file.
 * @property {Object} options - The options.
 * @property {string} stage - The stage.
 * @property {Object} dashboard - The dashboard.
 * @property {Object} composeParams - The Compose parameters.
 */

/**
 * AbstractProvider is a base class for all providers.
 * It provides common properties and methods that all providers can use.
 */
export class AbstractProvider {
  static type
  static resolvers
  static defaultResolver

  credentials
  serviceConfigFile
  configFileDirPath
  config
  options
  stage
  dashboard
  composeParams
  resolveVariableFunc
  resolveConfigurationPropertyFunc
  logger
  _credentialsPromise // Used to store the promise during credential resolution

  /**
   * @property {string} type - The type of the provider.
   * @property {Array<string>} resolvers - The resolvers of the provider.
   * @property {string} defaultResolver - The default resolver of the provider.
   *
   * @property {Object} credentials - The credentials.
   * @property {Object} serviceConfigFile - The service configuration file.
   * @property {string} configFileDirPath - The path to the directory of the configuration file.
   * @property {Object} config - The configuration.
   * @property {Object} options - The options.
   * @property {string} stage - The stage.
   * @property {Object} dashboard - The dashboard.
   * @property {Object} composeParams - The compose parameters.
   * @property {Function} resolveVariableFunc - The function to resolve variables.
   * @property {Function} resolveConfigurationPropertyFunc - The function to resolve configuration properties.
   */

  /**
   * Creates an instance of AbstractProvider.
   * @param {Object} config - The provider configuration.
   * @param {ProviderOptions} - The options.
   */
  constructor({
    logger,
    providerConfig,
    serviceConfigFile,
    configFileDirPath,
    options,
    stage,
    dashboard,
    composeParams,
    resolveVariableFunc,
    resolveConfigurationPropertyFunc,
    versionFramework,
  }) {
    this.logger = logger
    this.config = providerConfig
    this.serviceConfigFile = serviceConfigFile
    this.options = options
    this.stage = stage
    this.dashboard = dashboard
    this.configFileDirPath = configFileDirPath
    this.composeParams = composeParams
    this.resolveVariableFunc = resolveVariableFunc
    this.resolveConfigurationPropertyFunc = resolveConfigurationPropertyFunc
    this.versionFramework = versionFramework
  }

  async resolveVariable({ resolverType, resolutionDetails, key, params }) {
    if (!this.credentials) {
      if (!this._credentialsPromise) {
        // If there's no ongoing credential resolution, start it
        this._credentialsPromise = this.resolveCredentials()
      }
      // Await the stored promise to prevent concurrent execution
      if (this._credentialsPromise) {
        this.credentials = await this._credentialsPromise
      }
      // Clear the promise once resolved
      this._credentialsPromise = null
    }
  }

  async storeData(resolverType, resolutionDetails, key, value) {
    if (!this.credentials) {
      if (!this._credentialsPromise) {
        // If there's no ongoing credential resolution, start it
        this._credentialsPromise = this.resolveCredentials()
      }
      // Await the stored promise to prevent concurrent execution
      if (this._credentialsPromise) {
        this.credentials = await this._credentialsPromise
      }
      // Clear the promise once resolved
      this._credentialsPromise = null
    }
  }

  async resolveCredentials() {}

  static validateConfig(providerConfig) {
    throw new Error('The "validateConfig" method must be implemented')
  }
}
