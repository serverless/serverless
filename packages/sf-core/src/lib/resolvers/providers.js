import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { providerRegistry } from './registry/index.js'
import { AbstractProvider } from './providers/index.js'
import _ from 'lodash'

/**
 * @typedef {Object} ResolverProvider
 * @property {AbstractProvider} instance - The instance of the provider.
 * Must be an instance of a class extending AbstractProvider.
 * @property {Record<string, ResolverFunc>} resolvers - The resolvers of the provider.
 */

/**
 * @typedef {Function} ResolverFunc
 * @param {string} key - The key to resolve.
 * @param {any} params - The parameters to pass to the resolver.
 * @returns {any} The resolved value.
 */

/**
 * @typedef {Function} WriterFunc
 * @param {string} key - The key to resolve.
 * @param {any} value - The value to store.
 * @param {any} params - The parameters to pass to the writer.
 */

/**
 * This function creates a provider instance and its associated resolvers.
 *
 * @param {ProviderConfig} providerConfig - The configuration of the provider.
 * @param {Object} serviceConfigFile - The configuration file of the service.
 * @param {string} configFileDirPath - The directory path of the configuration file.
 * @param {Object} options - The options to pass to the provider.
 * @param {string} stage - The stage.
 * @param {DashboardData} dashboard - The dashboard data.
 * @param {Object} composeParams - The Compose parameters.
 * @param {Function} resolveVariableFunc - The resolveVariable function.
 * @param {Function} resolveConfigurationPropertyFunc - The resolveConfigurationProperty function.
 * @returns {ResolverProvider} The provider with its associated resolvers.
 */
export const createResolverProvider = (
  providerConfig,
  serviceConfigFile,
  configFileDirPath,
  options,
  stage,
  dashboard,
  composeParams,
  resolveVariableFunc,
  resolveConfigurationPropertyFunc,
  logger,
  versionFramework,
) => {
  const Provider = providerRegistry.get(providerConfig.type)
  if (!Provider) {
    let errorMessage = `Provider ${providerConfig.type} is not supported`
    if (providerConfig.type === 'AWS') {
      errorMessage += '. Please change Provider "AWS" to "aws"'
    }
    throw new ServerlessError(
      errorMessage,
      ServerlessErrorCodes.resolvers.RESOLVER_PROVIDER_NOT_SUPPORTED,
    )
  }
  const providerInstance = new Provider({
    logger,
    providerConfig,
    serviceConfigFile,
    configFileDirPath,
    stage,
    options,
    dashboard,
    composeParams,
    resolveVariableFunc,
    resolveConfigurationPropertyFunc,
    versionFramework,
  })
  const resolvers = {}
  const writers = {}

  addResolversForProvider(providerConfig, providerInstance, resolvers, writers)

  // Iterate over the resolvers of the provider to create resolver
  for (const resolverName of Provider.resolvers) {
    // If the resolver does not exist, add it with no configuration
    if (!resolvers[resolverName]) {
      resolvers[resolverName] = createResolverFunc(
        providerInstance,
        resolverName,
      )
    }
    if (!writers[resolverName]) {
      writers[resolverName] = createWriterFunc(providerInstance, resolverName)
    }
  }

  return {
    instance: providerInstance,
    resolvers,
    writers,
  }
}

export function addResolversForProvider(
  providerConfig,
  providerInstance,
  resolvers,
  writers,
) {
  for (const attribute in providerConfig) {
    // Check if the attribute is an object and has a resolver attribute
    if (
      typeof providerConfig[attribute] === 'object' &&
      Object.prototype.hasOwnProperty.call(providerConfig[attribute], 'type')
    ) {
      const resolverConfig = providerConfig[attribute]
      resolvers[attribute] = createResolverFunc(
        providerInstance,
        resolverConfig.type,
        resolverConfig,
      )
      writers[attribute] = createWriterFunc(
        providerInstance,
        resolverConfig.type,
        resolverConfig,
      )
    }
  }
}

/**
 * @typedef {Function} ProcessNode
 * @param {string} nodeName - The name of the node to process.
 * @returns {Promise<void>} A promise that resolves when the node is processed.
 */

/**
 * This function creates a resolver function.
 *
 * @param {AbstractProvider} providerInstance - The instance of the provider.
 * @param {string} resolverName - The name of the resolver.
 * @param {Object} resolverConfig - The configuration of the resolver.
 * @returns {ResolverFunc} The resolver function.
 */
export function createResolverFunc(
  providerInstance,
  resolverName,
  resolverConfig = null,
) {
  const cache = new Map()
  return async (key, params) => {
    const cacheKey = `${key}#${JSON.stringify(params)}`
    if (cache.has(cacheKey)) {
      return _.cloneDeep(await cache.get(cacheKey))
    }
    const result = providerInstance.resolveVariable({
      resolverType: resolverName,
      resolutionDetails: resolverConfig,
      key,
      params,
    })
    cache.set(cacheKey, result)
    return result
  }
}

/**
 * This function creates a writer function.
 *
 * @param {AbstractProvider} providerInstance - The instance of the provider.
 * @param {string} resolverName - The name of the resolver.
 * @param {Object} resolverConfig - The configuration of the resolver.
 * @returns {WriterFunc} The resolver function.
 */
export function createWriterFunc(
  providerInstance,
  resolverName,
  resolverConfig = null,
) {
  return async (key, value, params) => {
    return await providerInstance.storeData(
      resolverName,
      resolverConfig,
      key,
      value,
      params,
    )
  }
}

export const convertPluginToResolverProvider = (
  pluginName,
  sourceName,
  resolveFunc,
) => {
  return class extends AbstractProvider {
    static type = sourceName
    static resolvers = [sourceName]
    static defaultResolver = sourceName

    static validateConfig() {}

    resolveVariable = async ({
      resolverType,
      resolutionDetails,
      key,
      params,
    }) => {
      super.resolveVariable({ resolverType, resolutionDetails, key })

      if (resolverType === sourceName) {
        if (!resolveFunc) {
          throw new ServerlessError(
            `Invalid "configurationVariablesSources.${sourceName}.resolve" value on "${pluginName}", expected function`,
            ServerlessErrorCodes.resolvers.RESOLVER_INVALID_PLUGIN_CONFIGURATION,
          )
        }
        const result = await resolveFunc({
          address: key,
          params: params,
          options: this.options,
          resolveConfigurationProperty: this.resolveConfigurationPropertyFunc,
          resolveVariable: this.resolveVariableFunc,
        })
        return result?.value
      }
      throw new Error(`Resolver ${resolverType} is not supported`)
    }
  }
}

export function getProviderNamesFromConfigFile(config, stage) {
  const defaultResolvers = config?.stages?.default?.resolvers || {}
  const stageResolvers = config?.stages?.[stage]?.resolvers || {}
  const allResolvers = { ...defaultResolvers, ...stageResolvers }
  return Object.keys(allResolvers)
}
