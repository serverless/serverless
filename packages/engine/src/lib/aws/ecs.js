import {
  ECSClient as AwsSdkEcsClient,
  DescribeClustersCommand,
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  UpdateServiceCommand,
  DescribeServicesCommand,
  ServiceNotFoundException,
  DeleteServiceCommand,
  ListServicesCommand,
  DeleteClusterCommand,
  ResourceNotFoundException,
  DescribeTaskDefinitionCommand,
  ListServiceDeploymentsCommand,
  DescribeServiceDeploymentsCommand,
  ListTasksCommand,
  DescribeTasksCommand,
} from '@aws-sdk/client-ecs'
import { setTimeout } from 'node:timers/promises'
import { ServerlessError, log, addProxyToAwsClient } from '@serverless/util'
import { sub } from 'date-fns'

const logger = log.get('aws:ecs')

export class AwsEcsClient {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(new AwsSdkEcsClient({ ...awsConfig }))
  }

  /**
   * Gets or creates a cluster.
   * @param {string} resourceNameBase - The resourceNameBase of the cluster.
   * @returns {Promise<string>} - The ARN of the cluster.
   */
  async getOrCreateCluster(resourceNameBase) {
    const clusterName = `${resourceNameBase}`
    try {
      const describeClusterResponse = await this.client.send(
        new DescribeClustersCommand({ clusters: [clusterName] }),
      )
      if (
        describeClusterResponse.clusters &&
        describeClusterResponse.clusters.length > 0 &&
        describeClusterResponse.clusters[0].status === 'ACTIVE'
      ) {
        logger.debug('Retrieved ECS Cluster')
        return describeClusterResponse.clusters[0].clusterArn
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        logger.debug(`Cluster ${clusterName} not found, creating a new one`)
      } else {
        throw error
      }
    }

    const command = new CreateClusterCommand({ clusterName })
    const response = await this.client.send(command)
    return response.cluster.clusterArn
  }

  /**
   * Gets details of a specific ECS service.
   * @param {Object} params - The parameters object.
   * @param {string} params.cluster - The cluster identifier (name or ARN) where the service is hosted.
   * @param {string} params.serviceName - The fully qualified name of the ECS service.
   * @returns {Promise<Object|null>} - The ECS service details if found, otherwise null.
   */
  async getService({ clusterArn, resourceNameBase, containerName }) {
    const serviceName = `${resourceNameBase}-${containerName}`
    try {
      const describeServiceResponse = await this.client.send(
        new DescribeServicesCommand({
          cluster: clusterArn,
          services: [serviceName],
        }),
      )

      const service = describeServiceResponse.services?.[0]
      if (!service) {
        logger.debug(`Service ${serviceName} not found in cluster ${clusterArn}`)
        return null
      }
      return service
    } catch (error) {
      const name = error.name
      if (
        error instanceof ServiceNotFoundException ||
        name === 'ServiceNotFoundException'
      ) {
        logger.debug(`Service ${serviceName} not found in cluster ${clusterArn}`)
        return null
      }
      throw error
    }
  }

  /**
   * Deletes a cluster if it is empty.
   * @param {string} resourceNameBase - The resourceNameBase of the cluster.
   * @returns {Promise<void>}
   */
  async deleteClusterIfEmpty(resourceNameBase) {
    const clusterName = `${resourceNameBase}`
    try {
      // Check if the cluster exists
      const describeClusterResponse = await this.client.send(
        new DescribeClustersCommand({ clusters: [clusterName] }),
      )

      if (
        describeClusterResponse.clusters &&
        describeClusterResponse.clusters.length > 0
      ) {
        // Cluster exists, check for services
        const listServicesResponse = await this.client.send(
          new ListServicesCommand({ cluster: clusterName }),
        )

        if (
          listServicesResponse.serviceArns &&
          listServicesResponse.serviceArns.length === 0
        ) {
          // No services in the cluster, delete it
          await this.client.send(
            new DeleteClusterCommand({ cluster: clusterName }),
          )
          logger.debug(`Deleted empty cluster: ${clusterName}`)
        } else {
          logger.debug(`Cluster ${clusterName} has services, not deleting`)
        }
      } else {
        logger.debug(`Cluster ${clusterName} does not exist`)
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        logger.debug(`Cluster ${clusterName} does not exist`)
        return
      }
      throw error
    }
  }

  /**
   * Gets the most recent task definition for a service.
   * @param {string} resourceNameBase - The resourceNameBase of the service.
   * @param {string} serviceName - The name of the service.
   * @returns {Promise<Object|null>} - The task definition if found, otherwise null.
   */
  async getMostRecentTaskDefinition({ resourceNameBase, serviceName }) {
    const family = `${resourceNameBase}-${serviceName}`
    const describeTaskDefinitionCommand = new DescribeTaskDefinitionCommand({
      taskDefinition: family,
    })
    try {
      const describeTaskDefinitionResponse = await this.client.send(
        describeTaskDefinitionCommand,
      )
      if (describeTaskDefinitionResponse.taskDefinition?.taskDefinitionArn) {
        return describeTaskDefinitionResponse.taskDefinition
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        return null
      }
      throw error
    }
  }

  /**
   * Registers a task definition for a service
   * @param {string} resourceNameBase - The resourceNameBase
   * @param {string} serviceName - The name of the service
   * @param {{ cpu?: number, memory?: number }} taskDefinitionConfig - The task definition configuration
   * @param {string} imageUri - The URI of the container image
   * @param {string} executionRoleArn - The ARN of the execution role
   * @param {string} region - The region of the service
   * @param {object} environment - The environment variables for the task definition
   * @returns {Promise<object>} - The task definition
   */
  async registerTaskDefinition({
    resourceNameBase,
    containerName,
    taskDefinitionConfig,
    imageUri,
    executionRoleArn,
    taskRoleArn,
    region,
    environment,
  }) {
    const serviceName = `${resourceNameBase}-${containerName}`

    logger.debug(
      `${serviceName}: Registering task definition with config "${JSON.stringify(taskDefinitionConfig)}"`,
    )

    const registerTaskDefinitionCommand = new RegisterTaskDefinitionCommand({
      family: serviceName,
      requiresCompatibilities: ['FARGATE'],
      networkMode: 'awsvpc',
      cpu: `${taskDefinitionConfig?.cpu ?? 256}`,
      memory: `${taskDefinitionConfig?.memory ?? 512}`,
      executionRoleArn,
      taskRoleArn,
      runtimePlatform: {
        cpuArchitecture: taskDefinitionConfig?.cpuArchitecture,
      },
      containerDefinitions: [
        {
          name: serviceName,
          image: imageUri,
          portMappings: [
            {
              containerPort: taskDefinitionConfig?.port ?? 8080,
            },
          ],
          environment: Object.entries(environment ?? []).map(
            ([name, value]) => ({ name, value }),
          ),
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-region': region,
              'awslogs-group': `/aws/ecs/${resourceNameBase}-${containerName}-fargate`,
              'awslogs-create-group': 'true',
              'awslogs-stream-prefix': serviceName,
            },
          },
        },
      ],
    })

    let registerTaskDefinitionResponse
    try {
      registerTaskDefinitionResponse = await this.client.send(
        registerTaskDefinitionCommand,
      )
    } catch (error) {
      throw new ServerlessError(
        `Failed to register task definition for ${serviceName}: ${error.message}`,
        'AWS_ECS_FAILED_TO_REGISTER_TASK_DEFINITION',
      )
    }

    if (!registerTaskDefinitionResponse.taskDefinition?.taskDefinitionArn) {
      throw new ServerlessError(
        'Failed to register task definition',
        'AWS_ECS_FAILED_TO_REGISTER_TASK_ARN',
      )
    }

    logger.debug(
      `${serviceName}: Registered task definition with ARN "${registerTaskDefinitionResponse.taskDefinition.taskDefinitionArn}"`,
    )

    return registerTaskDefinitionResponse.taskDefinition
  }

  /**
   * Creates a Fargate service
   * @param {string} clusterArn - The ARN of the cluster
   * @param {string} taskDefinitionArn - The ARN of the task definition
   * @param {number} port - The port of the service
   * @param {string} resourceNameBase - The resourceNameBase of the service
   * @param {string} serviceName - The name of the service
   * @param {string[]} subnetIds - The IDs of the subnets
   * @param {string[]} securityGroupIds - The IDs of the security groups
   * @param {string} targetGroupArn - The ARN of the target group
   * @returns {Promise<string>} - The ARN of the service
   **/
  async createFargateService({
    clusterArn,
    taskDefinitionArn,
    port,
    resourceNameBase,
    containerName,
    subnetIds,
    securityGroupIds,
    targetGroupArn,
    desiredCount = 1,
  }) {
    logger.debug(
      `Creating Fargate service "${resourceNameBase}-${containerName}" in cluster "${clusterArn}"`,
    )

    const createServiceCommand = new CreateServiceCommand({
      cluster: clusterArn,
      serviceName: `${resourceNameBase}-${containerName}`,
      taskDefinition: taskDefinitionArn,
      desiredCount,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: subnetIds,
          securityGroups: securityGroupIds,
          assignPublicIp: 'ENABLED',
        },
      },
      loadBalancers: [
        {
          targetGroupArn,
          containerName: `${resourceNameBase}-${containerName}`,
          containerPort: port ?? 8080,
        },
      ],
      deploymentConfiguration: {
        deploymentCircuitBreaker: {
          enable: true,
          rollback: true,
        },
        // These can affect deployment speed, but at the cost of availability.
        // These are set to industry-wide defaults.
        minimumHealthyPercent: 100,
        maximumPercent: 200,
      },
      healthCheckGracePeriodSeconds: 5,
    })

    let createServiceResponse
    try {
      createServiceResponse = await this.client.send(createServiceCommand)
    } catch (error) {
      throw new ServerlessError(
        `Failed to create Fargate service "${resourceNameBase}-${containerName}": ${error.message}`,
        'AWS_ECS_FAILED_TO_CREATE_FARGATE_SERVICE',
      )
    }
    if (!createServiceResponse.service?.serviceArn) {
      throw new ServerlessError(
        'Failed to create Fargate service',
        'AWS_ECS_FAILED_TO_CREATE_FARGATE_SERVICE',
      )
    }
    return createServiceResponse.service.serviceArn
  }

  /**
   * Removes a Fargate service
   * @param {Object} params - The parameters for removing the Fargate service
   * @param {string} params.serviceName - The name of the service
   * @param {string} params.resourceNameBase - The resourceNameBase of the service
   * @returns {Promise<void>}
   */
  async removeFargateService({ containerName, resourceNameBase }) {
    await this.stopFargateService({
      clusterArn: `${resourceNameBase}`,
      resourceNameBase,
      containerName,
      waitForDrain: true,
    })
    logger.debug(
      `Stopped Fargate service "${containerName}" in cluster "${resourceNameBase}"`,
    )
    try {
      const describeServiceResponse = await this.client.send(
        new DescribeServicesCommand({
          services: [`${resourceNameBase}-${containerName}`],
          cluster: `${resourceNameBase}`,
        }),
      )
      const serviceArn = describeServiceResponse.services?.[0]?.serviceArn
      if (serviceArn) {
        await this.client.send(
          new DeleteServiceCommand({
            cluster: `${resourceNameBase}`,
            service: `${resourceNameBase}-${containerName}`,
          }),
        )
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ServiceNotFoundException ||
        name === 'ServiceNotFoundException'
      ) {
        logger.debug(
          `Service ${resourceNameBase}-${containerName} not found, skipping delete`,
        )
        return
      }
      throw error
    }
  }

  /**
   * Updates a Fargate service
   * @param {Object} params - The parameters for updating the Fargate service
   * @param {string} params.clusterArn - The ARN of the cluster
   * @param {string} params.taskDefinitionArn - The ARN of the task definition
   * @param {string} params.resourceNameBase - The resourceNameBase of the service
   * @param {string} params.containerName - The name of the service
   * @param {number} params.port - The port of the service
   * @param {string} params.targetGroupArn - The ARN of the target group
   * @param {string[]} params.subnetIds - The IDs of the subnets
   * @param {string[]} params.securityGroupIds - The IDs of the security groups
   * @param {number} [params.desiredCount] - Optional desired count of the service
   **/
  async updateFargateService({
    clusterArn,
    taskDefinitionArn,
    resourceNameBase,
    containerName,
    port,
    targetGroupArn,
    subnetIds,
    securityGroupIds,
    desiredCount = null,
    forceNewDeployment = true,
  }) {
    const serviceName = `${resourceNameBase}-${containerName}`

    logger.debug(
      `${serviceName}: Updating Fargate service in cluster "${clusterArn}"`,
    )

    const updateServiceParams = {
      cluster: clusterArn,
      service: serviceName,
      taskDefinition: taskDefinitionArn,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: subnetIds,
          securityGroups: securityGroupIds,
          assignPublicIp: 'ENABLED',
        },
      },
      loadBalancers: [
        {
          targetGroupArn,
          containerName: serviceName,
          containerPort: port ?? 8080,
        },
      ],
      // Always enable the circuit breaker and rollback.
      deploymentConfiguration: {
        deploymentCircuitBreaker: {
          enable: true,
          rollback: true,
        },
        // These can affect deployment speed, but at the cost of availability.
        // These are set to industry-wide defaults.
        minimumHealthyPercent: 100,
        maximumPercent: 200,
      },
      healthCheckGracePeriodSeconds: 5,
      forceNewDeployment,
    }

    // Only include desiredCount if explicitly specified
    if (typeof desiredCount === 'number') {
      updateServiceParams.desiredCount = desiredCount
    }

    const updateServiceCommand = new UpdateServiceCommand(updateServiceParams)
    try {
      return await this.client.send(updateServiceCommand)
    } catch (error) {
      throw new ServerlessError(
        `Failed to update Fargate service "${serviceName}": ${error.message}`,
        'AWS_ECS_FAILED_TO_UPDATE_FARGATE_SERVICE',
      )
    }
  }

  /**
   * Stops a Fargate service by setting the desired count to 0
   * @param {string} clusterArn - The ARN of the cluster
   * @param {string} containerName - The name of the service
   * @param {string} resourceNameBase - The resourceNameBase
   **/
  async stopFargateService({
    clusterArn,
    containerName,
    resourceNameBase,
    waitForDrain = false,
  }) {
    try {
      logger.debug(
        `Stopping Fargate service "${containerName}" in cluster "${clusterArn}"`,
      )

      await this.client.send(
        new UpdateServiceCommand({
          cluster: clusterArn,
          service: `${resourceNameBase}-${containerName}`,
          desiredCount: 0,
        }),
      )

      if (waitForDrain) {
        // Wait for the service to drain
        const maxAttempts = 30
        const delay = 10000 // 10 seconds
        let attempts = 0

        while (attempts < maxAttempts) {
          const describeServicesResponse = await this.client.send(
            new DescribeServicesCommand({
              services: [`${resourceNameBase}-${containerName}`],
              cluster: clusterArn,
            }),
          )

          const service = describeServicesResponse.services?.[0]

          if (service && service.runningCount === 0) {
            logger.debug(`Service ${containerName} has been drained`)
            break
          }

          logger.debug(
            `Waiting for service ${containerName} to drain. Running count: ${service?.runningCount}`,
          )
          await setTimeout(delay)
          attempts++
        }

        if (attempts === maxAttempts) {
          logger.warn(
            `Service ${containerName} did not fully drain within the expected time`,
          )
        }
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ServiceNotFoundException ||
        name === 'ServiceNotFoundException'
      ) {
        logger.debug(`Service ${containerName} not found`)
      } else {
        logger.debug(`Failed to stop Fargate service: ${error.message}`)
      }
    }
  }

  /**
   * Creates or updates a Fargate service
   * @param {string} clusterArn - The ARN of the cluster
   * @param {string} taskDefinitionArn - The ARN of the task definition
   * @param {string} resourceNameBase - The resourceNameBase
   * @param {string} serviceName - The name of the service
   * @param {number} port - The port of the service
   * @param {string} targetGroupArn - The ARN of the target group
   * @param {string[]} subnetIds - The IDs of the subnets
   * @param {string[]} securityGroupIds - The IDs of the security groups
   * @param {string} computeType - The type of compute to use
   **/
  async createOrUpdateFargateService({
    clusterArn,
    taskDefinitionArn,
    resourceNameBase,
    containerName,
    port,
    targetGroupArn,
    subnetIds,
    securityGroupIds,
    forceNewDeployment = true,
    desiredCount = 1,
  }) {
    logger.debug(
      `Creating or updating Fargate service "${resourceNameBase}-${containerName}" in cluster "${clusterArn}"`,
    )

    let describeServiceResponse
    try {
      describeServiceResponse = await this.client.send(
        new DescribeServicesCommand({
          services: [`${resourceNameBase}-${containerName}`],
          cluster: clusterArn,
        }),
      )
    } catch (error) {
      const name = error.name
      if (
        error instanceof ServiceNotFoundException ||
        name === 'ServiceNotFoundException'
      ) {
        describeServiceResponse = { services: [] }
      } else {
        throw error
      }
    }
    const serviceArn = describeServiceResponse.services?.[0]?.serviceArn
    if (
      serviceArn &&
      describeServiceResponse.services?.[0]?.status === 'ACTIVE'
    ) {
      return await this.updateFargateService({
        clusterArn,
        taskDefinitionArn,
        resourceNameBase,
        containerName,
        port,
        targetGroupArn,
        subnetIds,
        securityGroupIds,
        desiredCount,
        forceNewDeployment,
      })
    } else {
      return await this.createFargateService({
        clusterArn,
        taskDefinitionArn,
        resourceNameBase,
        containerName,
        port,
        targetGroupArn,
        subnetIds,
        securityGroupIds,
        desiredCount,
      })
    }
  }

  /**
   * Gets the latest service deployment
   * @param {Object} params - The parameters object.
   * @param {string} params.resourceNameBase - The base name for resources.
   * @param {string} params.containerName - The container name.
   * @param {string} params.clusterArn - The ARN of the cluster.
   * @param {string[]} [params.statusArray] - Optional list of statuses to filter by.
   * @returns {Promise<Object|null>} - The latest service deployment object or null if not found.
   */
  async getLatestServiceDeployment({
    resourceNameBase,
    containerName,
    clusterArn,
    statusArray = null,
  } = {}) {
    const serviceName = `${resourceNameBase}-${containerName}`
    const params = {
      service: serviceName,
      cluster: clusterArn,
      createdAt: {
        after: sub(new Date(), { minutes: 3 }),
      },
    }

    if (statusArray) {
      params.status = statusArray
    }

    try {
      const res = await this.client.send(
        new ListServiceDeploymentsCommand(params),
      )
      return res.serviceDeployments?.[0] || null
    } catch (error) {
      const name = error.name
      if (
        error instanceof ServiceNotFoundException ||
        name === 'ServiceNotFoundException'
      ) {
        logger.debug(`Service ${serviceName} not found`)
        return null
      }
      throw error
    }
  }

  /**
   * Gets the most recent service failure event
   * @param {string} serviceArn - The ARN of the service
   * @returns {Promise<string>} - The most recent service failure event
   */
  async getMostRecentServiceFailureEvent(serviceArn) {
    try {
      const describeServiceResponse = await this.client.send(
        new DescribeServicesCommand({
          services: [serviceArn],
          cluster: serviceArn.split('/')[1],
        }),
      )

      logger.debug(
        `Getting most recent service failure event for service "${serviceArn}"`,
        describeServiceResponse,
      )

      const service = describeServiceResponse.services?.[0]
      if (service && service.events?.length > 0) {
        const events = service.events.filter((event) => {
          return event.message.includes('is unhealthy in (target-group')
        })

        if (events.length > 0) {
          return events[0].message
        }
      }
    } catch (error) {
      const name = error.name
      if (
        error instanceof ServiceNotFoundException ||
        name === 'ServiceNotFoundException'
      ) {
        logger.debug(`Service ${serviceArn} not found`)
        return undefined
      }
      throw error
    }
  }

  /**
   * Gets the most recent deployment
   * @param {string} serviceDeploymentArn - The ARN of the service deployment
   * @returns {Promise<object>} - The most recent deployment
   */
  async getServiceDeploymentDetails({ serviceDeploymentArn } = {}) {
    if (!serviceDeploymentArn) {
      throw new ServerlessError(
        'Service deployment ARN is required',
        'AWS_ECS_SERVICE_DEPLOYMENT_ARN_REQUIRED',
      )
    }

    const describeDeploymentResponse = await this.client.send(
      new DescribeServiceDeploymentsCommand({
        serviceDeploymentArns: [serviceDeploymentArn],
      }),
    )

    if (
      !describeDeploymentResponse.serviceDeployments ||
      describeDeploymentResponse.serviceDeployments.length === 0
    ) {
      return null
    }

    return describeDeploymentResponse.serviceDeployments[0]
  }

  /**
   * Gets tasks that have exited unexpectedly in the current active ECS deployment
   * @param {Object} params - The parameters object.
   * @param {string} params.clusterArn - The ARN of the cluster.
   * @param {string} params.resourceNameBase - The base name for resources.
   * @param {string} params.containerName - The container name.
   * @param {number} [params.maxResults] - Maximum number of tasks to return (default: 10).
   * @returns {Promise<Object[]>} - Array of unexpectedly exited task objects with details.
   */
  async getExitedTasks({
    clusterArn,
    resourceNameBase,
    containerName,
    maxResults = 10,
  }) {
    const serviceName = `${resourceNameBase}-${containerName}`

    logger.debug(
      `Getting unexpectedly exited tasks for service "${serviceName}" in cluster "${clusterArn}"`,
    )

    try {
      // First, get the current service details to identify the active deployment
      const service = await this.getService({
        clusterArn,
        resourceNameBase,
        containerName,
      })

      if (!service) {
        logger.debug(`Service "${serviceName}" not found`)
        return []
      }

      // Find the primary (current) deployment
      const primaryDeployment = service.deployments?.find(
        (deployment) => deployment.status === 'PRIMARY',
      )

      if (!primaryDeployment) {
        logger.debug(`No primary deployment found for service "${serviceName}"`)
        return []
      }

      const deploymentId = primaryDeployment.id
      logger.debug(
        `Found primary deployment "${deploymentId}" for service "${serviceName}"`,
      )

      // List stopped tasks for the service
      const listTasksResponse = await this.client.send(
        new ListTasksCommand({
          cluster: clusterArn,
          serviceName,
          desiredStatus: 'STOPPED',
          maxResults: maxResults * 2, // Get more to filter later
        }),
      )

      if (
        !listTasksResponse.taskArns ||
        listTasksResponse.taskArns.length === 0
      ) {
        logger.debug(`No stopped tasks found for service "${serviceName}"`)
        return []
      }

      // Get detailed information about the stopped tasks
      const describeTasksResponse = await this.client.send(
        new DescribeTasksCommand({
          cluster: clusterArn,
          tasks: listTasksResponse.taskArns,
        }),
      )

      if (
        !describeTasksResponse.tasks ||
        describeTasksResponse.tasks.length === 0
      ) {
        logger.debug(
          `No task details found for stopped tasks in service "${serviceName}"`,
        )
        return []
      }

      // Filter for tasks from the current deployment that exited unexpectedly
      const unexpectedlyExitedTasks = describeTasksResponse.tasks
        .filter((task) => {
          // Only include tasks from the current deployment
          const isFromCurrentDeployment = task.startedBy?.includes(deploymentId)
          if (!isFromCurrentDeployment) {
            return false
          }

          // Check if the task exited unexpectedly
          return this.isUnexpectedExit(task)
        })
        .slice(0, maxResults) // Limit to requested number
        .map((task) => {
          const exitedTask = {
            taskArn: task.taskArn,
            taskDefinitionArn: task.taskDefinitionArn,
            lastStatus: task.lastStatus,
            desiredStatus: task.desiredStatus,
            createdAt: task.createdAt,
            startedAt: task.startedAt,
            stoppedAt: task.stoppedAt,
            stopCode: task.stopCode,
            stoppedReason: task.stoppedReason,
            healthStatus: task.healthStatus,
            startedBy: task.startedBy,
            deploymentId,
            containers: [],
          }

          // Extract container exit information
          if (task.containers) {
            exitedTask.containers = task.containers.map((container) => ({
              name: container.name,
              lastStatus: container.lastStatus,
              exitCode: container.exitCode,
              reason: container.reason,
              healthStatus: container.healthStatus,
            }))
          }

          return exitedTask
        })

      logger.debug(
        `Found ${unexpectedlyExitedTasks.length} unexpectedly exited tasks from current deployment "${deploymentId}" for service "${serviceName}"`,
      )

      return unexpectedlyExitedTasks
    } catch (error) {
      logger.error(
        `Failed to get exited tasks for service "${serviceName}": ${error.message}`,
      )
      return []
    }
  }

  /**
   * Determines if a task exited unexpectedly
   * @param {Object} task - The ECS task object
   * @returns {boolean} - True if the task exited unexpectedly
   * @private
   */
  isUnexpectedExit(task) {
    // Check stop codes that indicate unexpected exits
    const unexpectedStopCodes = [
      'TaskFailedToStart',
      'EssentialContainerExited',
      'ResourcesNotAvailable',
      'ProvisioningFailed',
      'InternalError',
      'SpotInterruption',
    ]

    if (task.stopCode && unexpectedStopCodes.includes(task.stopCode)) {
      return true
    }

    // Check container exit codes
    if (task.containers) {
      for (const container of task.containers) {
        // Non-zero exit codes typically indicate errors
        if (container.exitCode && container.exitCode !== 0) {
          return true
        }

        // Check for specific error reasons
        if (container.reason) {
          const errorReasons = [
            'OutOfMemory',
            'ContainerTimeout',
            'CannotPullContainerError',
            'CannotCreateContainerError',
            'CannotStartContainerError',
          ]
          if (
            errorReasons.some((reason) => container.reason.includes(reason))
          ) {
            return true
          }
        }
      }
    }

    // Check stopped reason for specific error patterns
    if (task.stoppedReason) {
      const errorPatterns = [
        'Essential container in task exited',
        'Task failed to start',
        'OutOfMemory',
        'CannotPullContainerError',
        'ResourceInitializationError',
      ]
      if (
        errorPatterns.some((pattern) => task.stoppedReason.includes(pattern))
      ) {
        return true
      }
    }

    // If none of the above conditions are met, consider it a normal exit
    return false
  }
}
