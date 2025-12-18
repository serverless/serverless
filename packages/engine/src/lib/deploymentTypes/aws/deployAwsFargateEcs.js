import { ServerlessError, log, progress } from '@serverless/util'

const logger = log.get('scf:awsApi:deploy:fargate-ecs')
const sclProgress = progress.get('main')

/**
 * Deploys an AWS Fargate ECS container.
 *
 * Deployment Workflow:
 * 1. **Validation:**
 *    - The function first checks that the compute type and routing configuration are not being changed simultaneously.
 *    - This is important to maintain a zero-downtime deployment strategy.
 *
 * 2. **Initial Route Preparation (Deprioritized Rule):**
 *    - If the deployment is forced or if there are changes to the container's compute type, code, compute configuration, or routing configuration,
 *      a target group listener rule is created or updated in a deprioritized state using the AWS ALB client.
 *    - This step ensures that if no listener rule exists yet (for example, from a previous Lambda setup), it is provisioned without interfering
 *      with the existing traffic routing.
 *    - It also ensures that if the compute type is changing, the new compute type will be provisioned without interfering
 *      with the existing traffic routing, until the new compute type is ready to receive traffic.
 *
 * 3. **ECS Service Deployment:**
 *    - The service deployment is triggered next. This involves:
 *      a. Registering a new task definition with the updated container image, environment variables, and compute configuration.
 *      b. Creating or updating the Fargate service using the AWS ECS client (see @ecs.js).
 *      c. Calculating and reconciling scaling policies (min, max, and desired values) and ensuring the tasks are correctly deployed.
 *      d. Polling and monitoring the deployment status, while reviewing events for any health check failures.
 *
 * 4. **Final Route Update:**
 *    - After a successful deployment:
 *      a. The deprecated AWS Lambda ALB listener rule is removed using the AWS ALB client.
 *      b. A new target group listener rule for the Fargate service is then created or updated—this time with normal priority
 *         (non-deprioritized) so that traffic is properly routed to the newly deployed Fargate service.
 *
 * 5. **State Update:**
 *    - Finally, the function updates the deployment state with the new routing configuration details including the path pattern,
 *      health check path, custom domain (if provided), and the updated ALB listener rule.
 *
 * @param {Object} params - Deployment parameters for AWS Fargate ECS container.
 * @param {Object} params.state - State object containing deployment information.
 * @param {string} params.containerName - Name of the container.
 * @param {Object} params.containerConfig - Container configuration details.
 * @param {string} params.resourceNameBase - Base resource name used for AWS resource naming.
 * @param {boolean} params.force - Flag indicating if the deployment is forced.
 * @param {Object} params.envVars - Environment variables for the container.
 * @param {string} params.customRoleArn - ARN of the custom IAM role.
 * @param {Object} params.awsClients - AWS clients object.
 * @param {boolean} params.hasChangedContainerComputeType - Flag indicating if compute type has changed.
 * @param {boolean} params.hasChangedContainerCode - Flag indicating if code has changed.
 * @param {boolean} params.hasChangedContainerRoutingConfig - Flag indicating if routing config has changed.
 * @param {boolean} params.hasChangedContainerComputeConfig - Flag indicating if compute config has changed.
 * @param {Object} params.containerConfigDiff - Diff of the container config.
 * @returns {Promise<void>}
 */
const deployAwsFargateEcsContainer = async ({
  awsClients,
  force,
  state,
  containerName,
  containerConfig,
  resourceNameBase,
  envVars,
  domain,
  portContainer = 8080,
  routingPathHealthCheck,
  hasChangedContainerComputeType,
  hasChangedContainerCode,
  hasChangedContainerRoutingConfig,
  hasChangedContainerComputeConfig,
  scfForwardToken,
}) => {
  const { awsAlbClient, awsAutoscalingClient } = awsClients

  sclProgress.update(`${containerName}: Deploying AWS Fargate service`)

  logger.debug(
    `${containerName}: Deploying AWS Fargate service w/ these settings: hasChangedContainerComputeType: ${hasChangedContainerComputeType}, hasChangedContainerCode: ${hasChangedContainerCode}, hasChangedContainerRoutingConfig: ${hasChangedContainerRoutingConfig}, hasChangedContainerComputeConfig: ${hasChangedContainerComputeConfig}`,
  )

  /**
   * Validate that the compute type AND routing config are not changing
   * at the same time. Our zero-downtime deployment strategy will not work
   * if they are changing at the same time.
   */
  if (hasChangedContainerComputeType && hasChangedContainerRoutingConfig) {
    throw new ServerlessError(
      'Deployment Failed: Cannot change compute type and routing config at the same time.',
      'ECS_FARGATE_COMPUTE_TYPE_AND_ROUTING_CONFIG_CHANGE',
    )
  }

  /**
   * Optionally deploy the AWS ECS Fargate Service.
   */
  if (
    force ||
    hasChangedContainerComputeType ||
    hasChangedContainerCode ||
    hasChangedContainerComputeConfig ||
    hasChangedContainerRoutingConfig
  ) {
    /**
     * Get the scaling policies from the container config.
     */
    const scalingPoliciesUnprocessed =
      containerConfig.compute?.awsFargateEcs?.scale

    const scalingPoliciesMetadata = {
      min: null,
      max: null,
      desired: null,
      hasTarget: false,
      hasStepPolicy: false,
    }

    if (scalingPoliciesUnprocessed) {
      for (const policy of scalingPoliciesUnprocessed) {
        if (policy.type === 'min') {
          scalingPoliciesMetadata.min = policy.min
        } else if (policy.type === 'max') {
          scalingPoliciesMetadata.max = policy.max
        } else if (policy.type === 'desired') {
          scalingPoliciesMetadata.desired = policy.desired
        } else if (policy.type === 'target') {
          scalingPoliciesMetadata.hasTarget = true
        } else if (policy.type === 'step') {
          scalingPoliciesMetadata.hasStepPolicy = true
        }
      }
    }

    /**
     * For new deployments, if no listener rule exists yet the ECS deplyoment will fail.
     * This creates the rule, but deprioritizes it in case there is an existing rule with the same priority.
     * This would happen if the compute type was changed, and we need to transition from Lambda to Fargate.
     */
    await awsAlbClient.createOrUpdateTargetGroupListenerRule({
      listenerArn:
        state.state.containers[containerName].routing.awsAlb.primaryListenerArn,
      targetGroupArn:
        state.state.containers[containerName].routing.awsAlb
          .targetGroupArnAwsFargateEcs,
      pathPattern: containerConfig.routing?.pathPattern,
      hostHeader: domain ?? undefined,
      deprioritize: true, // Deprioritize the rule so it doesn't conflict with the Lambda rule in a compute swap.
      headers: {
        'x-scf-token': scfForwardToken,
      },
    })

    /**
     * Perform the service deployment.
     */
    await performServiceDeployment({
      awsClients,
      state,
      resourceNameBase,
      containerName,
      containerConfig,
      envVars,
      routingPathHealthCheck,
      portContainer,
      scalingPolicies: scalingPoliciesMetadata,
    })

    /**
     * Sync autoscaling policies for the ECS Fargate service based on project configuration.
     *
     * The sync function:
     *   - Updates the scalable target (min/max capacities) for this service.
     *   - Retrieves all current autoscaling policies.
     *   - Removes any that are not defined in the project config.
     *   - Creates/updates the Target Tracking Scaling policies for CPU and Memory.
     */
    await awsAutoscalingClient.syncAutoscalingPolicies({
      state,
      resourceNameBase,
      containerName,
      scalingPolicies: scalingPoliciesUnprocessed,
    })

    sclProgress.update(`${containerName}: Updating ALB Listener Rule`)

    /**
     * Create or update the Fargate ALB listener rule not deprioritized.
     */
    await awsAlbClient.createOrUpdateTargetGroupListenerRule({
      listenerArn:
        state.state.containers[containerName].routing.awsAlb.primaryListenerArn,
      targetGroupArn:
        state.state.containers[containerName].routing.awsAlb
          .targetGroupArnAwsFargateEcs,
      pathPattern: containerConfig.routing?.pathPattern,
      hostHeader: undefined,
      deprioritize: false,
      headers: {
        'x-scf-token': scfForwardToken,
      },
    })

    // Update the state
    state.state.containers[containerName].routing.pathPattern =
      containerConfig.routing?.pathPattern
    state.state.containers[containerName].routing.pathHealthCheck =
      routingPathHealthCheck
    state.state.containers[containerName].routing.customDomain =
      domain ?? undefined
    state.state.containers[containerName].routing.awsAlb.listenerRules = [
      {
        path: containerConfig.routing?.pathPattern,
        targetGroupArn:
          state.state.containers[containerName].routing.awsAlb
            .targetGroupArnAwsFargateEcs,
        listenerArn:
          state.state.containers[containerName].routing.awsAlb
            .primaryListenerArn,
        hostHeader: domain ?? undefined,
      },
    ]
  }

  // Do not save state here, since it is saved shortly after this returns.
  return
}

/**
 * Deploys the AWS ECS Fargate Service.
 *
 * @param {Object} params - Deployment parameters.
 * @param {Object} params.awsClients - AWS Clients object.
 * @param {Object} params.state - State object containing deployment information.
 * @param {string} params.resourceNameBase - Base resource name used for AWS resource naming.
 * @param {string} params.containerName - Name of the container.
 * @param {Object} params.containerConfig - Container configuration details.
 * @param {Object} params.envVars - Environment variables for the container.
 * @param {string} params.routingPathHealthCheck - The routing path for the health check.
 * @returns {Promise<void>} Resolves when deployment succeeds.
 * @throws {Error|ServerlessError} Throws an error if deployment fails.
 */
const performServiceDeployment = async ({
  awsClients,
  state,
  resourceNameBase,
  containerName,
  containerConfig,
  envVars,
  routingPathHealthCheck,
  portContainer = 8080,
  scalingPolicies,
}) => {
  const { awsEcsClient, awsCloudWatchClient } = awsClients

  logger.debug(`${containerName}: Deploying AWS ECS Fargate Service`)

  /**
   * Get the current running count of the Tasks in the Service.
   * We need this to set the desired count to the current running count.
   * Otherwise, we risk setting the desired count to a number that will
   * be too high or too low, causing the service to not scale and crash.
   */
  const awsServiceState = await awsEcsClient.getService({
    clusterArn: state.state.awsEcs.cluster.arn,
    resourceNameBase,
    containerName,
  })

  const currentRunningCount = awsServiceState
    ? awsServiceState.runningCount
    : null

  /**
   * Determine the desired scaling count.
   * 0 values will be acknowledged, and not overridden.
   */
  scalingPolicies.desired = computeDesiredScaling({
    currentRunningCount,
    desired: scalingPolicies.desired,
    min: scalingPolicies.min,
    max: scalingPolicies.max,
    hasTarget: scalingPolicies.hasTarget,
    hasStepPolicy: scalingPolicies.hasStepPolicy,
  })

  logger.debug(
    `${containerName}: Scaling policies to be reconciled: ${JSON.stringify(scalingPolicies)}`,
  )

  /**
   * For any ECS deployment that changes the task definition (like updating
   * container images, environment variables, task size, etc.), you need to
   * register a new task definition first.
   */
  const taskDefinition = await awsEcsClient.registerTaskDefinition({
    resourceNameBase,
    containerName,
    imageUri:
      state.state.containers[containerName].compute.awsFargateEcs.imageUri,
    executionRoleArn:
      state.state.containers[containerName].compute.awsIam.executionRoleArn,
    taskRoleArn:
      state.state.containers[containerName].compute.awsIam.taskRoleArn,
    region: awsClients.region,
    environment: envVars,
    taskDefinitionConfig: {
      cpu: containerConfig.compute.awsFargateEcs?.cpu || 256,
      memory: containerConfig.compute.awsFargateEcs?.memory || 512,
    },
  })

  /**
   * Create or update the Fargate Service.
   */
  await awsEcsClient.createOrUpdateFargateService({
    clusterArn: state.state.awsEcs.cluster.arn,
    taskDefinitionArn: taskDefinition.taskDefinitionArn,
    port: portContainer,
    resourceNameBase,
    containerName,
    subnetIds: state.state.awsVpc.privateSubnets,
    securityGroupIds: [state.state.awsVpc.s2sSecurityGroupId],
    targetGroupArn:
      state.state.containers[containerName].routing.awsAlb
        .targetGroupArnAwsFargateEcs,
    forceNewDeployment: true,
    desiredCount: scalingPolicies.desired,
  })

  /**
   * Get the latest service deployment.
   */
  let currentDeployment = null
  const maxDeploymentAttempts = 20
  let deploymentAttempts = 0

  while (!currentDeployment && deploymentAttempts < maxDeploymentAttempts) {
    currentDeployment = await awsEcsClient.getLatestServiceDeployment({
      resourceNameBase,
      containerName,
      clusterArn: state.state.awsEcs.cluster.arn,
      statusArray: ['IN_PROGRESS', 'PENDING'],
    })
    if (!currentDeployment) {
      deploymentAttempts++
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  if (!currentDeployment) {
    throw new Error(
      `${containerName}: Unable to fetch current deployment after ${maxDeploymentAttempts} attempts.`,
    )
  }

  const serviceDeploymentArn = currentDeployment.serviceDeploymentArn
  const serviceArn = currentDeployment.serviceArn

  sclProgress.update(`${containerName}: Deploying Service Tasks`)

  /**
   * Poll Service until it is ready or it fails.
   */
  const maxAttempts = 90 // 90 * 10 seconds = 900 seconds = 15 minutes
  const attemptInterval = 10000 // 10 seconds
  const minutesAttempted = (maxAttempts * attemptInterval) / 60000
  let attempts = 0
  let isServiceReady = false
  let hasMetDesiredCountBefore = false
  let serviceLogGroupName = null
  while (!isServiceReady && attempts < maxAttempts) {
    // Check the status of the service deployment, retrieved concurrently.
    const [currentDeploymentDetails, currentServiceDetails] = await Promise.all(
      [
        awsEcsClient.getServiceDeploymentDetails({ serviceDeploymentArn }),
        awsEcsClient.getService({
          clusterArn: state.state.awsEcs.cluster.arn,
          resourceNameBase,
          containerName,
        }),
      ],
    )

    // If the deployment is successful, we can break out of the loop.
    if (currentDeploymentDetails.status === 'SUCCESSFUL') {
      isServiceReady = true
      break
    }

    serviceLogGroupName =
      taskDefinition.containerDefinitions?.[0]?.logConfiguration?.options?.[
        'awslogs-group'
      ] || null
    const desiredCount = scalingPolicies.desired
    const runningCount =
      currentDeploymentDetails.targetServiceRevision.runningTaskCount
    const pendingCount =
      currentDeploymentDetails.targetServiceRevision.pendingTaskCount
    const failureCount =
      currentDeploymentDetails.deploymentCircuitBreaker?.failureCount || 0

    const exitedTasks = await awsEcsClient.getExitedTasks({
      clusterArn: state.state.awsEcs.cluster.arn,
      resourceNameBase,
      containerName,
    })

    const exitedTasksCount = exitedTasks?.length ?? 0

    logger.debug(
      `${containerName}: Desired count: ${desiredCount}, running count: ${runningCount}, pending count: ${pendingCount}, failure count: ${failureCount}`,
    )

    if (runningCount === desiredCount) {
      hasMetDesiredCountBefore = true
      sclProgress.update(
        `${containerName}: Service Tasks deployed (${runningCount}/${desiredCount}). Performing health checks`,
      )
    } else if (hasMetDesiredCountBefore) {
      sclProgress.update(
        `${containerName}: Deploying Service Tasks again (${runningCount}/${desiredCount}). There might be issues. Check the AWS ECS Fargate Service Logs.`,
      )
    } else if (exitedTasksCount > 0) {
      sclProgress.update(
        `${containerName}: Deploying Service Tasks again (${runningCount}/${desiredCount}). Received: ${exitedTasks[0].stoppedReason}, There might be issues. Check the AWS ECS Fargate Service Logs.`,
      )
    } else {
      sclProgress.update(
        `${containerName}: Deploying Service Tasks (${runningCount}/${desiredCount})`,
      )
    }

    /**
     * Review the events for the service deployment.
     * Getting deployment failures from AWS ECS Fargate is tricky because there are so many
     * situations that can cause a deployment to fail.
     * So, we try to identify errors by looking at the events for the service deployment.
     * Then give users helpful information to resolve them.
     */
    await identifyDeploymentFailureToFargateEcs({
      currentServiceDetails,
      resourceNameBase,
      containerName,
      routingPathHealthCheck,
      serviceLogGroupName,
      awsCloudWatchClient,
      portContainer,
    })

    attempts++
    await new Promise((resolve) => setTimeout(resolve, 10000))
  }

  if (!isServiceReady) {
    // Attempt to fetch and print logs before throwing the error
    if (serviceLogGroupName) {
      try {
        const recentLogs = await awsCloudWatchClient.getRecentLogs({
          logGroupName: serviceLogGroupName,
          limit: 50,
          startTime: Date.now() - minutesAttempted * 60 * 1000,
        })

        if (recentLogs.length > 0) {
          // Pretty print the logs
          logger.error(
            `${containerName}: Recent Logs - Beginning: -------------------------\n\n${awsCloudWatchClient.prettyPrintLogs({ logs: recentLogs })}\n\n${containerName}: Recent Logs - Ending: ----------------------------`,
          )
        }
      } catch (logError) {
        logger.error(
          `${containerName}: Failed to retrieve logs: ${logError.message}`,
        )
      }
    }

    throw new Error(
      `${containerName}: Service failed to deploy after ${minutesAttempted} minutes.`,
    )
  }
}

/**
 * Computes the desired scaling count based on the current running count and provided constraints.
 *
 * This function determines the scaling count according to the following rules:
 * - When either targetOne or targetTwo is set, the "desired" value is ignored. Instead, the function
 *   attempts to maintain the current running count within any provided min/max limits.
 * - If the current running count is within the specified min and max,
 *   it is returned directly. If it falls outside this range, the nearest bound is applied.
 * - If neither targets are set, but an explicit "desired" is provided, that value is used.
 * - If not enough information is provided (i.e. no desired, min, or max), a fallback value of 1 is used.
 *
 * @param {Object} params - Parameters for computing the desired scaling.
 * @param {number|null} params.currentRunningCount - The current number of running tasks; may be null.
 * @param {number|null} params.min - The minimum allowed scaling count.
 * @param {number|null} params.max - The maximum allowed scaling count.
 * @param {number|null} params.desired - The legacy desired scaling count (if explicitly set).
 * @param {boolean} params.hasTarget - Indicates at least one target policy is set
 * @param {boolean} params.hasStepPolicy - Indicates at least one step scaling policy is set
 * @returns {number} - The computed desired scaling count.
 */
const computeDesiredScaling = ({
  currentRunningCount = null,
  min,
  max,
  desired,
  hasTarget,
  hasStepPolicy,
}) => {
  /**
   * When either a target or step policy is present, we ignore the explicit "desired"
   * value and try to maintain the current running count within the provided min/max constraints.
   */
  if (hasTarget || hasStepPolicy) {
    // Without both min and max values, we fallback to the current running count (or default to 1 if unknown).
    if (min === null || max === null) {
      return currentRunningCount === null ? 1 : currentRunningCount
    }
    // If the current running count is within the accepted limits, return it.
    if (currentRunningCount >= min && currentRunningCount <= max) {
      return currentRunningCount === null ? 1 : currentRunningCount
    }
    // If the current running count is below the minimum, enforce the minimum.
    if (currentRunningCount < min) {
      return min
    }
    // If the current running count exceeds the maximum, enforce the maximum.
    if (currentRunningCount > max) {
      return max
    }
  }

  // When targets are not set and an explicit "desired" value exists, prefer that value.
  if (desired !== undefined && desired !== null) {
    return desired
  }

  // If explicit "desired" is missing and no limits are specified, default the scaling count to 1.
  if (
    (desired === null || desired === undefined) &&
    (min === null || min === undefined) &&
    (max === null || max === undefined)
  ) {
    return 1
  }

  if (min == null && max == null) {
    // When both min and max constraints are omitted, return the current running count, or default to 1.
    return currentRunningCount === null ? 1 : currentRunningCount
  }

  if (min != null && max != null) {
    // When both minimum and maximum constraints are provided:
    if (
      currentRunningCount !== null &&
      currentRunningCount >= min &&
      currentRunningCount <= max
    ) {
      // If current count is within the range, maintain it.
      return currentRunningCount
    }
    if (currentRunningCount === null) {
      // If the current count is unknown, default to the minimum value.
      return min
    }

    // Otherwise, choose the bound (min or max) that is nearest to the current running count.
    const distanceToMin = Math.abs(currentRunningCount - min)
    const distanceToMax = Math.abs(currentRunningCount - max)
    return distanceToMin <= distanceToMax ? min : max
  }

  if (min != null) {
    // When only a minimum constraint is provided, ensure that the count is not below this minimum.
    return currentRunningCount === null
      ? min
      : currentRunningCount < min
        ? min
        : currentRunningCount
  }

  // When only a maximum constraint is provided:
  // If the current count is unknown, default to 1; otherwise, use the current running count.
  return currentRunningCount === null ? 1 : currentRunningCount
}

/**
 * Identifies deployment failure conditions in AWS ECS Fargate service deployment events.
 *
 * This function inspects the deployment events from the current service details and checks for instances where
 * the deployment is reported as unhealthy due to health check failures. If such an issue is found, the function
 * fetches and logs recent CloudWatch logs (if available) and then throws a ServerlessError with a descriptive error message.
 *
 * @param {Object} params - Parameters object.
 * @param {Object} params.currentServiceDetails - The ECS service details containing deployments and events.
 * @param {string} params.containerName - Name of the container.
 * @param {string} params.routingPathHealthCheck - The routing path used for health checks.
 * @param {string|null} params.serviceLogGroupName - The CloudWatch log group name to fetch recent logs from.
 * @param {Object} params.awsCloudWatchClient - AWS CloudWatch client with methods to retrieve and pretty-print logs.
 * @param {number} params.portContainer - The port number of the container.
 * @throws {ServerlessError} Throws an error if the health check failure is detected from the deployment events.
 * @returns {Promise<void>}
 */
const identifyDeploymentFailureToFargateEcs = async ({
  currentServiceDetails,
  resourceNameBase,
  containerName,
  routingPathHealthCheck,
  serviceLogGroupName,
  awsCloudWatchClient,
  portContainer,
}) => {
  // Get the current (aka primary) deployment
  const primaryDeployment = currentServiceDetails.deployments.find(
    (deployment) => deployment.status === 'PRIMARY',
  )
  const deploymentCreated = new Date(primaryDeployment.createdAt)

  /**
   * Loop through the currentServiceDetails.events
   * These are short messages that status or a problem.
   * We look for specific messages that indicate a problem.
   */
  for (const event of currentServiceDetails.events) {
    let foundError = null

    // Only look at events created after the deployment was created.
    const eventCreated = new Date(event.createdAt)
    if (eventCreated <= deploymentCreated) {
      continue
    }

    event.message = event.message ? event.message.toLowerCase() : ''

    /**
     * Look for a health check failure message that indicates a port misconfiguration.
     * Detects any message matching "port <number> is unhealthy in target-group"
     */
    if (
      event.message.includes('is unhealthy in') &&
      event.message.includes('(port') &&
      event.message.includes('health checks failed')
    ) {
      foundError = new ServerlessError(
        `${containerName}: Deployment Failed: Your container is not listening on port "${portContainer}". No traffic disruption. The service will roll back automatically in a few minutes. To fix, ensure the server in your container listens on port "${portContainer}", ensure "routing.pathHealthCheck" is configured on your container, returns a 200 status and redeploy. Review the above Service logs for more details.`,
        'AWS_ECS_TARGET_GROUP_UNHEALTHY_PORT_MISCONFIGURED',
        { stack: false },
      )
    }

    /**
     * Look for any health check failure messages.
     */
    if (
      event.message.includes('is unhealthy in') &&
      event.message.includes('health checks failed with these codes')
    ) {
      foundError = new ServerlessError(
        `${containerName}: Deployment Failed: Health check endpoint "${routingPathHealthCheck}" returned a non-200 status. No traffic disruption. The service will roll back automatically in a few minutes. To fix, ensure "routing.pathHealthCheck" is configured on your container, returns a 200 status and redeploy. A healthcheck endpoint is required, so if it is not configured, SCF is automatically providing a default health check endpoint, which might be causing this issue.`,
        'AWS_ECS_TARGET_GROUP_UNHEALTHY',
        { stack: false },
      )
    }

    if (event.message.includes('container in task exited')) {
      foundError = new ServerlessError(
        `${containerName}: Deployment Failed: Your container exited. No traffic disruption. The service will roll back automatically in a few minutes. To fix, ensure your container does not exit and redeploy. Review the above Service logs for more details.`,
        'AWS_ECS_CONTAINER_EXITED',
        { stack: false },
      )
    }

    /**
     * If an error was found, attempt to fetch logs, and show them
     * before the error is thrown.
     */
    if (foundError && serviceLogGroupName) {
      try {
        const recentLogs = await awsCloudWatchClient.getRecentLogs({
          logGroupName: serviceLogGroupName,
          limit: 50,
          startTime: deploymentCreated.getTime(),
        })

        if (recentLogs.length > 0) {
          // Pretty print the logs
          logger.error(
            `${containerName}: Recent Logs - Beginning: -------------------------\n\n${awsCloudWatchClient.prettyPrintLogs({ logs: recentLogs })}\n\n${containerName}: Recent Logs - Ending: ----------------------------`,
          )
        }
      } catch (err) {}
    }

    /**
     * If an error was found, throw it.
     */
    if (foundError) {
      throw foundError
    }

    /**
     * Otherwise, do nothing.
     * TODO: Find more failure scenarios and handle them.
     */
  }
}

export {
  deployAwsFargateEcsContainer as default,
  deployAwsFargateEcsContainer,
  computeDesiredScaling,
  performServiceDeployment,
  identifyDeploymentFailureToFargateEcs,
}
