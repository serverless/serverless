import { v4 as uuidv4 } from 'uuid'
import { NoSuchBucket } from '@aws-sdk/client-s3'
import { AwsS3Client } from '@serverless/engine/src/lib/aws/s3.js'
import {
  log,
  ServerlessError,
  ServerlessErrorCodes,
  getOrCreateDefaultBucket,
} from '@serverless/util'

const SSM_PARAMETER_NAME = '/serverless-framework/state/s3-bucket'
const S3_BUCKET_NAME_PREFIX = 'serverless-framework-state'

/**
 * @typedef {Object} ResolveStateStoreParams
 * @property {Object} service - Service configuration.
 * @property {Function} credentialProvider - Credentials provider.
 * @property {string} deploymentRegion - Deployment region.
 * @property {Object} resolverManager - Resolver manager.
 */

/**
 * @typedef {Object} GetServiceStateParams
 * @property {string} serviceUniqueId - A unique identifier for the service.
 * @property {string} runnerType - The runner type associated with the service.
 */

/**
 * @typedef {Object} PutServiceStateParams
 * @property {string} serviceUniqueId - A unique identifier for the service.
 * @property {string} runnerType - The runner type associated with the service.
 * @property {Object} value - The state value to store in the state store.
 */

/**
 * @typedef {Function} GetServiceState
 * @param {GetServiceStateParams} params - The parameters for fetching the service state.
 * @returns {Promise<Object|null>} A promise that resolves to the service state object, or `null` if no state is found.
 * @throws {Error} Throws an error if `serviceUniqueId` or `runnerType` is missing.
 */

/**
 * @typedef {Function} PutServiceState
 * @param {PutServiceStateParams} params - The parameters for storing the service state.
 * @returns {Promise<void>} A promise that resolves when the state is successfully stored.
 * @throws {Error} Throws an error if `serviceUniqueId` or `runnerType` is missing.
 * @throws {Error} Re-throws any storage error except for those involving empty values and missing buckets.
 */

/**
 * @typedef {Object} StateStoreFunctions
 * @property {GetServiceState} getServiceState - Fetches the service state from the state store.
 * @property {PutServiceState} putServiceState - Stores the service state in the state store.
 */

/**
 * Resolves the state store for a service, providing functions to get and put service states.
 *
 * @param {ResolveStateStoreParams} params - The parameters for resolving the state store.
 * @returns {Promise<StateStoreFunctions>} A promise that resolves to an object containing state store functions.
 */
export const resolveStateStore = async ({
  service,
  credentialProvider,
  deploymentRegion,
  resolverManager,
}) => {
  const logger = log.get('core:compose:state')
  const credentials = await credentialProvider()
  const { provider, resolverConfig } = await getOrCreateStateStore({
    service,
    credentials,
    deploymentRegion,
    resolverManager,
    logger,
  })
  return {
    getServiceState: async ({ serviceUniqueId, runnerType }) => {
      if (!serviceUniqueId) {
        throw new Error('Cannot fetch state without a Service Unique ID')
      }
      if (!runnerType) {
        throw new Error('Cannot fetch state without a runner type')
      }
      const encodedServiceUniqueId = encode(serviceUniqueId)
      const stateString = await provider.instance.resolveVariable({
        resolverType: resolverConfig.type,
        resolutionDetails: resolverConfig,
        key: `services/${runnerType}/${encodedServiceUniqueId}/state/state.json`,
      })
      if (!stateString) {
        return null
      }
      return JSON.parse(stateString)
    },
    putServiceState: async ({ serviceUniqueId, runnerType, value }) => {
      if (!serviceUniqueId) {
        throw new Error('Cannot store state without a Service Unique ID')
      }
      if (!runnerType) {
        throw new Error('Cannot store state without a runner type')
      }
      const encodedServiceUniqueId = encode(serviceUniqueId)

      try {
        await provider.instance.storeData(
          resolverConfig.type,
          resolverConfig,
          `services/${runnerType}/${encodedServiceUniqueId}/state/state.json`,
          value,
        )
      } catch (err) {
        const name = err.name
        if (
          value === '{}' &&
          (err instanceof NoSuchBucket || name === 'NoSuchBucket')
        ) {
          logger.debug(
            `Ignoring error: "${err.message}" when trying to remove state for service ${serviceUniqueId}`,
          )
        } else {
          throw err
        }
      }
    },
  }
}

/**
 * Encodes the service unique ID.
 *
 * @param {string} serviceUniqueId - The service unique ID.
 * @returns {string} - The encoded service unique ID.
 */
const encode = (serviceUniqueId) => {
  return serviceUniqueId.replace(/\//g, '_')
}

/**
 * Gets the state resolver name.
 *
 * @param {Object} service - The service configuration.
 * @returns {string} - The state resolver name.
 */
export const getStateResolverName = ({ service }) => {
  if (typeof service?.state === 'string') {
    return service.state
  }
  if (service?.state?.resolver) {
    return service.state.resolver
  }
}

/**
 * @typedef {Object} CheckS3BucketParams
 * @property {string} bucketName - The name of the S3 bucket.
 * @property {AwsS3Client} s3Service - S3 service.
 * @property {Object} logger - Logger object.
 */

/**
 * Checks if the existing S3 state bucket is versioned.
 *
 * @param {CheckS3BucketParams} params - The parameters for checking the S3 state bucket.
 * @returns {Promise<string>} - The bucket name.
 */
const checkExistingS3StateBucket = async ({
  bucketName,
  s3Service,
  logger,
}) => {
  if (!bucketName) {
    throw new Error('Bucket name not provided for S3 state resolver')
  }
  logger.debug(`Checking if bucket "${bucketName}" is versioned`)
  const versioningEnabled = await (async () => {
    try {
      return await s3Service.checkBucketVersioning({
        bucketName,
      })
    } catch (err) {
      throw new ServerlessError(
        `An error occurred while checking versioning for bucket "${bucketName}": ${err.message}`,
        ServerlessErrorCodes.state.STATE_VERSIONING_CHECK_FAILED,
      )
    }
  })()
  if (!versioningEnabled) {
    throw new Error(
      `State bucket "${bucketName}" is not versioned. Please enable versioning for the bucket if you want to use it as a state store.`,
    )
  }
  return bucketName
}

/**
 * @typedef {Object} StateStoreParams
 * @property {Object} service - Service configuration.
 * @property {Object} credentials - AWS credentials.
 * @property {string} deploymentRegion - Deployment region.
 * @property {Object} resolverManager - Resolver manager.
 * @property {Object} logger - Logger object.
 */

/**
 * Gets or creates the state store.
 *
 * @param {StateStoreParams} params - The parameters for getting or creating the state store.
 * @returns {Promise<Object>} - The provider and resolver configuration.
 */
const getOrCreateStateStore = async ({
  service,
  credentials,
  deploymentRegion,
  resolverManager,
  logger,
}) => {
  const stateResolverName = getStateResolverName({ service })
  if (!stateResolverName) {
    const { bucketName, bucketRegion } = await (async () => {
      const s3BucketName = `${S3_BUCKET_NAME_PREFIX}-${uuidv4()}`
      try {
        return await getOrCreateDefaultBucket({
          ssmParameterName: SSM_PARAMETER_NAME,
          s3BucketName,
          credentials,
          region: deploymentRegion,
          logger,
        })
      } catch (err) {
        if (
          err.name === 'AccessDeniedException' ||
          err.name === 'AccessDenied' ||
          err?.originalName === 'AccessDeniedException' ||
          err?.originalName === 'AccessDenied'
        ) {
          const customErr = new ServerlessError(
            `Access denied when accessing ${SSM_PARAMETER_NAME} SSM parameter and ${s3BucketName} S3 bucket. Please check your permissions and try again. ` +
              `You have the following options:\n` +
              `• Ensure you have permission to create SSM and S3 resources.\n` +
              `• Use the "state" field to specify an existing S3 bucket.\n` +
              `• Manually create the S3 bucket and SSM parameter.\n\n` +
              'For more details, please refer to the documentation: https://slss.io/compose-state\n\n' +
              `Original error: ${err.message}`,
            ServerlessErrorCodes.compose.COMPOSE_STATE_INSUFFICIENT_PERMISSIONS,
          )
          customErr.stack = undefined
          throw customErr
        }
        throw err
      }
    })()
    logger.debug(
      `Using default state resolver: ${bucketName} in ${bucketRegion}`,
    )
    return resolverManager.addStateResolver({ bucketName, bucketRegion })
  }
  logger.debug(`Using state resolver: ${stateResolverName}`)
  const resolverProviders = resolverManager.getResolverProviders()
  const resolverProvider = Object.values(resolverProviders).find(
    (provider) => provider.resolvers[stateResolverName],
  )
  switch (resolverProvider.instance.config[stateResolverName].type) {
    case 's3': {
      const s3Service = new AwsS3Client({
        credentials,
        region:
          resolverProvider.instance.config[stateResolverName].region ||
          'us-east-1',
      })
      await checkExistingS3StateBucket({
        bucketName:
          resolverProvider.instance.config[stateResolverName].bucketName,
        s3Service,
        resolverProvider,
        stateResolverName,
        logger,
      })
      return {
        provider: resolverProvider,
        resolverConfig: resolverProvider.instance.config[stateResolverName],
      }
    }
  }
  throw new Error(
    `Unsupported state resolver type: ${resolverProvider.instance.config[stateResolverName].type}`,
  )
}
