import { log, progress } from '@serverless/util'
import { providerRegistry } from '../../lib/resolvers/registry/index.js'

/**
 * Credentials Provider for AWS
 * This is an improved version of the AWS provider credentials resolver from the Serverless Framework.
 * It resolves AWS credentials from the following sources, in order of precedence:
 * 1. Provider AWS credentials provided by the Serverless Platform
 * 2. AWS credentials resolved by the AWS SDK
 * It also calls AWS STS to resolve the AWS Account ID, which SF does as well, but no longer needs to.
 * Delete the AWS STS call in SF wherever it is used.
 *
 */
const getAwsCredentialProvider = async ({
  awsProfile = null,
  providerAwsAccessKeyId = null,
  providerAwsSecretAccessKey = null,
  providerAwsSessionToken = null,
  resolversManager = null,
  ignoreCache = false,
}) => {
  const logger = log.get(
    'core:utils:credentials:aws:get-aws-credential-identity-provider',
  )

  const awsResolver = await getAwsCredentialResolver({
    logger,
    providerProfile: awsProfile,
    accessKeyId: providerAwsAccessKeyId,
    secretAccessKey: providerAwsSecretAccessKey,
    sessionToken: providerAwsSessionToken,
    resolversManager,
    ignoreCache,
  })

  const region = awsResolver.resolveRegion()

  const p = progress.get('resolve-aws-credentials')
  p.notice('Checking AWS credentials')
  let awsAccountId
  try {
    /**
     * Resolve the AWS Account ID
     * The AWS Resolver resolves the AWS Credentials under the hood
     * and caches them.
     */
    awsAccountId = await awsResolver.resolveVariable({ key: 'accountId' })
  } catch (error) {
    logger.debug('error while resolving AWS account ID', error)
    // ignore ECONNREFUSED when using localstack autostart feature
    if (process.env.AWS_ENDPOINT_URL && error?.code === 'ECONNREFUSED') {
      logger.debug(
        'ECONNREFUSED error while resolving AWS account ID - ignoring since AWS_ENDPOINT_URL is set so probably localstack container is not started yet (using localstack autostart feature)',
      )
    } else {
      return {
        region,
        resolveCredentials: () => {
          throw error
        },
      }
    }
  } finally {
    p.remove()
  }
  logger.debug(
    `Resolved AWS credentials for account ID ${awsAccountId} and region ${region}`,
  )

  // Get the credentials or provider
  // This could be either a function (from fromNodeProviderChain) or an object (from dashboard/config)
  const credentialsOrProvider = awsResolver.credentials

  // Return wrapped provider that enhances credentials with accountId and region
  // SDK clients can use resolveCredentials directly - they'll ignore extra properties
  return {
    region,
    resolveCredentials: async () => {
      // Check if it's a function (fromNodeProviderChain) or an object (dashboard/config credentials)
      // Provider functions from credentials.js have error handling built-in
      const awsCredentials =
        typeof credentialsOrProvider === 'function'
          ? await credentialsOrProvider()
          : credentialsOrProvider

      return {
        ...awsCredentials, // { accessKeyId, secretAccessKey, sessionToken, expiration }
        accountId: awsAccountId, // Enhanced
        region, // Enhanced
      }
    },
  }
}

/**
 * Get AWS Credential Resolver
 * Returns the existing credential resolver if initialized,
 * or creates and initializes a new instance with the provided parameters.
 *
 * @param [logger]
 * @param [providerProfile]
 * @param [accessKeyId]
 * @param [secretAccessKey]
 * @param [sessionToken]
 * @param resolversManager
 * @param ignoreCache
 * @returns {Promise<Aws>}
 */
const getAwsCredentialResolver = async ({
  logger,
  providerProfile,
  accessKeyId,
  secretAccessKey,
  sessionToken,
  resolversManager,
  ignoreCache = false,
}) => {
  // If credential resolver is already initialized, return it
  if (
    resolversManager?.resolverProviders[resolversManager.credentialResolverName]
  ) {
    return resolversManager.resolverProviders[
      resolversManager.credentialResolverName
    ].instance
  }
  // Otherwise, initialize the resolver
  const Aws = providerRegistry.get('aws')
  const dashboard = {}
  if (accessKeyId && secretAccessKey) {
    dashboard.aws = {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    }
  }
  return new Aws({
    logger: logger || log.get('core:utils:credentials:aws'),
    providerConfig: { profile: providerProfile, ignoreCache },
    dashboard,
  })
}

export { getAwsCredentialProvider }
