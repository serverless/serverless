import {
  ApplicationAutoScalingClient,
  RegisterScalableTargetCommand,
  DescribeScalingPoliciesCommand,
  PutScalingPolicyCommand,
  DeleteScalingPolicyCommand,
} from '@aws-sdk/client-application-auto-scaling'
import { parse as parseArn } from '@aws-sdk/util-arn-parser'
import { AwsCloudWatchClient } from './cloudwatch.js'
import {
  ServerlessError,
  ServerlessErrorCodes,
  log,
  addProxyToAwsClient,
} from '@serverless/util'

const logger = log.get('aws:autoscaling')

/**
 * AWS Auto Scaling Client to manage autoscaling policies for AWS ECS Fargate services.
 */
export class AwsAutoscalingClient {
  /**
   * Creates an instance of AwsAutoscalingClient.
   *
   * @param {Object} [awsConfig={}] - The AWS configuration options.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new ApplicationAutoScalingClient({ ...awsConfig }),
    )
    this.cloudwatchClient = new AwsCloudWatchClient({ ...awsConfig })
  }

  /**
   * Syncs autoscaling policies for an AWS ECS Fargate service based on the project configuration.
   *
   * This method ensures that only the autoscaling policies defined in the scaling config are applied.
   * It performs the following steps:
   * 1. Updates the scalable target (min and max capacity) for the ECS service.
   * 2. Lists existing scaling policies for the service.
   * 3. Removes any scaling policies that are not defined in the project scaling configuration.
   * 4. Creates or updates target tracking policies for CPU and Memory as specified.
   *
   * Supported autoscaling policies:
   * - Minimum and Maximum capacity (via scalable target).
   * - Target Tracking for CPU utilization.
   * - Target Tracking for Memory utilization.
   * - Step Scaling for custom metrics.
   *
   * @param {Object} params - Parameters for syncing autoscaling policies.
   * @param {string} params.resourceNameBase - The base name for AWS resources.
   * @param {string} params.containerName - The name of the ECS service (container).
   * @param {Object} params.state - Deployment state containing ECS cluster information.
   * @param {Array<Object>} params.scalingPolicies - Scaling configuration from project config.
   * @returns {Promise<void>} Resolves when autoscaling policies have been synchronized.
   */
  async syncAutoscalingPolicies({
    state,
    resourceNameBase,
    containerName,
    scalingPolicies,
  }) {
    logger.debug(scalingPolicies)
    logger.debug(`${containerName}: Syncing autoscaling policies`)
    // Extract cluster name from ECS cluster ARN (expected format: arn:aws:ecs:region:account:cluster/clusterName)
    const clusterArn = state.state.awsEcs.cluster.arn
    const clusterName = clusterArn.split('/').pop()
    const serviceName = `${resourceNameBase}-${containerName}`
    const resourceId = `service/${clusterName}/${serviceName}`

    if (!this.client) {
      throw new Error('ApplicationAutoScalingClient is not available')
    }

    const min = scalingPolicies?.find((p) => p.type === 'min')?.min ?? null
    const max = scalingPolicies?.find((p) => p.type === 'max')?.max ?? null
    const desired =
      scalingPolicies?.find((p) => p.type === 'desired')?.desired ?? null

    await this.client.send(
      new RegisterScalableTargetCommand({
        ServiceNamespace: 'ecs',
        ResourceId: resourceId,
        ScalableDimension: 'ecs:service:DesiredCount',
        MinCapacity: min ?? 1,
        MaxCapacity: max ?? desired ?? 1,
      }),
    )

    const targetScalingPolicies =
      scalingPolicies?.filter((p) => p.type === 'target') ?? []
    const stepScalingPolicies =
      scalingPolicies?.filter((p) => p.type === 'step') ?? []

    logger.debug('targetScalingPolicies', targetScalingPolicies)
    logger.debug('stepScalingPolicies', stepScalingPolicies)

    const targetPolicyNames = await this.#syncTargetScalingPolicies({
      state,
      resourceId,
      containerName,
      targetScalingPolicies,
    })

    const stepPolicyNames = await this.#syncStepScalingPolicies({
      state,
      resourceId,
      containerName,
      stepScalingPolicies,
    })

    // Retrieve current scaling policies for the ECS service.
    const scalingPoliciesResponse = await this.client.send(
      new DescribeScalingPoliciesCommand({
        ServiceNamespace: 'ecs',
        ResourceId: resourceId,
        ScalableDimension: 'ecs:service:DesiredCount',
      }),
    )
    const existingPolicies = scalingPoliciesResponse.ScalingPolicies || []

    const expectedPolicyNames = [...targetPolicyNames, ...stepPolicyNames]
    // Remove any existing policies that are not defined in the project configuration.
    for (const policy of existingPolicies) {
      if (!expectedPolicyNames.includes(policy.PolicyName)) {
        await this.client.send(
          new DeleteScalingPolicyCommand({
            PolicyName: policy.PolicyName,
            ServiceNamespace: 'ecs',
            ResourceId: resourceId,
            ScalableDimension: 'ecs:service:DesiredCount',
          }),
        )
        logger.debug(
          `${containerName}: Removed autoscaling policy: ${policy.PolicyName}`,
        )
      }
    }
  }

  /**
   * Syncs target scaling policies for the ECS service.
   *
   * @param {Object} params - Parameters for the sync operation.
   * @param {Object} params.state - State object containing deployment information.
   * @param {string} params.resourceId - Resource ID of the ECS service.
   * @param {string} params.containerName - Name of the container.
   * @param {Array} params.targetScalingPolicies - Array of target scaling policies.
   * @returns {Promise<Array>} Array of policy names.
   */
  async #syncTargetScalingPolicies({
    state,
    resourceId,
    containerName,
    targetScalingPolicies,
  }) {
    const memoryTargetCount = targetScalingPolicies.filter(
      (p) => p.target === 'memory',
    ).length
    const cpuTargetCount = targetScalingPolicies.filter(
      (p) => p.target === 'cpu',
    ).length
    const albRequestsPerTargetCount = targetScalingPolicies.filter(
      (p) => p.target === 'albRequestsPerTarget',
    ).length

    if (memoryTargetCount > 1) {
      throw new ServerlessError(
        'Cannot have more than one memory target scaling policy',
        ServerlessErrorCodes.INVALID_CONFIGURATION,
        { stack: false },
      )
    }

    if (cpuTargetCount > 1) {
      throw new ServerlessError(
        'Cannot have more than one cpu target scaling policy',
        ServerlessErrorCodes.INVALID_CONFIGURATION,
        { stack: false },
      )
    }

    if (albRequestsPerTargetCount > 1) {
      throw new ServerlessError(
        'Cannot have more than one albRequestsPerTarget target scaling policy',
        ServerlessErrorCodes.INVALID_CONFIGURATION,
        { stack: false },
      )
    }

    const desiredPolicyNames = []

    const cpuTarget = targetScalingPolicies.find((p) => p.target === 'cpu')
    // Create or update Target Tracking Scaling Policy for CPU if configured.
    if (cpuTarget) {
      const policyName = `${resourceId}-cpu-target-tracking-scaling-policy`
      desiredPolicyNames.push(policyName)
      await this.client.send(
        new PutScalingPolicyCommand({
          PolicyName: policyName,
          ServiceNamespace: 'ecs',
          ResourceId: resourceId,
          ScalableDimension: 'ecs:service:DesiredCount',
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
            },
            TargetValue: cpuTarget.value ?? 70,
            ScaleInCooldown: cpuTarget.scaleInCooldown ?? 60,
            ScaleOutCooldown: cpuTarget.scaleOutCooldown ?? 60,
            DisableScaleIn: cpuTarget.scaleIn === false ? true : false,
          },
        }),
      )
      logger.debug(
        `${containerName}: Created/Updated autoscaling policy: ${policyName}`,
      )
    }

    const memoryTarget = targetScalingPolicies.find(
      (p) => p.target === 'memory',
    )
    // Create or update Target Tracking Scaling Policy for Memory if configured.
    if (memoryTarget) {
      const policyName = `${resourceId}-memory-target-tracking-scaling-policy`
      desiredPolicyNames.push(policyName)
      await this.client.send(
        new PutScalingPolicyCommand({
          PolicyName: policyName,
          ServiceNamespace: 'ecs',
          ResourceId: resourceId,
          ScalableDimension: 'ecs:service:DesiredCount',
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'ECSServiceAverageMemoryUtilization',
            },
            TargetValue: memoryTarget.value ?? 70,
            ScaleInCooldown: memoryTarget.scaleInCooldown ?? 60,
            ScaleOutCooldown: memoryTarget.scaleOutCooldown ?? 60,
            DisableScaleIn: memoryTarget.scaleIn === false ? true : false,
          },
        }),
      )
      logger.debug(
        `${containerName}: Created/Updated autoscaling policy: ${policyName}`,
      )
    }

    const albTarget = targetScalingPolicies.find(
      (p) => p.target === 'albRequestsPerTarget',
    )
    if (albTarget) {
      const policyName = `${resourceId}-alb-requests-per-target-scaling-policy`
      desiredPolicyNames.push(policyName)
      const targetGroup =
        state.state.containers[containerName].routing.awsAlb
          .targetGroupArnAwsFargateEcs
      const albArn = state.state.awsAlb.arn
      const parsedAlbArn = parseArn(albArn)
      const parsedTargetGroupArn = parseArn(targetGroup)
      const resourceLabel =
        `${parsedAlbArn.resource}/${parsedTargetGroupArn.resource}`.replace(
          'loadbalancer/',
          '',
        )
      await this.client.send(
        new PutScalingPolicyCommand({
          PolicyName: policyName,
          ServiceNamespace: 'ecs',
          ResourceId: resourceId,
          ScalableDimension: 'ecs:service:DesiredCount',
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'ALBRequestCountPerTarget',
              ResourceLabel: resourceLabel,
            },
            TargetValue: albTarget.value ?? 70,
            ScaleInCooldown: albTarget.scaleInCooldown ?? 60,
            ScaleOutCooldown: albTarget.scaleOutCooldown ?? 60,
            DisableScaleIn: albTarget.scaleIn === false ? true : false,
          },
        }),
      )
      logger.debug(
        `${containerName}: Created/Updated autoscaling policy: ${policyName}`,
      )
    }

    return desiredPolicyNames
  }

  /**
   * Syncs step scaling policies for the ECS service.
   *
   * @param {Object} params - Parameters for the sync operation.
   * @param {string} params.resourceId - Resource ID of the ECS service.
   * @param {string} params.containerName - Name of the container.
   * @param {Array} params.stepScalingPolicies - Array of step scaling policies.
   * @returns {Promise<Array>} Array of policy names.
   */
  async #syncStepScalingPolicies({
    resourceId,
    containerName,
    stepScalingPolicies,
  }) {
    const desiredPolicyNames = []
    const createScalingPoliciesPromises = stepScalingPolicies.map(
      async (policy) => {
        const policyName = `${resourceId}-${policy.metricName}-step-scaling-policy`
        desiredPolicyNames.push(policyName)
        const response = await this.client.send(
          new PutScalingPolicyCommand({
            PolicyName: policyName,
            ServiceNamespace: 'ecs',
            ResourceId: resourceId,
            ScalableDimension: 'ecs:service:DesiredCount',
            PolicyType: 'StepScaling',
            StepScalingPolicyConfiguration: {
              AdjustmentType: policy.adjustmentType ?? 'ChangeInCapacity',
              Cooldown: policy.cooldown ?? 60,
              MetricAggregationType: policy.metricAggregationType ?? 'Average',
              StepAdjustments: policy.stepAdjustments.map((step) => ({
                MetricIntervalLowerBound: step.metricIntervalLowerBound,
                MetricIntervalUpperBound: step.metricIntervalUpperBound,
                ScalingAdjustment: step.scalingAdjustment,
              })),
            },
          }),
        )

        return await this.cloudwatchClient.createMetricsAlarm({
          scalingPolicyArn: response.PolicyARN,
          metric: {
            metricName: policy.metricName,
            namespace: policy.namespace,
            dimensions: policy.dimensions ?? [],
          },
          period: policy.period ?? 60,
          evaluationPeriods: policy.evaluationPeriods ?? 3,
          threshold: policy.threshold,
          comparisonOperator: policy.comparisonOperator,
          unit: policy.unit ?? 'Percent',
        })
      },
    )
    const createScalingPoliciesResponse = await Promise.all(
      createScalingPoliciesPromises,
    )
    logger.debug(
      `${containerName}: Created/Updated autoscaling policies: ${createScalingPoliciesResponse.map(
        (policy) => policy.PolicyName,
      )}`,
    )

    return desiredPolicyNames
  }
}
