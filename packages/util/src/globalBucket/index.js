import { AwsSsmClient } from '@serverless/engine/src/lib/aws/ssm.js'
import { AwsS3Client } from '@serverless/engine/src/lib/aws/s3.js'
import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
} from '@aws-sdk/client-s3'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

/**
 * @typedef {Object} DefaultBucketParams
 * @property {string} ssmParameterName - The SSM parameter name to store the bucket name and region.
 * @property {string} s3BucketName - The base name for the S3 bucket. A UUID will be appended to this name.
 * @property {Object} credentials - AWS credentials.
 * @property {string} region - The AWS region.
 * @property {Object} logger - Logger object.
 */

/**
 * Gets or creates the account-wide default bucket.
 *
 * @param {DefaultBucketParams} params - The parameters for getting or creating the default bucket.
 * @returns {Promise<Object>} - The bucket name and region.
 */
export const getOrCreateDefaultBucket = async ({
  ssmParameterName,
  s3BucketName,
  credentials,
  region = 'us-east-1',
  logger,
}) => {
  logger.debug(`Checking if ${ssmParameterName} exists in SSM`)
  const ssmService = new AwsSsmClient({
    credentials,
    region,
  })

  const storedBucket = await checkStoredBucket({
    ssmService,
    ssmParameterName,
    credentials,
    logger,
  })

  if (storedBucket) {
    return storedBucket
  }

  return await createAndStoreBucket({
    ssmService,
    s3BucketName,
    ssmParameterName,
    credentials,
    region,
    logger,
  })
}

/**
 * Checks if the bucket is already stored in SSM and returns it if found.
 *
 * @param {Object} params - The parameters for checking the stored bucket.
 * @param {AwsSsmClient} params.ssmService - The SSM service instance.
 * @param {string} params.ssmParameterName - The SSM parameter name.
 * @param {Object} params.credentials - AWS credentials.
 * @param {Object} params.logger - Logger object.
 * @returns {Promise<Object|null>} - The stored bucket information or null if not found.
 */
const checkStoredBucket = async ({
  ssmService,
  ssmParameterName,
  credentials,
  logger,
}) => {
  const storedBucketName = await (async () => {
    try {
      return await ssmService.getSsmParameter({
        paramName: ssmParameterName,
      })
    } catch (err) {
      throw new ServerlessError(
        `An error occurred while fetching the SSM parameter "${ssmParameterName}": ${err.message}`,
        ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_GET_SSM_PARAMETER_FAILED,
        { originalMessage: err.message, originalName: err.name },
      )
    }
  })()
  const parsedBucket = JSON.parse(storedBucketName)
  if (parsedBucket && parsedBucket.bucketName && parsedBucket.bucketRegion) {
    logger.debug(
      `SSM param found: ${parsedBucket.bucketName} in region ${parsedBucket.bucketRegion}`,
    )
    const s3Service = new AwsS3Client({
      credentials,
      region: parsedBucket.bucketRegion,
    })
    try {
      await s3Service.createVersionedBucket({
        bucketName: parsedBucket.bucketName,
      })
      logger.debug(`Bucket ${parsedBucket.bucketName} created`)
    } catch (err) {
      const name = err.name
      if (
        err instanceof BucketAlreadyOwnedByYou ||
        err instanceof BucketAlreadyExists ||
        name === 'BucketAlreadyOwnedByYou' ||
        name === 'BucketAlreadyExists' ||
        err.message.includes(
          'A conflicting conditional operation is currently in progress against this resource',
        )
      ) {
        logger.debug(
          `Bucket ${parsedBucket.bucketName} already exists. Skipping creation.`,
        )
      } else {
        throw err
      }
    }
    return {
      bucketName: parsedBucket.bucketName,
      bucketRegion: parsedBucket.bucketRegion,
    }
  }
  return null
}

/**
 * Creates a new bucket and stores its information in SSM.
 *
 * @param {Object} params - The parameters for creating and storing the bucket.
 * @param {AwsSsmClient} params.ssmService - The SSM service instance.
 * @param {string} params.s3BucketName - The base name for the S3 bucket.
 * @param {Object} params.credentials - AWS credentials.
 * @param {string} params.region - The AWS region.
 * @param {Object} params.logger - Logger object.
 * @returns {Promise<Object>} - The created bucket information.
 */
const createAndStoreBucket = async ({
  ssmService,
  s3BucketName,
  ssmParameterName,
  credentials,
  region,
  logger,
}) => {
  const s3Service = new AwsS3Client({
    credentials,
    region,
  })
  const paramValue = {
    bucketName: s3BucketName,
    bucketRegion: region,
  }
  logger.debug(`Storing bucket name and region in SSM: ${paramValue}`)
  await ssmService.storeSSMParameter({
    paramName: ssmParameterName,
    paramValue: JSON.stringify(paramValue),
  })
  logger.debug(`Creating bucket: ${s3BucketName}`)
  await s3Service.createVersionedBucket({
    bucketName: s3BucketName,
  })
  logger.debug(`Bucket created: ${s3BucketName} in region ${region}`)
  return { bucketName: s3BucketName, bucketRegion: region }
}

export { getOrCreateGlobalDeploymentBucket } from './deployment.js'
