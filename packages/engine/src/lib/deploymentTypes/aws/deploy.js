import path from 'path'
import pLimit from 'p-limit'
import cloneDeep from 'lodash/cloneDeep.js'
import { DockerClient, log, progress } from '@serverless/util'
import { diffObjects } from '@serverlessinc/sf-core/src/utils/general/index.js'
import { hashFolder } from '@serverlessinc/sf-core/src/utils/fs/folder-hash.js'
import { obfuscateSensitiveData } from '@serverlessinc/sf-core/src/utils/general/index.js'
import { AwsVpcClient } from '../../aws/vpc.js'
import { AwsAlbClient } from '../../aws/alb.js'
import { AwsEcsClient } from '../../aws/ecs.js'
import { AwsIamClient } from '../../aws/iam.js'
import { AwsLambdaClient } from '../../aws/lambda.js'
import { AwsRoute53Client } from '../../aws/route53.js'
import { AwsAcmClient } from '../../aws/acm.js'
import { AwsEcrClient } from '../../aws/ecr.js'
import { AwsCloudFrontClient } from '../../aws/cloudfront.js'
import { AwsCloudWatchClient } from '../../aws/cloudwatch.js'
import { AwsAutoscalingClient } from '../../aws/autoscaling.js'
import { getContainerEnvVars } from '../../utils/index.js'
import deployAwsLambdaContainer from './deployAwsLambda.js'
import deployAwsFargateEcsContainer from './deployAwsFargateEcs.js'
import {
  deployDynamicRouting,
  updateRouteMapping,
} from './deploy-dynamic-routing.js'
import { ServerlessError } from '@serverless/util'
import { randomUUID } from 'crypto'

const logger = log.get('scf:awsApi:deploy')
const sclProgress = progress.get('main')

// Create an ALB concurrency limiter to ensure ALB operations (which modify state) run sequentially.
const albLimit = pLimit(1)

/**
 * Initialize AWS clients once and return as a single object.
 * @param {Object} params - The parameters to initialize AWS clients
 * @param {Object} params.awsProvider - AWS provider configuration
 * @returns {Object} - An object containing AWS clients and region information
 */
const initializeAwsClients = ({ awsProvider }) => {
  return {
    region: awsProvider.region,
    awsVpcClient: new AwsVpcClient(awsProvider),
    awsAlbClient: new AwsAlbClient(awsProvider),
    awsEcsClient: new AwsEcsClient(awsProvider),
    awsIamClient: new AwsIamClient(awsProvider),
    awsLambdaClient: new AwsLambdaClient(awsProvider),
    awsAcmClient: new AwsAcmClient(awsProvider),
    awsEcrClient: new AwsEcrClient(awsProvider),
    awsRoute53Client: new AwsRoute53Client(awsProvider),
    awsCloudFrontClient: new AwsCloudFrontClient(awsProvider),
    awsCloudWatchClient: new AwsCloudWatchClient(awsProvider),
    awsAutoscalingClient: new AwsAutoscalingClient(awsProvider),
  }
}

/**
 * Build and push container images for Docker.
 * This step was previously limited to 2 concurrent tasks, but now is called within the deployContainer concurrency limit.
 * @param {Object} params - The parameters for building and pushing container images
 * @param {string} params.resourceNameBase - Base resource name used for AWS resource naming
 * @param {string} params.containerName - Name of the container
 * @param {Object} params.containerConfig - Container configuration details
 * @param {string} params.containerPath - Full path to the container's source code
 * @param {string} params.folderHash - Hash representing the current state of the folder
 * @param {Object} params.awsEcrClient - AWS ECR client instance
 * @param {Object} params.state - State object that manages deployment state
 * @param {string|null} [params.aiFramework=null] - AI framework detected in the project
 * @returns {Promise<void>}
 */
const buildAndPushContainerImages = async ({
  resourceNameBase,
  containerName,
  containerConfig,
  containerPath,
  folderHash,
  awsEcrClient,
  state,
  aiFramework,
}) => {
  sclProgress.notice(`${containerName}: Building container image`)

  const repositoryUri = await awsEcrClient.getOrCreateEcrRepository({
    containerName,
    resourceNameBase,
  })

  state.state.containers[containerName].compute.awsEcr = {
    repositoryUri,
  }

  const dockerClient = new DockerClient()
  const { imageUri } = await dockerClient.generateImageUris({
    repositoryUri,
    folderHash,
  })

  await dockerClient.buildImage({
    containerName,
    containerPath,
    imageUri,
    dockerFileString: containerConfig.build?.dockerFileString || null,
    buildArgs: containerConfig.build?.args || {},
    buildOptions: containerConfig.build?.options || [],
    aiFramework,
  })

  const authConfig = await awsEcrClient.getEcrAuthorizationToken()

  const imageSize = await dockerClient.getImageSize({ imageUri })

  sclProgress.notice(
    `${containerName}: Pushing container image to AWS ECR (${imageSize}MB)`,
  )

  await dockerClient.pushImage({
    imageUri,
    authconfig: authConfig,
  })

  state.state.containers[containerName].compute.awsFargateEcs.imageUri =
    imageUri

  sclProgress.notice(`${containerName}: Building container for AWS Lambda`)

  const imageAwsLambdaUri = await dockerClient.buildImageAwsLambda({
    imageUri,
  })

  const imageAwsLambdaSize = await dockerClient.getImageSize({
    imageUri: imageAwsLambdaUri,
  })

  sclProgress.notice(
    `${containerName}: Pushing AWS Lambda image to AWS ECR (${imageAwsLambdaSize}MB)`,
  )

  await dockerClient.pushImage({
    imageUri: imageAwsLambdaUri,
    authconfig: authConfig,
  })

  state.state.containers[containerName].compute.awsLambda.imageUri =
    imageAwsLambdaUri

  if (folderHash) {
    state.state.containers[containerName].folderHash = folderHash
  }

  // TODO: When run concurrently, there could be race conditions on the state file.
  await state.save()
}

/**
 * Deploy the project
 * @param {Object} params - The parameters for deploying the project
 * @param {string} params.projectPath - Path to the project directory
 * @param {Object} params.projectConfig - Project configuration object
 * @param {Object} params.state - State management object
 * @param {string} params.stage - Deployment stage (e.g. dev, prod)
 * @param {Object} params.provider - Provider configuration object
 * @param {boolean} [params.force=false] - Force deployment even if no changes are detected
 * @param {string} params.resourceNameBase - Base resource name for AWS resource naming
 * @param {string|null} [params.aiFramework=null] - AI framework detected in the project
 * @returns {Promise<void>}
 */
const deploy = async ({
  projectPath,
  projectConfig,
  state,
  stage,
  provider,
  force = false,
  resourceNameBase,
  aiFramework,
}) => {
  // Ensure Docker is running before doing anything else
  const dockerClient = new DockerClient()
  await dockerClient.ensureIsRunning()

  // Instantiate all AWS clients once
  const awsClients = initializeAwsClients({ awsProvider: provider.aws })

  if (!state.state.scfForwardToken) {
    state.state.scfForwardToken = randomUUID()
  }

  // Deploy foundational infrastructure
  await deployFoundationalInfrastructure({
    state,
    resourceNameBase,
    provider,
    awsClients,
    projectConfig,
  })

  /**
   * projectConfig can support a "containers" property, or a single "container" property.
   * This is because the Serverless AI Framework only allows for deploying a single container at a time,
   * and other frameworks will likely do the same (e.g. Serverless Front-end Framework).
   * Here we look for both and merge them into a single object.
   * However, state only supports "containers". For single container projects, the container name is always "service".
   */
  let containers = cloneDeep(projectConfig.containers)
  if (projectConfig.container && !projectConfig.containers) {
    // Check if this is a single container framework.
    containers = {
      service: cloneDeep(projectConfig.container), // Note the "service" key is hardcoded for single container frameworks.
    }
  }

  /**
   * WARNING: DO NOT ENABLE CONCURRENT CONTAINER DEPLOYMENTS UNTIL FINISHED!
   *
   * TODO: Finish this work to enable concurrent container deployments.
   *
   * Here is the concurrency limiter for deploying containers.
   * It's currently set to 1 because this work is unfinished.
   * To finish, we must solve the issue with state.save(),
   * which currently has the potential for BAD race conditions
   * when this code is run concurrently.
   * state saving/loading will need to be reworked to be concurrency safe.
   */
  const deployContainerLimit = pLimit(1)

  /**
   * Deploy each container concurrently to improve speed using the concurrency limiter.
   * This is currently limited to 2 concurrent deployments, largely due to be conservative
   * with local builds and uploads.
   * TODO: Separate service deployment and run those at a higher level of concurrency,
   * as much as AWS allows.
   */
  await Promise.all(
    Object.entries(containers).map(([containerName, containerConfig]) =>
      deployContainerLimit(() =>
        deployContainer({
          state,
          projectConfig,
          projectPath,
          stage,
          provider,
          containerName,
          containerConfig,
          force,
          resourceNameBase,
          awsClients,
          aiFramework,
        }),
      ),
    ),
  )
}

/**
 * Deploy foundational infrastructure
 * @param {Object} params - The parameters for deploying foundational infrastructure
 * @param {Object} params.state - State management object
 * @param {string} params.resourceNameBase - Base resource name for AWS resource naming
 * @param {Object} params.awsClients - Object containing AWS client instances
 * @param {Object} params.projectConfig - Project configuration object
 * @returns {Promise<Object>} - Returns an object containing the AWS ALB information
 */
const deployFoundationalInfrastructure = async ({
  state,
  resourceNameBase,
  awsClients,
  projectConfig,
}) => {
  const { awsAlbClient, awsEcsClient, awsVpcClient, awsIamClient } = awsClients

  sclProgress.notice('Deploying foundational infrastructure')

  // Check if any networking resources are provided in the configuration
  const userProvidedVpcId = projectConfig?.deployment?.awsVpc?.id
  const userProvidedPublicSubnets =
    projectConfig?.deployment?.awsVpc?.publicSubnets
  const userProvidedPrivateSubnets =
    projectConfig?.deployment?.awsVpc?.privateSubnets
  const userProvidedS2sSecurityGroupId =
    projectConfig?.deployment?.awsVpc?.s2sSecurityGroupId
  const userProvidedLbSecurityGroupId =
    projectConfig?.deployment?.awsVpc?.loadBalancerSecurityGroupId

  let vpcId
  let publicSubnets
  let privateSubnets
  let s2sSecurityGroupId
  let loadBalancerSecurityGroupId

  if (userProvidedVpcId) {
    // Validate and use user-provided networking resources
    logger.debug(`Using user-provided VPC ID: ${userProvidedVpcId}`)

    // Validate VPC
    await awsVpcClient.validateUserProvidedVpc(userProvidedVpcId)

    // Validate subnets
    await awsVpcClient.validateUserProvidedSubnets(
      userProvidedPublicSubnets,
      userProvidedVpcId,
    )
    await awsVpcClient.validateUserProvidedSubnets(
      userProvidedPrivateSubnets,
      userProvidedVpcId,
    )

    // Validate security groups
    await awsVpcClient.validateUserProvidedSecurityGroups(
      [userProvidedS2sSecurityGroupId, userProvidedLbSecurityGroupId],
      userProvidedVpcId,
    )

    // Use user-provided resources
    vpcId = userProvidedVpcId
    publicSubnets = userProvidedPublicSubnets
    privateSubnets = userProvidedPrivateSubnets
    s2sSecurityGroupId = userProvidedS2sSecurityGroupId
    loadBalancerSecurityGroupId = userProvidedLbSecurityGroupId

    // Mark resources as user-provided in state
    state.state.awsVpc.id = vpcId
    state.state.awsVpc.publicSubnets = publicSubnets
    state.state.awsVpc.privateSubnets = privateSubnets
    state.state.awsVpc.s2sSecurityGroupId = s2sSecurityGroupId
    state.state.awsVpc.loadBalancerSecurityGroupId = loadBalancerSecurityGroupId
    state.state.awsVpc.provisionedBy = 'user'
  } else {
    // Create new VPC and networking resources
    vpcId = await awsVpcClient.getOrCreateVpc(resourceNameBase)
    logger.debug(`Created or found framework-provisioned VPC: ${vpcId}`)
    state.state.awsVpc.id = vpcId
    state.state.awsVpc.provisionedBy = 'framework'

    // These multiple AWS calls only need the VPC ID and can be done at the same time.
    const subnetsPromise = awsVpcClient.getOrCreateSubnets(
      vpcId,
      resourceNameBase,
    )
    const s2sSecurityGroupPromise =
      awsVpcClient.getOrCreateServiceToServiceSecurityGroup({
        vpcId,
        resourceNameBase,
      })
    const lbSecurityGroupPromise =
      awsVpcClient.getOrCreateLoadBalancerSecurityGroup({
        vpcId,
        resourceNameBase,
      })

    // Running these in parallel saves us time while we wait on AWS. We'll await them together.
    const [
      {
        publicSubnets: createdPublicSubnets,
        privateSubnets: createdPrivateSubnets,
      },
      createdS2sSecurityGroupId,
      createdLoadBalancerSecurityGroupId,
    ] = await Promise.all([
      subnetsPromise,
      s2sSecurityGroupPromise,
      lbSecurityGroupPromise,
    ])

    // Use created resources
    publicSubnets = createdPublicSubnets
    privateSubnets = createdPrivateSubnets
    s2sSecurityGroupId = createdS2sSecurityGroupId
    loadBalancerSecurityGroupId = createdLoadBalancerSecurityGroupId

    // Record the returned VPC, subnets, security groups in our state for future use.
    state.state.awsVpc.publicSubnets = publicSubnets
    state.state.awsVpc.privateSubnets = privateSubnets
    state.state.awsVpc.s2sSecurityGroupId = s2sSecurityGroupId
    state.state.awsVpc.loadBalancerSecurityGroupId = loadBalancerSecurityGroupId
  }

  // Create ECS cluster and Fargate role (these are independent of VPC resources)
  const ecsClusterPromise = awsEcsClient.getOrCreateCluster(resourceNameBase)

  if (projectConfig?.deployment?.awsFargateEcs?.executionRoleArn) {
    const fargateEcsExecutionRoleArn =
      projectConfig?.deployment?.awsFargateEcs?.executionRoleArn
    const ecsClusterArn = await ecsClusterPromise
    // Store ECS and IAM resources in state
    state.state.awsEcs.cluster.arn = ecsClusterArn

    // Store the Fargate ECS execution role in state to be used by container deployments.
    state.state.awsIam = state.state.awsIam || {}
    state.state.awsIam.fargateEcsExecutionRoleArn = fargateEcsExecutionRoleArn
  } else {
    const fargateRolePromise =
      awsIamClient.getOrCreateFargateExecutionRole(resourceNameBase)

    // Await ECS and IAM resources
    const [ecsClusterArn, fargateEcsExecutionRoleArn] = await Promise.all([
      ecsClusterPromise,
      fargateRolePromise,
    ])

    // Store ECS and IAM resources in state
    state.state.awsEcs.cluster.arn = ecsClusterArn

    // Store the Fargate ECS execution role in state to be used by container deployments.
    state.state.awsIam = state.state.awsIam || {}
    state.state.awsIam.fargateEcsExecutionRoleArn = fargateEcsExecutionRoleArn
  }

  // Now that we have the required subnets and security groups, let's create or verify the ALB.
  if (state.previousState?.isDeployed) {
    sclProgress.notice('Verifying AWS Application Load Balancer')
  } else {
    sclProgress.notice(
      'Creating AWS Application Load Balancer (~5 mins. One-time setup)',
    )
  }

  const alb = await awsAlbClient.getOrCreateAlb({
    resourceNameBase,
    subnets: publicSubnets,
    securityGroups: [loadBalancerSecurityGroupId, s2sSecurityGroupId],
  })

  if (projectConfig?.deployment?.awsAlb?.wafAclArn) {
    logger.debug('Associating WAF ACL to ALB', {
      albArn: alb.LoadBalancerArn,
      wafAclArn: projectConfig?.deployment?.awsAlb?.wafAclArn,
    })
    await awsAlbClient.associateWafToAlb({
      albArn: alb.LoadBalancerArn,
      wafAclArn: projectConfig?.deployment?.awsAlb?.wafAclArn,
    })
    state.state.awsAlb.wafAclArn = projectConfig?.deployment?.awsAlb?.wafAclArn
  }

  // Keep track of ALB details. We'll need them for routing in subsequent steps.
  state.state.awsAlb.arn = alb.LoadBalancerArn
  state.state.awsAlb.dnsName = alb.DNSName
  state.state.awsAlb.canonicalHostedZoneId = alb.CanonicalHostedZoneId

  // Save our updated state, so everything is persisted.
  await state.save()

  // Return the ALB info if we need to access it immediately after this call.
  return {
    awsAlb: alb,
  }
}

/**
 * Deploy a container (common logic) and delegate to service‐specific deployment.
 * @param {Object} params - The parameters for deploying a container
 * @param {Object} params.state - State management object
 * @param {Object} params.projectConfig - Project configuration object
 * @param {string} params.projectPath - Path to the project directory
 * @param {string} params.stage - Deployment stage (e.g. dev, prod)
 * @param {string} params.containerName - Name of the container
 * @param {Object} [params.containerConfig={}] - Container configuration details
 * @param {string} params.resourceNameBase - Base resource name used for AWS resource naming
 * @param {boolean} [params.force=false] - Flag to force deployment regardless of changes
 * @param {Object} params.awsClients - Object containing AWS client instances
 * @returns {Promise<void>}
 */
const deployContainer = async ({
  state,
  projectConfig,
  projectPath,
  stage,
  containerName,
  containerConfig = {},
  resourceNameBase,
  force = false,
  awsClients,
  aiFramework,
}) => {
  const {
    awsAlbClient,
    awsEcrClient,
    awsIamClient,
    awsAcmClient,
    awsRoute53Client,
    awsCloudFrontClient,
    awsLambdaClient,
  } = awsClients

  sclProgress.notice(`${containerName}: Preparing deployment`)

  const containerPath = path.join(projectPath, containerConfig?.src)
  const containerState = state.state?.containers?.[containerName]
  const previousContainerState =
    state.previousState?.containers?.[containerName]
  let routingPathHealthCheck = containerConfig.routing?.pathHealthCheck || null
  let hasMissingImagesFromState = false
  let hasChangedContainerComputeType = false
  let hasChangedContainerCode = false
  let hasChangedContainerComputeConfig = false
  let hasChangedContainerRoutingConfig = false
  let folderHash = null

  // Ensure container state defaults are set
  state.state.containers[containerName] =
    state.state.containers[containerName] || {}
  state.state.containers[containerName].compute =
    state.state.containers[containerName].compute || {}
  state.state.containers[containerName].compute.awsLambda =
    state.state.containers[containerName].compute.awsLambda || {}
  state.state.containers[containerName].compute.awsFargateEcs =
    state.state.containers[containerName].compute.awsFargateEcs || {}
  state.state.containers[containerName].compute.awsIam =
    state.state.containers[containerName].compute.awsIam || {}
  state.state.containers[containerName].routing =
    state.state.containers[containerName].routing || {}
  state.state.containers[containerName].routing.type = 'awsAlb'
  state.state.containers[containerName].routing.awsAlb = state.state.containers[
    containerName
  ].routing.awsAlb || {
    listenerRules: [],
    targetGroupArnAwsLambda: null,
    targetGroupArnAwsFargateEcs: null,
  }

  /**
   * Get the previous container config
   * Keep in mind, there can be config.containers or config.container
   */
  let previousContainerConfig = {}
  if (state.previousState?.config?.containers?.[containerName]) {
    previousContainerConfig =
      state.previousState.config?.containers?.[containerName]
  }

  /**
   * Perform detailed checking of what has changed in the container config,
   * so we can determine what updates are needed.
   *
   * We do this here, so we don't have to replicate it for each compute type.
   */

  /**
   * Set default healthcheck path if not specified.
   * Healthchecks are required for AWS ALB to route traffic to the container.
   * If no healthcheck path is specified, we'll use the root of the configured routing path.
   * We need to warn the user if this path does not return a 200 status,
   * as their deployment will fail.
   */
  if (!routingPathHealthCheck) {
    routingPathHealthCheck =
      containerConfig.routing?.pathPattern.split(/[*?{}]/)[0] || '/'
    routingPathHealthCheck =
      routingPathHealthCheck === '/'
        ? '/'
        : routingPathHealthCheck.replace(/\/$/, '')
    logger.warning(
      `${containerName}: No healthcheck path specified. Using the root of the configured routing path: "${routingPathHealthCheck}". If this path does not return a 200 status, your deployment will fail. To prevent this, ensure that path returns a 200 status or set routing.pathHealthCheck to a path that returns a 200 status (e.g. '/health').`,
    )
  }

  /**
   * Check for code changes.
   * Compute the hash of the source code folder and compare
   * it to the previous hash saved in state.
   */
  folderHash = await hashFolder(containerPath)
  if (!containerState) {
    logger.debug(
      `${containerName}: Container state not found. It likely has not been deployed yet.`,
    )
    hasChangedContainerCode = true
  } else {
    if (folderHash !== previousContainerState?.folderHash) {
      logger.debug(
        `${containerName}: Code changes detected. folderHash: ${folderHash} previousHash: ${previousContainerState?.folderHash}`,
      )
      hasChangedContainerCode = true
    }
  }

  /**
   * Check for compute type changes.
   * This is used to determine if the compute type has changed.
   */
  if (
    previousContainerConfig?.compute?.type &&
    containerConfig?.compute?.type &&
    previousContainerConfig?.compute?.type !== containerConfig?.compute?.type
  ) {
    logger.warning(
      `${containerName}: Compute type changed. new: "${containerConfig.compute.type}" previous: "${previousContainerConfig?.compute?.type}". Performing zero-downtime migration.`,
    )
    hasChangedContainerComputeType = true
  }

  /**
   * Check for routing configuration changes.
   * This is used to determine if AWS ALB needs to be updated.
   */
  const containerRoutingDiff = diffObjects({
    oldObj: previousContainerConfig?.routing || {},
    newObj: containerConfig?.routing || {},
  })
  hasChangedContainerRoutingConfig =
    Object.keys(containerRoutingDiff).length > 0
  if (hasChangedContainerRoutingConfig) {
    logger.debug(
      `${containerName}: Changes detected in routing: ${JSON.stringify(containerRoutingDiff)}`,
    )
  }
  // Mark as true for initial deployment.
  if (!previousContainerConfig?.routing) {
    hasChangedContainerRoutingConfig = true
  }

  /**
   * Check for broad compute configuration changes.
   * This is used to determine if AWS Lambda or AWS Fargate ECS needs to be updated.
   *
   * Before we save container config to state, we obfuscate sensitive data.
   * Therefore, to do a proper comparison, we need to obfuscate the current container config.
   * The comparison is done on the computed values, not the sensitive data.
   */
  const obfuscatedCurrentContainerConfig = obfuscateSensitiveData({
    obj: containerConfig,
    sensitiveKeys: ['environment'],
  })
  logger.debug(`${containerName}: Checking for compute config changes`)
  const cloneCurrentContainerConfig = cloneDeep(
    obfuscatedCurrentContainerConfig,
  )
  const clonePreviousContainerConfig = cloneDeep(previousContainerConfig)
  // Delete properties irrelevant to compute configuration.
  cloneCurrentContainerConfig.routing = null
  clonePreviousContainerConfig.routing = null
  cloneCurrentContainerConfig.dev = null
  clonePreviousContainerConfig.dev = null
  if (cloneCurrentContainerConfig.compute?.awsIam) {
    cloneCurrentContainerConfig.compute.awsIam = null
  }
  if (clonePreviousContainerConfig?.compute?.awsIam) {
    clonePreviousContainerConfig.compute.awsIam = null
  }
  const containerComputeDiff = diffObjects({
    oldObj: clonePreviousContainerConfig || {},
    newObj: cloneCurrentContainerConfig,
  })
  hasChangedContainerComputeConfig =
    Object.keys(containerComputeDiff).length > 0
  if (hasChangedContainerComputeConfig) {
    logger.debug(
      `${containerName}: Changes detected in compute config: ${JSON.stringify(containerComputeDiff)}`,
    )
  }

  // Debug log if there are no changes.
  if (
    !hasChangedContainerComputeType &&
    !hasChangedContainerComputeConfig &&
    !hasChangedContainerRoutingConfig &&
    !hasChangedContainerCode
  ) {
    logger.debug(
      `${containerName}: No changes detected in code, compute type, compute config, or routing config`,
    )
  }

  /**
   * Check if images are missing from state.
   * This is a secondary check to ensure images exist.
   */
  hasMissingImagesFromState =
    !previousContainerState?.compute?.awsFargateEcs?.imageUri ||
    !previousContainerState?.compute?.awsLambda?.imageUri

  /**
   * Return early if no changes and deployment is not forced.
   */
  if (
    !force &&
    !hasChangedContainerCode &&
    !hasChangedContainerComputeType &&
    !hasChangedContainerComputeConfig &&
    !hasChangedContainerRoutingConfig &&
    !hasMissingImagesFromState
  ) {
    logger.warning(
      `${containerName}: No changes detected in code or config, skipping deployment`,
    )
    state.state.containers[containerName].deployedOnLastDeployment = false
    await state.save()
    return
  }

  /**
   * If there are no changes and the deployment is forced,
   * let the user know that we're proceeding with the deployment.
   */
  if (
    force &&
    !hasChangedContainerCode &&
    !hasChangedContainerComputeType &&
    !hasChangedContainerComputeConfig &&
    !hasChangedContainerRoutingConfig &&
    !hasMissingImagesFromState
  ) {
    logger.warning(
      `${containerName}: No changes detected, but proceeding with deployment due to --force flag`,
    )
  }

  /**
   * Build and push container images if code has changed or images are missing.
   * Keep in mind, this is subject to the deployContainer concurrency limit.
   */
  if (force || hasChangedContainerCode || hasMissingImagesFromState) {
    await buildAndPushContainerImages({
      containerName,
      containerConfig,
      containerPath,
      folderHash,
      awsEcrClient,
      state,
      resourceNameBase,
      aiFramework,
    })
  }

  let certificateArn = null
  const domain = containerConfig.routing?.domain
  if (domain) {
    sclProgress.update(`${containerName}: Configuring domain`)
    certificateArn = await awsAcmClient.findOrCreateAcmCertificate(domain)
  }

  // Use dynamic routing by default, unless explicitly disabled
  const useDynamicRouting =
    projectConfig?.deployment?.useDynamicRouting !== false &&
    process.env.AWS_USE_DYNAMIC_ROUTING !== 'false'

  /**
   * Create Target Groups  AWS Fargate ECS.
   *
   * A target group for ALB serves as a routing destination that
   * defines where and how traffic should be directed - for Fargate ECS
   * it points to your ECS tasks/containers allowing the ALB to route incoming
   * HTTP/HTTPS requests to the appropriate backend service based on
   * listener rules you define.
   *
   * We create a target group for each compute type ahead of time,
   * enabling faster migrations between compute types in the future.
   */
  const targetGroupArnAwsFargateEcs = await albLimit(() =>
    awsAlbClient.getOrCreateTargetGroup({
      resourceNameBase,
      serviceName: containerName,
      vpcId: state.state.awsVpc.id,
      type: 'ip',
      routingPathHealthCheck,
    }),
  )

  state.state.containers[
    containerName
  ].routing.awsAlb.targetGroupArnAwsFargateEcs = targetGroupArnAwsFargateEcs

  /**
   * Create/update a custom IAM Role.
   * This is used to grant containers access to AWS services.
   */
  const customRoleArn = await awsIamClient.createOrUpdateRole(
    resourceNameBase,
    containerName,
    containerConfig.compute.awsIam?.customPolicy,
  )

  /**
   * Set the IAM Roles for Fargate ECS and Lambda.
   *
   * If the compute type is AWS Fargate ECS...
   * AWS ECS Fargate roles need a separate IAM Role for execution permission.
   * This role does not allow the service to access AWS services, that is
   * what the customRole is for. We already created a separate Fargate execution role in the
   * foundational infrastructure deployment, which is used across all containers.
   * We'll set it here for this container.
   * We'll also set the "customRole" as the task role for the container, which does
   * allow the service to access AWS services.
   *
   * If the compute type is AWS Lambda...
   * We add execution permissions directly to the Lambda function elsewhere.
   * Therefore, the customRole is only used for access to AWS services.
   * We'll set that here.
   */
  if (containerConfig.compute.type === 'awsFargateEcs') {
    state.state.containers[containerName].compute.awsIam.executionRoleArn =
      state.state.awsIam.fargateEcsExecutionRoleArn
    state.state.containers[containerName].compute.awsIam.taskRoleArn =
      customRoleArn
  } else if (containerConfig.compute.type === 'awsLambda') {
    state.state.containers[containerName].compute.awsIam.executionRoleArn =
      customRoleArn
  }

  /**
   * Set up ALB listeners for HTTP
   *
   * The ALB is only used for deploying to ECS and Fargate. The load balancer is also only reachable by Cloudfront,
   * it is controlled through a header token check that Cloudfront sends as well as Security groups being setup such that,
   * the ALB is only reachable by the AWS Cloudfront managed prefix list.
   */
  // Always create HTTP listener first
  const httpListenerArn = await albLimit(() =>
    awsAlbClient.getOrCreateListener({
      albArn: state.state.awsAlb.arn,
      port: 80,
    }),
  )
  state.state.awsAlb.httpListenerArn = httpListenerArn

  // Set the primary listener ARN (used for routing rules)
  let primaryListenerArn = httpListenerArn

  // Store the primary listener ARN (HTTP or HTTPS) for routing rules in the container routing state
  state.state.containers[containerName].routing.awsAlb.primaryListenerArn =
    primaryListenerArn

  if (projectConfig.containers[containerName].routing?.awsAlb?.priority) {
    state.state.containers[containerName].routing.awsAlb.priority =
      projectConfig.containers[containerName].routing.awsAlb.priority
  }

  /**
   * This injects standard SCF environment variables into the container config.
   * It also injects any environment variables set in the container config,
   * converts them to key-value pairs, and ensures any non string values
   * are converted to a string.
   */
  const envVars = getContainerEnvVars({
    name: projectConfig.name,
    stage,
    containerName,
    computeType: containerConfig.compute.type,
    routingPathPattern: containerConfig.routing.pathPattern,
    environment: containerConfig.environment || {},
  })

  // Save the state
  await state.save()

  /**
   * Delegate deployment based on compute type using the separated deployment functions
   * for AWS Lambda and AWS Fargate ECS.
   */
  if (containerConfig.compute.type === 'awsLambda') {
    await deployAwsLambdaContainer({
      force,
      awsClients,
      state,
      resourceNameBase,
      containerName,
      containerConfig,
      envVars,
      customRoleArn,
      domain,
      routingPathHealthCheck,
      hasChangedContainerComputeType,
      hasChangedContainerCode,
      hasChangedContainerRoutingConfig,
      hasChangedContainerComputeConfig,
    })
  } else if (containerConfig.compute.type === 'awsFargateEcs') {
    await deployAwsFargateEcsContainer({
      force,
      awsClients,
      state,
      resourceNameBase,
      containerName,
      containerConfig,
      envVars,
      domain,
      routingPathHealthCheck,
      hasChangedContainerComputeType,
      hasChangedContainerCode,
      hasChangedContainerRoutingConfig,
      hasChangedContainerComputeConfig,
      scfForwardToken: state.state.scfForwardToken,
    })
  }

  // Record deployment details in state
  state.state.containers[containerName].compute.type =
    containerConfig.compute.type
  state.state.containers[containerName].timeLastDeployed =
    new Date().toISOString()
  state.state.containers[containerName].deployedOnLastDeployment = true

  // Save the state
  await state.save()

  /**
   * Set up custom domain or CloudFront distribution.
   * If a domain is specified, we'll create a certificate and add a record to Route 53.
   * If no domain is specified, we'll create a CloudFront distribution to front the ALB.
   */

  // Determine compute details for routing
  const computeType = containerConfig.compute?.type
  let albDnsName = null
  let functionUrl = null
  if (computeType === 'awsFargateEcs') {
    albDnsName = state.state.awsAlb.dnsName
  } else if (computeType === 'awsLambda') {
    functionUrl = await awsLambdaClient.getFunctionUrl({
      resourceNameBase,
      containerName,
    })
    if (!functionUrl) {
      throw new Error(`Lambda function URL not found for ${containerName}`)
    }
  } else {
    throw new Error(`Unknown compute type: ${computeType}`)
  }

  // Setup or update dynamic routing infrastructure
  const dynamicRoutingResult = await deployDynamicRouting({
    awsClients,
    state,
    resourceNameBase,
  })

  // Store the path pattern in KV Store for this container
  const pathPattern = containerConfig.routing?.pathPattern || '/*'
  await updateRouteMapping({
    awsClients,
    state,
    path: pathPattern,
    containerName,
    computeType: containerConfig.compute.type,
    resourceNameBase,
  })

  // Check if we already have a CloudFront distribution in the state
  // We need to check current state (which can be empty on new deploys or if state was lost)
  const existingDistributionId =
    state.state.awsCloudFront?.distributionId ||
    state.previousState?.state?.awsCloudFront?.distributionId

  if (!existingDistributionId) {
    // Get available origins from the dynamic routing result
    const { availableOrigins, defaultOriginType } = dynamicRoutingResult

    // Determine which origins we can use
    let currentAlbDnsName = null
    let currentFunctionUrl = null

    // Always use state.state.awsAlb.dnsName if available
    if (availableOrigins.hasAlb) {
      currentAlbDnsName = state.state.awsAlb.dnsName
    } else {
      // Create a placeholder ALB DNS for future use
      currentAlbDnsName = `placeholder-alb-${resourceNameBase}.elb.${awsClients.region}.amazonaws.com`
      logger.debug('Using placeholder ALB DNS name for future use')
    }

    // Find any Lambda function URL from state
    if (availableOrigins.hasLambda) {
      // Use the current container's function URL if it's a Lambda container
      if (computeType === 'awsLambda' && functionUrl) {
        currentFunctionUrl = functionUrl
      } else {
        // Otherwise, look through all containers for a function URL
        for (const container of Object.values(state.state.containers)) {
          if (container?.compute?.awsLambda?.functionUrl) {
            currentFunctionUrl = container.compute.awsLambda.functionUrl
            break
          }
        }
      }
    }

    // If we don't have a function URL but hasLambda is true, this is inconsistent state.
    // Instead of using a placeholder, we should throw an error.
    if (availableOrigins.hasLambda && !currentFunctionUrl) {
      throw new ServerlessError(
        'Dynamic routing configuration error: Lambda origin is available but no function URL was found in state.',
        'LAMBDA_FUNCTION_URL_MISSING',
      )
    }

    if (!currentFunctionUrl && !availableOrigins.hasLambda) {
      logger.debug('No Lambda origin available, using ALB only')
    }

    // Create distribution with the available origins and the CloudFront Function
    logger.debug(
      'Creating CloudFront distribution with dynamic routing capabilities',
    )
    const distribution =
      await awsCloudFrontClient.createDistributionWithDynamicRouting({
        resourceNameBase,
        albDnsName: currentAlbDnsName,
        functionUrl: currentFunctionUrl,
        functionArn: dynamicRoutingResult.function.arn,
        certificateArn: certificateArn || undefined,
        domain: domain || undefined,
        scfForwardToken: state.state.scfForwardToken,
        containerName: containerName,
      })

    // Wait for the distribution to be deployed
    sclProgress.update(
      `Waiting for CloudFront distribution ${distribution.Id} to be deployed. This can take several minutes.`,
    )
    await awsCloudFrontClient.waitForDistributionDeployed(distribution.Id)
    sclProgress.notice(
      `CloudFront distribution ${distribution.Id} deployed successfully.`,
    )

    // Save distribution info to state
    state.state.awsCloudFront = state.state.awsCloudFront || {}
    state.state.awsCloudFront.distributionId = distribution.Id
    state.state.awsCloudFront.distributionDomainName = distribution.DomainName
    state.state.awsCloudFront.enabled = true

    // Also save to container state
    state.state.containers[containerName].routing.awsCloudFront =
      state.state.containers[containerName].routing.awsCloudFront || {}
    state.state.containers[containerName].routing.awsCloudFront.distributionId =
      distribution.Id
    state.state.containers[
      containerName
    ].routing.awsCloudFront.distributionDomainName = distribution.DomainName

    logger.debug(
      `Created CloudFront distribution for dynamic routing: ${distribution.Id}`,
    )
  } else {
    // Distribution exists, make sure the function is associated
    // If we found an existing distribution ID in previous state but not current state,
    // we need to update the current state
    if (!state.state.awsCloudFront?.distributionId && existingDistributionId) {
      // Transfer the distribution info from previous state to current state
      const distribution = await awsCloudFrontClient.getDistribution(
        existingDistributionId,
      )

      // Set up the awsCloudFront state
      state.state.awsCloudFront = state.state.awsCloudFront || {}
      state.state.awsCloudFront.distributionId = existingDistributionId
      state.state.awsCloudFront.distributionDomainName = distribution.DomainName
      state.state.awsCloudFront.enabled = true

      logger.debug(
        `Recovered CloudFront distribution from previous state: ${existingDistributionId}`,
      )
    }

    await awsCloudFrontClient.associateFunctionWithDistribution({
      distributionId: state.state.awsCloudFront.distributionId,
      functionArn: dynamicRoutingResult.function.arn,
    })

    // Update the distribution with custom domain and certificate if provided
    if (domain && certificateArn) {
      // Use updateAliasesIfNeeded to only update the domain and certificate
      // without modifying the origins
      await awsCloudFrontClient.updateAliasesIfNeeded({
        distributionId: state.state.awsCloudFront.distributionId,
        certificateArn,
        domain,
      })
      // Wait for the distribution to be deployed
      sclProgress.update(
        `Waiting for CloudFront distribution ${state.state.awsCloudFront.distributionId} to be updated with custom domain. This can take several minutes.`,
      )
      await awsCloudFrontClient.waitForDistributionDeployed(
        state.state.awsCloudFront.distributionId,
      )
    }

    // Add origin to the distribution
    await awsCloudFrontClient.addOriginToDistribution({
      distributionId: state.state.awsCloudFront.distributionId,
      albDnsName: albDnsName,
      functionUrl: functionUrl,
      setAsDefault: false,
      resourceNameBase,
      scfForwardToken: state.state.scfForwardToken,
      containerName: containerName,
    })

    // Wait for the distribution to be deployed
    sclProgress.update(
      `Waiting for CloudFront distribution ${state.state.awsCloudFront.distributionId} to be updated. This can take several minutes.`,
    )
    await awsCloudFrontClient.waitForDistributionDeployed(
      state.state.awsCloudFront.distributionId,
    )
    sclProgress.notice(
      `CloudFront distribution ${state.state.awsCloudFront.distributionId} updated successfully.`,
    )

    logger.debug('Associated CloudFront Function with existing distribution')
  }

  // Handle Route 53 alias record (used for both traditional and dynamic routing)
  const prevDomain =
    state.state.containers[containerName].routing.awsRoute53?.domain
  const prevDistributionDomainName =
    state.state.containers[containerName].routing.awsCloudFront
      ?.distributionDomainName
  const distributionDomainName =
    state.state.awsCloudFront.distributionDomainName

  if (domain && distributionDomainName) {
    // Add or update alias record
    const resCfAliasRecord = await awsRoute53Client.addCloudFrontAliasRecord({
      distributionDomainName: distributionDomainName,
      domain,
    })
    state.state.containers[containerName].routing.awsRoute53 =
      state.state.containers[containerName].routing.awsRoute53 || {}
    state.state.containers[containerName].routing.awsRoute53.hostedZoneId =
      resCfAliasRecord.hostedZoneId
    state.state.containers[containerName].routing.awsRoute53.domain = domain
    state.state.containers[containerName].routing.awsAcm =
      state.state.containers[containerName].routing.awsAcm || {}
    state.state.containers[containerName].routing.awsAcm.certificateArn =
      certificateArn
    state.state.containers[containerName].routing.awsAcm.domain = domain
  } else if (prevDomain && prevDistributionDomainName) {
    // Remove alias record if domain was removed
    await awsRoute53Client.deleteCloudFrontAliasRecord({
      distributionDomainName: prevDistributionDomainName,
      domain: prevDomain,
    })
    // Clean up state
    delete state.state.containers[containerName].routing.awsRoute53
    delete state.state.containers[containerName].routing.awsAcm
  }

  await state.save()
}

export default deploy
