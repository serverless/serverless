import { AbstractProvider } from '../index.js'

export class Sls extends AbstractProvider {
  static type = 'sls'
  static resolvers = ['framework']
  static defaultResolver = 'framework'

  static validateConfig(providerConfig) {}

  static instanceId = new Date().getTime().toString()

  resolveVariable = ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (key === 'stage') {
      return this.stage
    }

    if (key === 'instanceId') {
      return this.constructor.instanceId
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}
