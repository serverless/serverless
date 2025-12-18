import { AbstractProvider } from '../index.js'
import _ from 'lodash'

export class Self extends AbstractProvider {
  static type = 'self'
  static resolvers = ['config']
  static defaultResolver = 'config'

  static validateConfig(providerConfig) {}

  resolveVariable = ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'config') {
      return resolveVariableFromConfig(this.logger, this.serviceConfigFile, key)
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveVariableFromConfig = (logger, configFile, key) => {
  const value = getNestedValue(configFile, key)
  if (value === undefined) {
    logger.debug(`key ${key} not found in config`)
    return null
  }
  return _.cloneDeep(value)
}

const getNestedValue = (obj, path) => {
  return path.split('.').reduce((o, k) => (o || {})[k], obj)
}
