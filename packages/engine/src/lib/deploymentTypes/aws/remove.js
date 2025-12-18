import { log, progress } from '@serverless/util'
import { AwsVpcClient } from '../../aws/vpc.js'
import { AwsAlbClient } from '../../aws/alb.js'
import { AwsEcsClient } from '../../aws/ecs.js'
import { AwsIamClient } from '../../aws/iam.js'
import { AwsLambdaClient } from '../../aws/lambda.js'
import { AwsRoute53Client } from '../../aws/route53.js'
import { AwsCloudFrontClient } from '../../aws/cloudfront.js'
import { AwsCloudFrontKVClient } from '../../aws/cloudfront-kv.js'

const logger = log.get('containers-library:deployer:aws:remove')
const sclProgress = progress.get('main')

/**
 * Removes a single container and its associated AWS resources
 * @param {Object} params - The parameters for removing a container
 * @param {string} params.containerName - Name of the container to remove
 * @param {Object} params.containerConfig - Container configuration
 * @param {Object} params.state - State object containing deployment information
 * @param {string} params.stage - Deployment stage (e.g. 'dev', 'prod')
 * @param {Object} params.aws - AWS configuration
 * @param {boolean} params.force - Whether to force remove shared resources
 */
const removeContainer = async ({
  containerName,
  containerConfig,
  state,
  stage,
  provider,
  resourceNameBase,
  all = false,
  force = false,
}) => {
  const awsAlbClient = new AwsAlbClient(provider.aws)
  const awsEcsClient = new AwsEcsClient(provider.aws)
  const awsIamClient = new AwsIamClient(provider.aws)
  const awsLambdaClient = new AwsLambdaClient(provider.aws)
  const awsRoute53Client = new AwsRoute53Client(provider.aws)
  const awsCloudFrontClient = new AwsCloudFrontClient(provider.aws)

  const containerState = state.state.containers?.[containerName]
  const namespace = state.state.namespace
  const domain = containerConfig?.routing?.domain

  sclProgress.update(`${containerName}: Removing AWS Fargate Service`)
  await awsEcsClient.removeFargateService({
    containerName,
    resourceNameBase,
  })
  logger.debug(`${containerName}: AWS Fargate Service Removed`)
  sclProgress.update(`${containerName}: Removing AWS Lambda Function`)

  await awsLambdaClient.removeFunction({
    service: containerName,
    resourceNameBase,
  })

  logger.debug(`${containerName}: AWS Lambda Function Removed`)
  sclProgress.update(`${containerName}: Deleting AWS Target Groups`)

  try {
    await awsAlbClient.deleteTargetGroup({
      resourceNameBase,
      serviceName: containerName,
      type: 'ip',
    })
    await awsAlbClient.deleteTargetGroup({
      resourceNameBase,
      serviceName: containerName,
      type: 'lambda',
    })
    logger.debug(`${containerName}: Target Groups Removed`)
  } catch (error) {
    logger.debug(
      `${containerName}: Target Groups could not be removed, most likely they do not exist: ${error}`,
      error,
    )
  }

  sclProgress.update(`${containerName}: Deleting AWS IAM Role`)
  await awsIamClient.removeRole({
    resourceNameBase,
    serviceName: containerName,
  })
  logger.debug(`${containerName}: AWS IAM Role Removed`)

  if (containerState?.routing?.awsCloudFront?.distributionId) {
    try {
      sclProgress.update(`${containerName}: Removing CloudFront distribution`)
      await awsCloudFrontClient.deleteDistribution(
        containerState.routing.awsCloudFront.distributionId,
      )
      sclProgress.notice(`${containerName}: CloudFront distribution removed`)
    } catch (error) {
      logger.error(
        `${containerName}: Failed to remove CloudFront distribution`,
        error,
      )
    }
  }

  if (all) {
    const alb = await awsAlbClient.getAlbIfExists(resourceNameBase)
    if (alb && domain) {
      sclProgress.update(`${containerName}: Deleting AWS ALB Alias Record`)

      await awsRoute53Client.deleteAlbAliasRecord({
        loadBalancerDNSName: alb.DNSName,
        loadBalancerZoneId: alb.CanonicalHostedZoneId,
        domain,
      })
      logger.debug(`${containerName}: AWS ALB Alias Record Removed`)
    }
  }

  // Remove container from state
  if (state.state.containers && containerName in state.state.containers) {
    delete state.state.containers[containerName]
  }

  await state.save()
}

/**
 * Removes containers and their associated AWS resources
 * @param {Object} params - The parameters for removing containers
 * @param {Object} params.state - State object containing deployment information
 * @param {Object} params.projectConfig - Project configuration
 * @param {string} params.stage - Deployment stage (e.g. 'dev', 'prod')
 * @param {boolean} [params.all=false] - Whether to remove all resources including shared ones
 * @param {boolean} [params.force=false] - Whether to skip confirmations
 */
const remove = async ({
  state,
  projectConfig,
  stage,
  provider,
  resourceNameBase,
  all = false,
  force = false,
}) => {
  const awsAlbClient = new AwsAlbClient(provider.aws)
  const awsEcsClient = new AwsEcsClient(provider.aws)
  const awsVpcClient = new AwsVpcClient(provider.aws)
  const awsCloudFrontClient = new AwsCloudFrontClient(provider.aws)
  const awsCloudFrontKVClient = new AwsCloudFrontKVClient(provider.aws)

  for (const [containerName, containerConfig] of Object.entries(
    projectConfig.containers,
  )) {
    await removeContainer({
      containerName,
      containerConfig,
      state,
      stage,
      provider,
      resourceNameBase,
      force,
      all,
    })
  }

  if (all) {
    sclProgress.update('Removing AWS ECS Cluster')
    await awsEcsClient.deleteClusterIfEmpty(resourceNameBase)
    logger.debug('ECS Cluster Removed')

    sclProgress.update('Deleting AWS ALB')
    await awsAlbClient.deleteAlb(resourceNameBase)
    logger.debug('AWS ALB Removed')

    // Check if the VPC was provisioned by the user
    if (state.state.awsVpc.provisionedBy === 'user') {
      sclProgress.notice('Skipping deletion of user-provided AWS VPC')
      logger.debug('User-provided AWS VPC preserved')
    } else {
      sclProgress.update('Deleting AWS VPC')
      await awsVpcClient.deleteVpc(resourceNameBase)
      logger.debug('AWS VPC Removed')
    }

    // Delete CloudFront function if it exists
    if (state.state.awsCloudFront?.function?.name) {
      try {
        sclProgress.update('Removing CloudFront function')
        await awsCloudFrontClient.deleteFunction(
          state.state.awsCloudFront.function.name,
        )
        logger.debug('CloudFront function removed')
        delete state.state.awsCloudFront.function
      } catch (error) {
        logger.error('Failed to remove CloudFront function', error)
      }
    }

    // Delete CloudFront KV store if it exists
    if (state.state.awsCloudFront?.keyValueStore?.name) {
      try {
        sclProgress.update('Removing CloudFront KV store')
        await awsCloudFrontKVClient.deleteKeyValueStore({ resourceNameBase })
        logger.debug('CloudFront KV store removed')
        delete state.state.awsCloudFront.keyValueStore
      } catch (error) {
        logger.error('Failed to remove CloudFront KV store', error)
      }
    }

    await state.save()
  }
}

export default remove
