import { AbstractProvider } from '../index.js'

export class Env extends AbstractProvider {
  static type = 'env'
  static resolvers = ['variables']
  static defaultResolver = 'variables'

  static validateConfig(providerConfig) {}

  resolveVariable({ resolverType, resolutionDetails, key }) {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'variables') {
      return resolveVariableFromEnvVars(
        this.credentials,
        resolutionDetails,
        key,
      )
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

/**
 * Resolves a variable from environment variables.
 */
const resolveVariableFromEnvVars = (credentials, resolutionDetails, key) => {
  return process.env?.[key] ?? null
}
