import { AbstractProvider } from '../index.js'

export class Opt extends AbstractProvider {
  static type = 'opt'
  static resolvers = ['options']
  static defaultResolver = 'options'

  static validateConfig(providerConfig) {}

  resolveVariable = ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'options') {
      return resolveVariableFromOptions(this.options, key)
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

/**
 * Resolves a variable from CLI options.
 */
const resolveVariableFromOptions = (options, key) => {
  return options?.[key] ?? null
}
