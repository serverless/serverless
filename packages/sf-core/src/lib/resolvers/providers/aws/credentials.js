import { fromNodeProviderChain } from '@aws-sdk/credential-providers'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import {
  describeMissingAwsCredentials,
  isExpiredSsoSession,
} from './credential-source.js'

/**
 * Retrieves AWS credentials.
 *
 * @param {Object} logger - The logger object.
 * @param {Object} dashboard - The dashboard object containing AWS credentials.
 * @param {Object} config - The configuration object for the AWS provider.
 * @param {boolean} isDefaultConfig - Whether the configuration is the default configuration.
 * @param {string} [resolverName] - The aws resolver in serverless.yml this configuration comes from, if any.
 * @param {Object} [env] - The environment the AWS SDK reads.
 * @returns {Promise} A promise that resolves to the AWS credentials.
 */
export const getAwsCredentials = async ({
  logger,
  dashboard,
  config,
  isDefaultConfig,
  resolverName,
  env = process.env,
}) => {
  // If the Dashboard Provider is available and
  // it's not explicitly disabled in the resolver configuration and
  // the configuration is empty or only contains the type key,
  // use the Dashboard Provider
  if (
    dashboard?.aws &&
    (config?.dashboard === undefined || config?.dashboard !== false)
  ) {
    return dashboard.aws
  }
  if (config?.accessKeyId && config?.secretAccessKey) {
    return {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    }
  } else if (config?.accessKeyId || config?.secretAccessKey) {
    throw new Error(
      'If you provide an access key ID or secret access key, ' +
        'you must provide both.',
    )
  }

  logger.debug(`Using AWS profile: ${config?.profile ?? 'default'}`)
  const baseProvider = fromNodeProviderChain({
    profile: config?.profile,
    ignoreCache: config?.ignoreCache === true,
    mfaCodeProvider: async (mfaSerial) => {
      return await logger.input({
        message: `Enter MFA code for ${mfaSerial}`,
        inputType: 'password',
      })
    },
  })

  // Wrap the provider with error handling to provide user-friendly error messages
  return async (options) => {
    try {
      return await baseProvider(options)
    } catch (error) {
      // If AWS Credentials are missing, throw a more helpful error message
      if (
        error.name === 'CredentialsProviderError' ||
        error.message?.includes('Could not load credentials from any providers')
      ) {
        // Name what the command looked for -- the resolver's or the
        // command's profile, else AWS_PROFILE -- and how to set it up.
        const { problem, fix } = describeMissingAwsCredentials({
          profile: config?.profile || env.AWS_PROFILE,
          resolver: resolverName,
          ssoExpired: isExpiredSsoSession(error.message),
        })
        const errorMessage = `AWS credentials missing or invalid: ${problem}. To fix it, ${fix}.${isDefaultConfig ? ' Learn more: https://slss.io/aws-creds-setup.' : ''} Original error from AWS: ${error.message}`
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
      throw error
    }
  }
}
