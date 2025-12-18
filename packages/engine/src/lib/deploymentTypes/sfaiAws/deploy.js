import path from 'path'
import pLimit from 'p-limit'
import cloneDeep from 'lodash/cloneDeep.js'
import { DockerClient, log, progress, ServerlessError } from '@serverless/util'
import { diffObjects } from '@serverlessinc/sf-core/src/utils/general/index.js'
import { hashFolder } from '@serverlessinc/sf-core/src/utils/fs/folder-hash.js'
import { obfuscateSensitiveData } from '@serverlessinc/sf-core/src/utils/general/index.js'
import { AwsVpcClient } from '../../aws/vpc.js'
import { AwsAlbClient } from '../../aws/alb.js'
import { AwsEcsClient } from '../../aws/ecs.js'
import { AwsIamClient } from '../../aws/iam.js'
import { AwsRoute53Client } from '../../aws/route53.js'
import { AwsAcmClient } from '../../aws/acm.js'
import { AwsEcrClient } from '../../aws/ecr.js'
import { AwsCloudFrontClient } from '../../aws/cloudfront.js'
import { AwsCloudWatchClient } from '../../aws/cloudwatch.js'
import { AwsAutoscalingClient } from '../../aws/autoscaling.js'
import { getContainerEnvVars } from '../../utils/index.js'
import deployAwsFargateEcsContainer from '../awsApi/deployAwsFargateEcs.js'
import { AwsEventBridgeClient } from '../../aws/eventbridge.js'
import { createEventBridgeIntegrations } from './integrations/eventbridge.js'
import { getSlackCredentialsFromEnvironment } from './slack/apps.js'

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
    awsAcmClient: new AwsAcmClient(awsProvider),
    awsEcrClient: new AwsEcrClient(awsProvider),
    awsRoute53Client: new AwsRoute53Client(awsProvider),
    awsCloudFrontClient: new AwsCloudFrontClient(awsProvider),
    awsCloudWatchClient: new AwsCloudWatchClient(awsProvider),
    awsAutoscalingClient: new AwsAutoscalingClient(awsProvider),
    awsEventBridgeClient: new AwsEventBridgeClient(awsProvider),
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
  manifest,
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

  const defaultDockerfile = `
FROM public.ecr.aws/serverless-container-framework/sfai/base-nodejs:0.0.13
WORKDIR /shim/app
COPY . .
RUN npm install
RUN echo '${JSON.stringify(manifest)}' > /shim/app/.serverless.ai.manifest.json
ENTRYPOINT node /ai-framework/bin/start --config /shim/app/.serverless.ai.manifest.json`

  await dockerClient.buildImage({
    containerName,
    containerPath,
    imageUri,
    dockerFileString:
      containerConfig.build?.dockerFileString ?? defaultDockerfile,
    buildArgs: containerConfig.build?.args || {},
    buildOptions: containerConfig.build?.options || [],
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
 * @param {Object} params.manifest - Manifest object
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
  manifest,
}) => {
  // Ensure Docker is running before doing anything else
  const dockerClient = new DockerClient()
  await dockerClient.ensureIsRunning()

  // Instantiate all AWS clients once
  const awsClients = initializeAwsClients({ awsProvider: provider.aws })

  // Deploy foundational infrastructure
  await deployFoundationalInfrastructure({
    state,
    resourceNameBase,
    provider,
    awsClients,
  })

  /**
   * projectConfig can support a "containers" property, or a single "container" property.
   * This is because the Serverless AI Framework only allows for deploying a single container at a time,
   * and other frameworks will likely do the same (e.g. Serverless Front-end Framework).
   * Here we look for both and merge them into a single object.
   * However, state only supports "containers". For single container projects, the container name is always "service".
   */
  let containers = cloneDeep(projectConfig.agents)
  if (projectConfig.agent && !projectConfig.agents) {
    // Check if this is a single container framework.
    containers = {
      service: {
        ...cloneDeep(projectConfig.agent),
        routing: { pathPattern: '/*', ...projectConfig.agent.routing },
      }, // Note the "service" key is hardcoded for single container frameworks.
    }
  }

  if (!containers.service.compute.awsFargateEcs) {
    containers.service.compute.awsFargateEcs = {
      cpu: 512,
      memory: 1024,
    }
  } else {
    containers.service.compute.awsFargateEcs.cpu =
      containers.service.compute.awsFargateEcs?.cpu || 1024
    containers.service.compute.awsFargateEcs.memory =
      containers.service.compute.awsFargateEcs?.memory || 2048
  }

  // cpu: containerConfig.compute.awsFargateEcs?.cpu || 256,
  //     memory: containerConfig.compute.awsFargateEcs?.memory || 512,

  const slackIntegrationFromConfigEntry = Object.entries(
    containers.service.integrations ?? {},
  ).find(([_name, integration]) => integration.type === 'slack')
  const slackIntegrationFromConfig = slackIntegrationFromConfigEntry
    ? slackIntegrationFromConfigEntry[1]
    : null

  // Load environment variables defined in the manifest into the project config
  const slackIntegrationEntry = Object.entries(
    manifest.agent.integrations ?? {},
  ).find(([name, integration]) => integration.type === 'slack')
  const slackIntegration = slackIntegrationEntry
    ? slackIntegrationEntry[1]
    : null

  const slackCredentials = getSlackCredentialsFromEnvironment()

  if (slackIntegration && slackIntegrationFromConfig.credentials) {
    logger.debug('using existing slack credentials')
    const envVars = slackIntegration.config.credentialsEnvironmentVariables
    containers.service.environment[envVars.signingSecret] =
      slackIntegrationFromConfig.credentials.signingSecret
    containers.service.environment[envVars.botToken] =
      slackIntegrationFromConfig.credentials.botToken
    containers.service.environment[envVars.appToken] =
      slackIntegrationFromConfig.credentials.appToken
  } else if (
    slackIntegration &&
    slackCredentials.botToken &&
    slackCredentials.signingSecret &&
    slackCredentials.appToken
  ) {
    const envVars = slackIntegration.config.credentialsEnvironmentVariables
    logger.debug('using environment variables for slack credentials')
    containers.service.environment[envVars.signingSecret] =
      slackCredentials.signingSecret
    containers.service.environment[envVars.botToken] = slackCredentials.botToken
    containers.service.environment[envVars.appToken] = slackCredentials.appToken
  } else if (slackIntegration) {
    throw new ServerlessError(
      `Slack integration credentials not found. Please run \`serverless init-integrations\` and add slack credentials to your environment`,
      'SLACK_INTEGRATION_CREDENTIALS_NOT_FOUND',
      { stack: false },
    )
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
          manifest,
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
 * @returns {Promise<Object>} - Returns an object containing the AWS ALB information
 */
const deployFoundationalInfrastructure = async ({
  state,
  resourceNameBase,
  awsClients,
}) => {
  const { awsAlbClient, awsEcsClient, awsVpcClient, awsIamClient } = awsClients

  sclProgress.notice('Deploying foundational infrastructure')

  // First, we must have a VPC to hold everything else. That's the key AWS networking container.
  const vpcId = await awsVpcClient.getOrCreateVpc(resourceNameBase)
  logger.debug(`vpcId: ${vpcId}`)
  state.state.awsVpc.id = vpcId

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
  const ecsClusterPromise = awsEcsClient.getOrCreateCluster(resourceNameBase)
  const fargateRolePromise =
    awsIamClient.getOrCreateFargateExecutionRole(resourceNameBase)

  // Running these in parallel saves us time while we wait on AWS. We'll await them together.
  const [
    { publicSubnets, privateSubnets },
    s2sSecurityGroupId,
    loadBalancerSecurityGroupId,
    ecsClusterArn,
    fargateEcsExecutionRoleArn,
  ] = await Promise.all([
    subnetsPromise,
    s2sSecurityGroupPromise,
    lbSecurityGroupPromise,
    ecsClusterPromise,
    fargateRolePromise,
  ])

  // Record the returned VPC, subnets, security groups, and ECS cluster in our state for future use.
  state.state.awsVpc.publicSubnets = publicSubnets
  state.state.awsVpc.privateSubnets = privateSubnets
  state.state.awsVpc.s2sSecurityGroupId = s2sSecurityGroupId
  state.state.awsVpc.loadBalancerSecurityGroupId = loadBalancerSecurityGroupId
  state.state.awsEcs.cluster.arn = ecsClusterArn

  // Store the Fargate ECS execution role in state to be used by container deployments.
  state.state.awsIam = state.state.awsIam || {}
  state.state.awsIam.fargateEcsExecutionRoleArn = fargateEcsExecutionRoleArn

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
  manifest,
}) => {
  const {
    awsAlbClient,
    awsEcrClient,
    awsIamClient,
    awsAcmClient,
    awsRoute53Client,
    awsCloudFrontClient,
  } = awsClients

  sclProgress.notice(`${containerName}: Preparing deployment`)

  const containerPath = path.join(projectPath)
  const containerState = state.state?.agents?.[containerName]
  const previousContainerState = state.previousState?.agents?.[containerName]
  let routingPathHealthCheck = '/health'
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
    targetGroupArnAwsFargateEcs: null,
  }

  /**
   * Get the previous container config
   * Keep in mind, there can be config.containers or config.container
   */
  let previousContainerConfig = {}
  if (state.previousState?.config?.agents?.[containerName]) {
    previousContainerConfig =
      state.previousState.config?.agents?.[containerName]
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
  // if (!routingPathHealthCheck) {
  //   routingPathHealthCheck =
  //     containerConfig.routing?.pathPattern.split(/[*?{}]/)[0] || '/'
  //   routingPathHealthCheck =
  //     routingPathHealthCheck === '/'
  //       ? '/'
  //       : routingPathHealthCheck.replace(/\/$/, '')
  //   logger.warning(
  //     `${containerName}: No healthcheck path specified. Using the root of the configured routing path: "${routingPathHealthCheck}". If this path does not return a 200 status, your deployment will fail. To prevent this, ensure that path returns a 200 status or set routing.pathHealthCheck to a path that returns a 200 status (e.g. '/health').`,
  //   )
  // }

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
    !previousContainerState?.compute?.awsFargateEcs?.imageUri

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
      manifest,
    })
  }

  /**
   * Set up custom domain or CloudFront distribution.
   * If a domain is specified, we'll create a certificate and add a record to Route 53.
   * If no domain is specified, we'll create a CloudFront distribution to front the ALB.
   */
  let certificateArn = null
  const domain = containerConfig.routing?.domain
  if (domain) {
    sclProgress.update(`${containerName}: Configuring domain`)

    certificateArn = await awsAcmClient.findOrCreateAcmCertificate(domain)

    const resAlbAliasRecord = await awsRoute53Client.addAlbAliasRecord({
      loadBalancerDNSName: state.state.awsAlb.dnsName,
      loadBalancerZoneId: state.state.awsAlb.canonicalHostedZoneId,
      domain,
    })

    // Ensure state defaults are set
    state.state.containers[containerName].routing =
      state.state.containers[containerName].routing || {}
    state.state.containers[containerName].routing.awsRoute53 =
      state.state.containers[containerName].routing.awsRoute53 || {}
    state.state.containers[containerName].routing.awsRoute53.hostedZoneId =
      resAlbAliasRecord.hostedZoneId
    state.state.containers[containerName].routing.awsAcm =
      state.state.containers[containerName].routing.awsAcm || {}
    state.state.containers[containerName].routing.awsAcm.certificateArn =
      certificateArn
    state.state.containers[containerName].routing.awsAcm.domain = domain

    await state.save()
  } else {
    sclProgress.update(`${containerName}: Setting up CloudFront distribution`)

    if (
      !state.state.containers[containerName].routing?.awsCloudFront
        ?.distributionId
    ) {
      const distribution = await awsCloudFrontClient.createDistribution({
        resourceNameBase,
        albDnsName: state.state.awsAlb.dnsName,
      })

      // Ensure state defaults are set
      state.state.containers[containerName].routing =
        state.state.containers[containerName].routing || {}
      state.state.containers[containerName].routing.awsCloudFront =
        state.state.containers[containerName].routing.awsCloudFront || {}
      state.state.containers[
        containerName
      ].routing.awsCloudFront.distributionId = distribution.Id
      state.state.containers[
        containerName
      ].routing.awsCloudFront.distributionDomainName = distribution.DomainName

      state.state.awsCloudFront = state.state.awsCloudFront || {}
      state.state.awsCloudFront.enabled = true
      state.state.awsCloudFront.distributionId = distribution.Id
      state.state.awsCloudFront.distributionDomainName = distribution.DomainName

      sclProgress.notice(
        `${containerName}: CloudFront distribution created: https://${distribution.DomainName}`,
      )

      await state.save()
    } else {
      sclProgress.notice(
        `${containerName}: Using existing CloudFront distribution: https://${state.state.containers[containerName].routing.awsCloudFront.distributionDomainName}`,
      )
    }
  }

  /**
   * Create Target Groups for AWS Fargate ECS.
   *
   * A target group for ALB serves as a routing destination that
   * defines where and how traffic should be directed - for Fargate ECS
   * it points to your ECS tasks/containers while for Lambda it points
   * to your Lambda functions, allowing the ALB to route incoming
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
  state.state.containers[containerName].compute.awsIam.executionRoleArn =
    state.state.awsIam.fargateEcsExecutionRoleArn
  state.state.containers[containerName].compute.awsIam.taskRoleArn =
    customRoleArn

  /**
   * Set up ALB listeners for HTTP and optionally HTTPS if a custom domain is configured.
   *
   * An ALB (Application Load Balancer) listener is a process that listens for incoming traffic on a designated port—
   * typically port 80 (HTTP) or port 443 (HTTPS). The listener evaluates incoming requests against a set of rules,
   * such as path patterns or host headers, and routes the traffic to the appropriate target groups where your containers
   * or services are deployed.
   *
   * We always create an HTTP listener first, as it's the base requirement. When a custom domain is added:
   * - An HTTPS listener (port 443) is created with the provided certificate.
   * - A redirect rule is added to the HTTP listener, which automatically sends any HTTP request to HTTPS (port 443)
   *   using a permanent HTTP 301 redirect for the specific domain.
   * - The HTTP listener is still allowed for default ALB routes, but requests to the custom domain will be redirected to HTTPS.
   *
   * The listeners and redirect are managed through the AWS ALB client methods.
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

  /**
   * If we have a custom domain with certificate, add HTTPS listener for that certificate,
   * and add a redirect rule to the HTTP listener for requests to the custom domain.
   */
  if (certificateArn) {
    const httpsListenerArn = await albLimit(() =>
      awsAlbClient.getOrCreateListener({
        albArn: state.state.awsAlb.arn,
        port: 443,
        certificateArn,
      }),
    )

    // Add HTTP to HTTPS redirect rule for the custom domain
    await albLimit(() =>
      awsAlbClient.addHttpToHttpsListenerRule({
        listenerArn: httpListenerArn,
        path: '/*',
        priority: 1,
        hostHeader: domain,
      }),
    )

    // Store HTTPS listener ARN and make it the primary listener
    state.state.awsAlb.httpsListenerArn = httpsListenerArn
    primaryListenerArn = httpsListenerArn
  }

  // Store the primary listener ARN (HTTP or HTTPS) for routing rules in the container routing state
  state.state.containers[containerName].routing.awsAlb.primaryListenerArn =
    primaryListenerArn

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
    routingPathPattern: '/*',
    environment: containerConfig.environment || {},
  })

  // Save the state
  await state.save()

  /**
   * Delegate deployment based on compute type using the separated deployment functions
   * for AWS Lambda and AWS Fargate ECS.
   */

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
  })

  // Record deployment details in state
  state.state.containers[containerName].compute.type =
    containerConfig.compute.type
  state.state.containers[containerName].timeLastDeployed =
    new Date().toISOString()
  state.state.containers[containerName].deployedOnLastDeployment = true

  // Save the state
  await state.save()

  // // Setup integratoins
  // sclProgress.update(`${containerName}: Setting up integrations`)
  // await createEventBridgeIntegrations({
  //   state,
  //   agentName: containerName,
  //   agentConfig: containerConfig,
  //   awsEventBridgeClient: awsClients.awsEventBridgeClient,
  // })
}

export default deploy
