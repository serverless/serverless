import { AbstractProvider } from '../index.js'
import { CoreSDK } from '@serverless-inc/sdk'
import _ from 'lodash'

export class Output extends AbstractProvider {
  static type = 'output'
  static resolvers = ['dashboard']
  static defaultResolver = 'dashboard'

  static validateConfig(providerConfig) {}

  sdk

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
    super({
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
    })
    this.sdk = new CoreSDK({
      authToken: dashboard?.accessKey,
      headers: {
        'x-serverless-version': this.versionFramework,
      },
    })
  }

  resolveVariable = ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'dashboard') {
      return resolveOutputFromDashboard(
        this.sdk,
        this.serviceConfigFile.org,
        this.serviceConfigFile.app,
        this.stage,
        this.options?.region ||
          this.options?.r ||
          this.serviceConfigFile?.provider?.region ||
          'us-east-1',
        key,
      )
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveOutputFromDashboard = async (
  sdk,
  org,
  app,
  stage,
  region,
  key,
) => {
  const variableParts = key.split(':')
  let service
  let outputNameWithOptionalSubkey
  if (
    variableParts.length === 1 &&
    areVariablePartsNotEmpty(variableParts[0])
  ) {
    service = variableParts[0].split('.', 1)[0]
    outputNameWithOptionalSubkey = variableParts[0].slice(service.length)
  } else if (
    variableParts.length === 4 &&
    areVariablePartsNotEmpty(variableParts[3])
  ) {
    service = variableParts[3].split('.', 1)[0]
    outputNameWithOptionalSubkey = variableParts[3].slice(service.length)
    if (variableParts[0]) {
      app = variableParts[0]
    }
    if (variableParts[1]) {
      stage = variableParts[1]
    }
    if (variableParts[2]) {
      region = variableParts[2]
    }
  } else {
    throw new Error(
      `${key} does not conform to syntax service.key or app:stage:region:service.key`,
    )
  }

  const outputName = outputNameWithOptionalSubkey.split('.')[1]
  const subkey = outputNameWithOptionalSubkey.slice(outputName.length + 2)

  const value = await (async () => {
    try {
      const params = {
        orgName: org,
        appName: app,
        serviceName: service,
        stageName: stage,
        regionName: region,
        outputName,
      }
      const result = await sdk.services.getOutput(params)
      return result?.value
    } catch (error) {
      if (error.message.includes(' not found')) return null
      throw error
    }
  })()

  if (subkey) {
    return _.get(value, subkey)
  }
  return value
}

function areVariablePartsNotEmpty(variableParts) {
  const splitParts = variableParts.split('.')
  for (const part of splitParts) {
    if (!part) {
      return false
    }
  }
  return true
}
