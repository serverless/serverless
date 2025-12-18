import { AbstractProvider } from '../index.js'

const trueStrings = new Set(['true', '1'])
const falseStrings = new Set(['false', '0'])

export class StrToBool extends AbstractProvider {
  static type = 'strToBool'
  static resolvers = ['convert']
  static defaultResolver = 'convert'

  static validateConfig(providerConfig) {}

  resolveVariable = ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    key = key.trim().toLowerCase()
    if (trueStrings.has(key)) return true
    if (falseStrings.has(key)) return false

    throw new Error(
      `Invalid "strToBool" input: Expected either "true", "false", "0", or "1". Received: ${key}`,
    )
  }
}
