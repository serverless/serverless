import { AbstractProvider } from '../index.js'
import { resolveVariableFromSsm } from './ssm.js'
import { resolveVariableFromS3, storeDataInS3 } from './s3.js'
import { resolveVariableFromCloudFormation } from './cf.js'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { addProxyToAwsClient } from '@serverless/util'
import { getAwsCredentials } from './credentials.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

export class Aws extends AbstractProvider {
  static type = 'aws'
  static resolvers = ['ssm', 's3', 'cf']
  static defaultResolver = 'ssm'

  static validateConfig(config) {
    if (config?.profile && typeof config.profile !== 'string') {
      throw new Error('Profile must be a string')
    }
    if (
      config?.ignoreCache !== undefined &&
      typeof config.ignoreCache !== 'boolean'
    ) {
      throw new Error('ignoreCache must be a boolean')
    }
  }

  isDefaultConfig = false

  constructor({
    logger,
    providerConfig = {},
    serviceConfigFile,
    configFileDirPath,
    options,
    stage,
    dashboard,
    composeParams,
    resolveVariableFunc,
    resolveConfigurationPropertyFunc,
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
    })

    this.isDefaultConfig = !Object.keys(providerConfig).some(
      (key) => key !== 'type',
    )
  }

  async storeData(resolverType, resolutionDetails, key, value) {
    await super.storeData(resolverType, resolutionDetails, key, value)

    const region = resolveRegion(
      this.config,
      resolutionDetails,
      this.options,
      this.serviceConfigFile,
    )

    if (resolverType === 's3') {
      return await storeDataInS3(
        this.credentials,
        region,
        resolutionDetails,
        key,
        value,
      )
    }
    throw new Error(`Resolver ${resolverType} does not support storing data`)
  }

  async resolveVariable({ resolverType, resolutionDetails, key }) {
    await super.resolveVariable({ resolverType, resolutionDetails, key })

    const region = resolveRegion(
      this.config,
      resolutionDetails,
      this.options,
      this.serviceConfigFile,
    )

    try {
      if (key === 'accountId') {
        return resolveAccountId(this.credentials, region)
      }

      if (key === 'region') {
        return region
      }

      if (resolverType === 'ssm') {
        return resolveVariableFromSsm(
          this.logger,
          this.credentials,
          region,
          key,
          resolutionDetails,
        )
      }
      if (resolverType === 's3') {
        return resolveVariableFromS3(
          this.logger,
          this.credentials,
          this.config,
          region,
          resolutionDetails,
          key,
        )
      }
      if (resolverType === 'cf') {
        return resolveVariableFromCloudFormation(
          this.logger,
          this.credentials,
          this.config,
          region,
          key,
        )
      }
    } catch (error) {
      let err
      if (error.name === 'ExpiredToken') {
        const errorMessage = `AWS credentials appear to have expired. This is likely due to the use of temporary credentials (e.g. AWS SSO, AWS IAM STS). Original error from AWS: "${error.message}"`
        err = Object.assign(
          new ServerlessError(
            errorMessage,
            ServerlessErrorCodes.general.AWS_CREDENTIALS_MISSING,
            {
              originalMessage: error.message,
              originalName: error.name,
              stack: false,
            },
          ),
          {
            providerError: error,
          },
        )
      }
      throw err
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }

  async resolveCredentials() {
    await super.resolveCredentials()
    return await getAwsCredentials({
      logger: this.logger,
      dashboard: this.dashboard,
      config: this.config,
      isDefaultConfig: this.isDefaultConfig,
    })
  }

  resolveRegion() {
    return resolveRegion(
      this.config,
      null,
      this.options,
      this.serviceConfigFile,
    )
  }
}

const resolveAccountId = async (credentials, region) => {
  const sts = addProxyToAwsClient(new STSClient({ credentials, region }))
  try {
    const { Account: accountId } = await sts.send(
      new GetCallerIdentityCommand({}),
    )
    return accountId
  } catch (error) {
    if (error instanceof ServerlessError) {
      throw error
    }
    if (error.name === 'ExpiredToken') {
      throw new ServerlessError(
        `AWS credentials appear to have expired. This is likely due to the use of temporary credentials (e.g. AWS SSO, AWS IAM STS). Original error from AWS: "${error.message}"`,
        'AWS_CREDENTIALS_EXPIRED',
        {
          stack: false,
        },
      )
    }
    throw new ServerlessError(
      `Failed to resolve AWS account ID: ${error.message}`,
      'AWS_ACCOUNT_ID_RESOLUTION_FAILED',
      {
        stack: false,
      },
    )
  }
}

const resolveRegion = (
  providerConfig,
  resolverConfig,
  options,
  serviceConfigFile,
) => {
  if (providerConfig?.region) {
    return providerConfig.region
  }
  if (resolverConfig?.region) {
    return resolverConfig.region
  }
  if (options?.region || options?.r) {
    return options.region
  }
  if (serviceConfigFile?.provider?.region) {
    return serviceConfigFile.provider.region
  }
  if (process?.env?.AWS_REGION) {
    return process.env.AWS_REGION
  }
  return 'us-east-1'
}
