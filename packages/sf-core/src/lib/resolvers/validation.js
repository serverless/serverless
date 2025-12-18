/**
 * @typedef {Object} ProviderConfig
 * @property {string} type - The type of the provider.
 * @property {Object} [resolver] - The resolvers of the provider.
 */
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { providerRegistry } from './registry/index.js'

export const ensureNoParamsAndStagesTogether = (config) => {
  if (config?.params && config?.stages) {
    throw new ServerlessError(
      '"params" and "stages" cannot be used together in the top-level of serverless.yml.' +
        'If you want to define params, use the "params" key in the "stages" block.',
      ServerlessErrorCodes.resolvers.RESOLVER_INVALID_CONFIG,
    )
  }
}

export const validateCustomResolverConfigs = (config) => {
  for (const stageName in config?.stages) {
    const stageConfig = config?.stages[stageName]
    for (const resolverName in stageConfig?.resolvers) {
      const resolverConfig = stageConfig.resolvers[resolverName]
      if (!resolverConfig.type) {
        throw new ServerlessError(
          `"type" attribute is missing in ${resolverName} resolver in stage ${stageName}`,
          ServerlessErrorCodes.resolvers.RESOLVER_INVALID_CONFIG,
        )
      }
      const Provider = providerRegistry.get(resolverConfig.type)
      if (!Provider) {
        throw new ServerlessError(
          `Resolver provider ${resolverConfig.type} is not supported`,
          ServerlessErrorCodes.resolvers.RESOLVER_PROVIDER_NOT_SUPPORTED,
        )
      }
      try {
        Provider.validateConfig(resolverConfig)
      } catch (error) {
        throw new ServerlessError(
          `Invalid configuration for resolver "${resolverName}" of type "${resolverConfig.type}" in stage "${stageName}": ${error.message}`,
          ServerlessErrorCodes.resolvers.RESOLVER_INVALID_CONFIG,
        )
      }
    }
  }
}

export const validateResolversUniqueness = (config) => {
  for (const stageName in config?.stages) {
    const stageConfig = config.stages[stageName]
    const resolverNames = new Set() // Track resolver names within each resolverProvider

    for (const resolverProviderName in stageConfig?.resolvers) {
      const resolverProviderConfig = stageConfig.resolvers[resolverProviderName]

      for (const resolverName in resolverProviderConfig) {
        const resolverConfig = resolverProviderConfig[resolverName]

        // Only add the resolver name if it has a type field
        if (resolverConfig?.type) {
          if (resolverNames.has(resolverName)) {
            throw new ServerlessError(
              `Duplicate resolver name "${resolverName}" found in resolverProvider "${resolverProviderName}" in stage "${stageName}". Resolver names must be unique within a stage.`,
              ServerlessErrorCodes.resolvers.RESOLVER_NAME_DUPLICATE,
              { stack: false },
            )
          }
          resolverNames.add(resolverName)
        }
      }
    }
  }
}
