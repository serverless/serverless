import { AbstractProvider } from '../index.js'
import { resolveVariableFromSsm } from './ssm.js'
import { resolveVariableFromS3, storeDataInS3 } from './s3.js'
import { resolveVariableFromCloudFormation } from './cf.js'
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { partition } from '@aws-sdk/core/client'
import { getAwsCredentials } from './credentials.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { invalidateAwsResponseCache, sendAwsRequest } from './clients.js'
import {
  awsCredentialsFix,
  describeAwsCredentialSource,
} from './credential-source.js'

export class Aws extends AbstractProvider {
  static type = 'aws'
  static resolvers = ['ssm', 's3', 'cf']
  static defaultResolver = 'ssm'

  /**
   * The `${cf:}` reads are the memoized ones that can go stale — a run that
   * changed a stack changes that stack's outputs — so a runner that just
   * mutated infrastructure must make this provider forget them.
   */
  static invalidateCaches() {
    invalidateAwsResponseCache()
  }

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
        this.logger,
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
        return await resolveAccountId(this.logger, this.credentials, region, {
          dashboard: this.dashboard,
          config: this.config,
          resolver: this.resolverName,
        })
      }

      if (key === 'region') {
        return region
      }

      if (key === 'partition') {
        return resolvePartition(region)
      }

      if (resolverType === 'ssm') {
        return await resolveVariableFromSsm(
          this.logger,
          this.credentials,
          region,
          key,
          resolutionDetails,
        )
      }
      if (resolverType === 's3') {
        return await resolveVariableFromS3(
          this.logger,
          this.credentials,
          this.config,
          region,
          resolutionDetails,
          key,
        )
      }
      if (resolverType === 'cf') {
        return await resolveVariableFromCloudFormation(
          this.logger,
          this.credentials,
          this.config,
          region,
          key,
        )
      }
    } catch (error) {
      if (
        error.name === 'ExpiredToken' ||
        error.name === 'ExpiredTokenException'
      ) {
        const errorMessage = `AWS credentials appear to have expired. This is likely due to the use of temporary credentials (e.g. AWS SSO, AWS IAM STS). Original error from AWS: "${error.message}"`
        throw Object.assign(
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
      // Every other failure keeps today's shape: the manager wraps it.
      throw error
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
      resolverName: this.resolverName,
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

// AWS answered with a 4xx (an invalid, unauthorized or unsigned key), or the
// SDK could not load the credentials at all.
const isCredentialRejection = (error) => {
  const status = error?.$metadata?.httpStatusCode
  return (
    error?.name === 'CredentialsProviderError' ||
    (typeof status === 'number' && status >= 400 && status < 500)
  )
}

const resolveAccountId = async (logger, credentials, region, sourceInput) => {
  try {
    const { Account: accountId } = await sendAwsRequest({
      service: 'sts',
      credentials,
      region,
      logger,
      command: new GetCallerIdentityCommand({}),
      target: 'caller-identity',
      cache: true,
    })
    return accountId
  } catch (error) {
    if (error instanceof ServerlessError) {
      throw error
    }
    if (
      error.name === 'ExpiredToken' ||
      error.name === 'ExpiredTokenException'
    ) {
      throw new ServerlessError(
        `AWS credentials appear to have expired. This is likely due to the use of temporary credentials (e.g. AWS SSO, AWS IAM STS). Original error from AWS: "${error.message}"`,
        'AWS_CREDENTIALS_EXPIRED',
        {
          stack: false,
        },
      )
    }
    // Only when AWS answered and refused the credentials does the message say
    // where they came from and what to do, in the same words `serverless
    // agent setup` uses for this state. A request that never reached AWS
    // (DNS, a refused connection, a proxy) is about the network, not them.
    const credentialsRejected = isCredentialRejection(error)
    const fix =
      credentialsRejected &&
      awsCredentialsFix({
        ...describeAwsCredentialSource(sourceInput),
        resolver: sourceInput?.resolver,
      })
    throw Object.assign(
      new ServerlessError(
        fix
          ? `Failed to resolve AWS account ID: ${String(error.message).replace(/\.?\s*$/, '.')} ${fix.charAt(0).toUpperCase()}${fix.slice(1)}.`
          : `Failed to resolve AWS account ID: ${error.message}`,
        'AWS_ACCOUNT_ID_RESOLUTION_FAILED',
        { originalMessage: error.message, stack: false },
      ),
      { credentialsRejected },
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

/**
 * Resolve the AWS partition for a region (e.g. `aws`, `aws-cn`, `aws-us-gov`,
 * `aws-iso-e`). Backed by the AWS SDK's bundled partition data, so it requires
 * no network call and no credentials — it is a pure function of the region
 * string — and stays correct as AWS adds partitions/regions instead of relying
 * on a hand-maintained prefix table. Unknown regions fall back to `aws`,
 * matching the CloudFormation `AWS::Partition` pseudo-parameter.
 * @param {string} region - The AWS region (e.g. `us-east-1`).
 * @returns {string} The partition name (e.g. `aws`).
 */
const resolvePartition = (region) => partition(region).name
