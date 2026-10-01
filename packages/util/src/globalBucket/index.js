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
 * Reads the bucket name and region stored in SSM.
 *
 * @param {Object} params - The parameters for reading the stored bucket.
 * @param {AwsSsmClient} params.ssmService - The SSM service instance.
 * @param {string} params.ssmParameterName - The SSM parameter name.
 * @returns {Promise<Object|null>} - The stored bucket name and region, or null if not stored.
 */
const readStoredBucket = async ({ ssmService, ssmParameterName }) => {
  const storedBucketName = await (async () => {
    try {
      return await ssmService.getSsmParameter({
        paramName: ssmParameterName,
      })
    } catch (err) {
      throw new ServerlessError(
        `An error occurred while fetching the SSM parameter "${ssmParameterName}": ${err.message}`,
        ServerlessErrorCodes.globalBucket
          .GLOBAL_BUCKET_GET_SSM_PARAMETER_FAILED,
        { originalMessage: err.message, originalName: err.name },
      )
    }
  })()
  const parsedBucket = JSON.parse(storedBucketName)
  if (parsedBucket && parsedBucket.bucketName && parsedBucket.bucketRegion) {
    return parsedBucket
  }
  return null
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
  const parsedBucket = await readStoredBucket({ ssmService, ssmParameterName })
  if (parsedBucket) {
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
      // The conflicting-operation error is routine here: deploys that run at the same time
      // get it on CreateBucket even when the bucket has existed for a long time, so it
      // does not mean the bucket is still being created.
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

// Errors from the create-only PutParameter that mean another process is writing (or has
// written) the same parameter. TooManyUpdates is never retried by the SDK, and a burst of
// writers can all end in ThrottlingException with nothing written, so all three re-read.
const CLAIM_LOST_ERRORS = [
  'ParameterAlreadyExists',
  'TooManyUpdates',
  'ThrottlingException',
]
const MAX_CLAIM_ATTEMPTS = 5
const CLAIM_BACKOFF_BASE_MS = 250
const BUCKET_WAIT_TIMEOUT_MS = 60000
const BUCKET_WAIT_FIRST_DELAY_MS = 500
const BUCKET_WAIT_MAX_DELAY_MS = 5000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isNamed = (err, names) =>
  names.includes(err?.name) || names.includes(err?.originalName)

/**
 * Whether an S3 error means another request is changing the same bucket right now.
 */
const isOperationAborted = (err) =>
  isNamed(err, ['OperationAborted']) ||
  Boolean(
    err?.message?.includes(
      'A conflicting conditional operation is currently in progress against this resource',
    ),
  )

/**
 * Whether a CreateBucket error means another request is creating, or has just created,
 * the same bucket in this account.
 */
const isContendedCreate = (err) =>
  err instanceof BucketAlreadyOwnedByYou ||
  isNamed(err, ['BucketAlreadyOwnedByYou']) ||
  isOperationAborted(err)

/**
 * Creates a new bucket and stores its information in SSM.
 *
 * The SSM parameter is claimed with a create-only write, so when several processes
 * bootstrap the same region at once exactly one of them creates the bucket. The processes
 * whose write loses read the parameter again and wait for the winner's bucket without
 * creating it. A process that starts later and finds the parameter on its first read
 * takes the checkStoredBucket path instead, and its CreateBucket can still overlap the
 * winner's; the winner treats that as contention and waits.
 *
 * @param {Object} params - The parameters for creating and storing the bucket.
 * @param {AwsSsmClient} params.ssmService - The SSM service instance.
 * @param {string} params.s3BucketName - The base name for the S3 bucket.
 * @param {string} params.ssmParameterName - The SSM parameter name.
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
  const paramValue = {
    bucketName: s3BucketName,
    bucketRegion: region,
  }
  for (let attempt = 1; ; attempt++) {
    logger.debug(
      `Storing bucket name and region in SSM: ${JSON.stringify(paramValue)}`,
    )
    let claimError
    try {
      await ssmService.storeSSMParameter({
        paramName: ssmParameterName,
        paramValue: JSON.stringify(paramValue),
      })
    } catch (err) {
      if (!isNamed(err, CLAIM_LOST_ERRORS)) {
        throw err
      }
      claimError = err
    }
    if (!claimError) {
      return await createOwnBucket({
        s3BucketName,
        ssmParameterName,
        credentials,
        region,
        logger,
      })
    }

    logger.debug(
      `Could not store ${ssmParameterName} (${claimError.name}), reading it again`,
    )
    const storedBucket = await (async () => {
      try {
        return await readStoredBucket({ ssmService, ssmParameterName })
      } catch (err) {
        if (isNamed(err, ['ThrottlingException'])) {
          return null
        }
        throw err
      }
    })()

    if (storedBucket && storedBucket.bucketName === s3BucketName) {
      // Our own write landed and an SDK retry of it reported the conflict
      return await createOwnBucket({
        s3BucketName,
        ssmParameterName,
        credentials,
        region,
        logger,
      })
    }
    if (storedBucket) {
      logger.debug(
        `Another process stored ${ssmParameterName}: ${storedBucket.bucketName} in region ${storedBucket.bucketRegion}`,
      )
      await waitForBucket({
        s3Service: new AwsS3Client({
          credentials,
          region: storedBucket.bucketRegion,
        }),
        bucketName: storedBucket.bucketName,
        ssmParameterName,
        logger,
        requireVersioning: true,
      })
      return {
        bucketName: storedBucket.bucketName,
        bucketRegion: storedBucket.bucketRegion,
      }
    }
    if (attempt >= MAX_CLAIM_ATTEMPTS) {
      throw claimError
    }
    // Exponential backoff with equal jitter, so racing processes spread out
    const base = CLAIM_BACKOFF_BASE_MS * 2 ** (attempt - 1)
    await sleep(base / 2 + (Math.random() * base) / 2)
  }
}

/**
 * Creates the bucket this process registered in SSM and enables versioning on it.
 *
 * Uncontended, this makes the same two calls as before. If another request is creating
 * the bucket or changing its versioning at the same moment, it waits until the bucket
 * exists with versioning enabled instead of failing.
 *
 * @param {Object} params - The parameters for creating the bucket.
 * @param {string} params.s3BucketName - The name of the S3 bucket.
 * @param {string} params.ssmParameterName - The SSM parameter name.
 * @param {Object} params.credentials - AWS credentials.
 * @param {string} params.region - The AWS region.
 * @param {Object} params.logger - Logger object.
 * @returns {Promise<Object>} - The created bucket information.
 */
const createOwnBucket = async ({
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
  const wait = { s3Service, bucketName: s3BucketName, ssmParameterName, logger }
  let deadline
  logger.debug(`Creating bucket: ${s3BucketName}`)
  try {
    await s3Service.createBucket({ bucketName: s3BucketName })
  } catch (err) {
    if (!isContendedCreate(err)) {
      throw err
    }
    logger.debug(
      `Bucket ${s3BucketName} is being created by another request (${err.name}), waiting for it`,
    )
    deadline = Date.now() + BUCKET_WAIT_TIMEOUT_MS
    await waitForBucket({ ...wait, deadline, requireVersioning: false })
  }
  try {
    await s3Service.enableBucketVersioning({ bucketName: s3BucketName })
  } catch (err) {
    if (!isOperationAborted(err)) {
      throw err
    }
    logger.debug(
      `Versioning of bucket ${s3BucketName} is being changed by another request, waiting for it`,
    )
    deadline ??= Date.now() + BUCKET_WAIT_TIMEOUT_MS
  }
  if (deadline) {
    await waitForBucket({ ...wait, deadline, requireVersioning: true })
  }
  logger.debug(`Bucket created: ${s3BucketName} in region ${region}`)
  return { bucketName: s3BucketName, bucketRegion: region }
}

/**
 * Waits until a bucket that is being set up can be used: it exists and, when required,
 * has versioning enabled.
 *
 * Polls GetBucketVersioning, which answers as soon as the bucket exists. HeadBucket on a
 * connection that asked before the bucket existed can keep answering 404 for about 25
 * seconds after it is created.
 *
 * @param {Object} params - The parameters for waiting.
 * @param {AwsS3Client} params.s3Service - An S3 service for the bucket's region.
 * @param {string} params.bucketName - The name of the S3 bucket.
 * @param {string} params.ssmParameterName - The SSM parameter that names the bucket.
 * @param {Object} params.logger - Logger object.
 * @param {boolean} params.requireVersioning - Whether to wait for versioning to be enabled.
 * @param {number} [params.deadline] - Time (ms since epoch) after which to give up.
 * @returns {Promise<void>}
 */
const waitForBucket = async ({
  s3Service,
  bucketName,
  ssmParameterName,
  logger,
  requireVersioning,
  deadline = Date.now() + BUCKET_WAIT_TIMEOUT_MS,
}) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const status = await s3Service.fetchBucketVersioningStatus({
        bucketName,
      })
      if (!requireVersioning || status === 'Enabled') {
        logger.debug(`Bucket ${bucketName} is available`)
        return
      }
      logger.debug(
        `Bucket ${bucketName} exists but versioning is not enabled yet, checking again`,
      )
    } catch (err) {
      if (isNamed(err, ['AccessDenied'])) {
        throw new ServerlessError(
          `Access denied when checking the S3 bucket "${bucketName}" named in the SSM parameter "${ssmParameterName}". ` +
            `The credentials need the "s3:GetBucketVersioning" permission on this bucket.\n\n` +
            `Original error: ${err.message}`,
          ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_ACCESS_DENIED,
          { originalMessage: err.message, stack: false },
        )
      }
      if (!isNamed(err, ['NoSuchBucket'])) {
        throw err
      }
      logger.debug(`Bucket ${bucketName} does not exist yet, checking again`)
    }
    const delay = Math.min(
      BUCKET_WAIT_FIRST_DELAY_MS * 2 ** (attempt - 1),
      BUCKET_WAIT_MAX_DELAY_MS,
    )
    if (Date.now() + delay > deadline) {
      throw new ServerlessError(
        `The S3 bucket "${bucketName}" named in the SSM parameter "${ssmParameterName}" was not ready within ${BUCKET_WAIT_TIMEOUT_MS / 1000} seconds. ` +
          `This can happen when another deployment that was setting up the bucket stopped before finishing. ` +
          `Run the command again.`,
        ServerlessErrorCodes.globalBucket.GLOBAL_BUCKET_NOT_AVAILABLE,
        { stack: false },
      )
    }
    await sleep(delay)
  }
}

export { getOrCreateGlobalDeploymentBucket } from './deployment.js'
