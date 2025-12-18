import { log, progress } from '@serverless/util'
import { AwsVpcClient } from '../../aws/vpc.js'
import { AwsAlbClient } from '../../aws/alb.js'
import { AwsEcsClient } from '../../aws/ecs.js'
import { AwsIamClient } from '../../aws/iam.js'
import { AwsLambdaClient } from '../../aws/lambda.js'
import { AwsRoute53Client } from '../../aws/route53.js'
import { AwsCloudFrontClient } from '../../aws/cloudfront.js'

const logger = log.get('containers-library:deployer:aws:remove')
const sclProgress = progress.get('main')

/**
 * Removes a container and its associated resources
 * @param {Object} params - Parameters for container removal
 * @param {Object} params.state - Project state manager
 * @param {string} params.containerName - Name of the container to remove
 * @param {boolean} [params.all=false] - Remove all resources including shared ones
 * @returns {Promise<void>}
 */
export const removeContainer = async ({
  state,
  containerName,
  provider,
  resourceNameBase,
  all = false,
}) => {
  sclProgress.notice(`${containerName}: Removing container`)

  const awsAlbClient = new AwsAlbClient(provider.aws)
  const awsEcsClient = new AwsEcsClient(provider.aws)
  const awsIamClient = new AwsIamClient(provider.aws)
  const awsLambdaClient = new AwsLambdaClient(provider.aws)
  const awsRoute53Client = new AwsRoute53Client(provider.aws)
  const awsCloudFrontClient = new AwsCloudFrontClient(provider.aws)

  const containerState = state.state.containers?.[containerName]
  const namespace = state.state.namespace

  if (!containerState) {
    logger.warning(`${containerName}: Container not found in state, skipping`)
    return
  }

  if (containerState?.routing?.awsCloudFront?.distributionId) {
    try {
      sclProgress.update(`${containerName}: Removing CloudFront distribution`)
      await awsCloudFrontClient.deleteDistribution(
        containerState.routing.awsCloudFront.distributionId,
      )
      sclProgress.notice(`${containerName}: CloudFront distribution removed`)
    } catch (error) {
      logger.debug(
        `${containerName}: Failed to remove CloudFront distribution`,
        error,
      )
    }
  }

  if (containerState?.compute?.awsFargateEcs) {
    sclProgress.update(`${containerName}: Removing AWS Fargate ECS resources`)
    await awsEcsClient.removeFargateService({
      resourceNameBase,
      serviceName: containerName,
    })
    logger.debug(`${containerName}: AWS Fargate ECS Service Removed`)
  }

  if (containerState?.compute?.awsLambda) {
    sclProgress.update(`${containerName}: Removing AWS Lambda resources`)
    await awsLambdaClient.removeFunction({
      resourceNameBase,
      functionName: containerName,
    })
    logger.debug(`${containerName}: AWS Lambda Function Removed`)
  }

  if (containerState?.routing?.awsAlb?.targetGroupArnAwsFargateEcs) {
    sclProgress.update(`${containerName}: Removing ALB Target Group`)
    try {
      await awsAlbClient.deleteTargetGroup({
        resourceNameBase,
        serviceName: containerName,
        type: 'ip',
      })
      logger.debug(`${containerName}: ALB Target Group Removed`)
    } catch (error) {
      logger.debug(`${containerName}: Failed to remove ALB Target Group`, error)
    }
  }

  sclProgress.update(`${containerName}: Removing IAM Role`)
  await awsIamClient.removeRole({
    resourceNameBase,
    serviceName: containerName,
  })
  logger.debug(`${containerName}: AWS IAM Role Removed`)

  if (all) {
    const alb = await awsAlbClient.getAlbIfExists(resourceNameBase)
    if (alb) {
      sclProgress.update(`Removing ALB`)
      await awsAlbClient.deleteAlb(resourceNameBase)
      logger.debug(`ALB Removed`)
    }

    sclProgress.update(`Removing VPC`)
    await new AwsVpcClient(provider.aws).deleteVpc(resourceNameBase)
    logger.debug(`VPC Removed`)
  }

  delete state.state.containers[containerName]
  await state.save()

  sclProgress.notice(`${containerName}: Container removed`)
}

/**
 * Removes deployed resources based on provider configuration
 * @param {Object} params - Removal parameters
 * @param {Object} params.state - Project state manager
 * @param {Object} params.projectConfig - Project configuration
 * @param {string} params.projectPath - Path to project directory
 * @param {string} params.stage - Deployment stage
 * @param {Object} params.provider - Provider configuration
 * @param {string} params.resourceNameBase - Base name for AWS resources
 * @param {boolean} [params.all=false] - Remove all resources including shared ones
 * @param {boolean} [params.force=false] - Skip confirmation prompts
 * @returns {Promise<void>}
 */
export default async ({
  state,
  projectConfig,
  projectPath,
  stage,
  provider,
  resourceNameBase,
  all = false,
  force = false,
}) => {
  const containers = Object.keys(state.state.containers || {})

  if (containers.length === 0) {
    sclProgress.notice('No containers found in state, nothing to remove')
    return
  }

  for (const containerName of containers) {
    await removeContainer({
      state,
      containerName,
      provider,
      resourceNameBase,
      all,
    })
  }

  sclProgress.notice('Removal completed')
}
