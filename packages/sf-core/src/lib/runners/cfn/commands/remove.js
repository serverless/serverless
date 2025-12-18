import Stack from '../aws/Stack.js'
import Bucket from '../aws/Bucket.js'
import { getCfnConfig } from '../utils.js'
import {
  ServerlessError,
  ServerlessErrorCodes,
  getOrCreateGlobalDeploymentBucket,
  log,
  progress,
  style,
} from '@serverless/util'

const logger = log.get('sls:dev')

/**
 * Removes a SAM/CloudFormation stack from AWS.
 *
 * It first empties the deployment bucket, then deletes the stack.
 * If the stack or bucket do not exist, it will throw an error.
 *
 * @param {Object} params
 * @param {Function} params.credentials - AWS credentials.
 * @param {Object} params.samConfigFile - SAM configuration file.
 * @param {Function} params.options - CLI options.
 * @param {Function} params.composeServiceName - Name of the service in a serverless-compose.yml file.
 */
export default async function ({
  credentials,
  samConfigFile,
  options,
  composeServiceName,
}) {
  const mainProgress = progress.get('main')
  mainProgress.notice('Retrieving AWS Cloudformation stack')

  const cfnConfig = getCfnConfig({
    options,
    samConfigFile,
    composeServiceName,
  })

  const { bucketName: globalDeploymentBucketName } =
    await getOrCreateGlobalDeploymentBucket({
      credentials,
      region: cfnConfig.region,
      logger,
    })

  logger.notice(
    `Removing "${cfnConfig.stackName}" from stage "${cfnConfig.stage}" ${style.aside(`(${cfnConfig.region})`)}`,
  )

  const stack = new Stack({
    credentials,
    region: cfnConfig.region,
    name: cfnConfig.stackName,
    parameters: cfnConfig.parameters,
    onStatusUpdate: (status) => {},
    onFailedEvent: (event) => {
      logger.error(`${event.ResourceStatusReason}`)
    },
  })

  await stack.get()

  if (!stack.status) {
    logger.success(`Service ${cfnConfig.stackName} Removed Successfully`)
    return {
      id: stack.id,
    }
  }

  let bucketName = cfnConfig.bucket || globalDeploymentBucketName

  if (!bucketName) {
    /**
     * This is unlikely to happen in existing SAM projects as they usually have a bucket name
     * set in samconfig.toml, but it could still happen if the stack already exists (so we didn't create the base bucket)
     * and the user did not specify the bucket name either via CLI options or the samconfig.toml file.
     */
    throw new ServerlessError(
      'Please specify a deployment bucket name using the --bucket option, or persist it in the samconfig.toml file.',
      ServerlessErrorCodes.sam.MISSING_DEPLOYMENT_BUCKET,
    )
  }

  mainProgress.notice('Removing objects from S3 bucket')

  const bucket = new Bucket({
    name: bucketName,
    stackName: cfnConfig.stackName,
    credentials,
    region: cfnConfig.region,
  })

  if (!(await bucket.exists())) {
    /**
     * This could happen if the user specified a bucket name in samconfig.toml
     * but it doesn't actually exist. Rare for existing SAM projects, but still possible.
     */
    throw new ServerlessError(
      `Bucket ${bucketName} does not exist`,
      ServerlessErrorCodes.sam.BUCKET_NOT_FOUND,
    )
  }

  mainProgress.notice('Removing AWS CloudFormation stack')

  await stack.delete()

  logger.success(`Service ${cfnConfig.stackName} Removed Successfully`)

  return {
    id: stack.id,
  }
}
