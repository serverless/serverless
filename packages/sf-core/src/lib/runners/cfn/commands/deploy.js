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

const logger = log.get('core:cfn')

/**
 * Deploys a SAM/CloudFormation stack to AWS
 *
 * If the stack does not exist, it will be created first with a deployment s3 bucket
 * then updated with the user's template.
 *
 * If the stack already exists, it will simply be updated with the user's template.
 *
 * The user can provide a custom bucket name to use for the deployment bucket.
 * @param {Object} params
 * @param {Function} params.credentials - AWS credentials.
 * @param {string} params.templateFile - SAM/CloudFormation template file.
 * @param {string} params.samConfigFile - SAM configuration file.
 * @param {string} params.servicePath - Path to the service.
 * @param {string} params.composeServiceName - Name of the service in a serverless-compose.yml file.
 * @param {Function} params.options - CLI options.
 */
export default async function ({
  options,
  credentials,
  templateFile,
  samConfigFile,
  servicePath,
  composeServiceName,
}) {
  const mainProgress = progress.get('main')

  mainProgress.notice('Retrieving AWS Cloudformation stack')

  const userTemplate = templateFile
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
    `Deploying "${cfnConfig.stackName}" to stage "${cfnConfig.stage}" ${style.aside(`(${cfnConfig.region})`)}`,
  )

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

  mainProgress.notice('Uploading')

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

  const functionsWithUrls = await bucket.uploadFunctions({
    servicePath,
    templateFile,
  })

  const stack = new Stack({
    credentials,
    region: cfnConfig.region,
    name: cfnConfig.stackName,
    parameters: cfnConfig.parameters,
    onStatusUpdate: (status) => {},
    onFailedEvent: (event) => {
      const error = new ServerlessError(
        event.ResourceStatusReason || 'Failed to deploy stack',
        ServerlessErrorCodes.sam.DEPLOY_FAILED,
      )
      throw error
    },
  })

  await stack.get()

  if (!stack.status) {
    mainProgress.notice('Creating AWS Cloudformation stack')
    await stack.create(userTemplate, functionsWithUrls)
  } else {
    mainProgress.notice('Updating AWS Cloudformation stack')
    await stack.update(userTemplate, functionsWithUrls)
  }

  if (stack.isUpToDate) {
    logger.aside(`No changes to deploy. Deployment skipped.`)
  }

  if (
    stack.status === 'CREATE_COMPLETE' ||
    stack.status === 'UPDATE_COMPLETE'
  ) {
    logger.success(`Service "${cfnConfig.stackName}" deployed successfully`)

    const hasOutputs = stack.outputs && Object.keys(stack.outputs).length > 0

    if (hasOutputs) {
      logger.write(style.aside(`Outputs:`))
      for (const key in stack.outputs) {
        logger.write(`  ${style.aside(key)}: ${stack.outputs[key]}`)
      }
      logger.write(' ')
    }
  }

  return {
    id: stack.id,
    outputs: stack.outputs || {},
  }
}
