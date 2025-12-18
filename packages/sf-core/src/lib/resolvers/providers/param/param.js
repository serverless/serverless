import { AbstractProvider } from '../index.js'
import { ServerlessError } from '@serverless/util'
import _ from 'lodash'

export class Param extends AbstractProvider {
  static type = 'param'
  static resolvers = ['param']
  static defaultResolver = 'param'

  static validateConfig(providerConfig) {}

  resolveVariable = ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'param') {
      return resolveVariableFromParameters(
        extractCliParams(this.options?.param),
        this.serviceConfigFile.params?.default,
        this.serviceConfigFile.params?.[this.stage],
        this.serviceConfigFile.stages?.default?.params,
        this.serviceConfigFile.stages?.[this.stage]?.params,
        this.dashboard?.params,
        this.composeParams,
        key,
      )
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveVariableFromParameters = (
  cliParams,
  defaultConfigParams,
  stageConfigParams,
  defaultConfigStagesParams,
  stageConfigStagesParams,
  dashboardParams,
  composeParams,
  key,
) => {
  const mergedParams = {
    ...composeParams,
    ...dashboardParams,
    ...defaultConfigParams,
    ...defaultConfigStagesParams,
    ...stageConfigParams,
    ...stageConfigStagesParams,
    ...cliParams,
  }
  const value = mergedParams[key]
  if (value === undefined) {
    return null
  }
  return _.cloneDeep(value)
}

const extractCliParams = (paramsFromOptions) => {
  const cliParams = {}
  const regex = /(?<key>[^=]+)=(?<value>.+)/

  paramsFromOptions?.forEach((paramString) => {
    const match = paramString?.match(regex)
    if (!match || !match.groups) {
      throw new ServerlessError(
        `Encountered invalid "--param" CLI option value: "${paramString}". Supported format: "--param='<key>=<val>'"`,
        'INVALID_CLI_PARAM_FORMAT',
      )
    }
    const { key, value } = match.groups
    cliParams[key] = value.trimEnd()
  })
  return cliParams
}
