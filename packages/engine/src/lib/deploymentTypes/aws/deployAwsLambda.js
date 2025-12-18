import { ServerlessError, progress } from '@serverless/util'

const sclProgress = progress.get('main')

/**
 * Deploys an AWS Lambda container.
 * @param {Object} params - Deployment parameters for AWS Lambda container.
 * @param {Object} params.state - State object containing deployment information.
 * @param {string} params.containerName - Name of the container.
 * @param {Object} params.containerConfig - Container configuration details.
 * @param {string} params.resourceNameBase - Base resource name used for AWS resource naming.
 * @param {Object} params.envVars - Environment variables for the container.
 * @param {string} params.customRoleArn - ARN of the custom IAM role.
 * @param {Object} params.awsClients - AWS clients object.
 * @param {boolean} params.hasChangedContainerComputeType - Flag indicating if compute type has changed.
 * @param {string} [params.domain] - Domain for the container (if specified).
 * @param {string} params.routingPathHealthCheck - Health check path for routing.
 * @returns {Promise<void>}
 */
const deployAwsLambdaContainer = async ({
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
}) => {
  const { awsLambdaClient, awsEcsClient } = awsClients

  sclProgress.update(`${containerName}: Configuring AWS Lambda function`)

  /**
   * Validate that the compute type AND routing config are not changing
   * at the same time. Our zero-downtime deployment strategy will not work
   * if they are changing at the same time.
   */
  if (hasChangedContainerComputeType && hasChangedContainerRoutingConfig) {
    throw new ServerlessError(
      'Deployment Failed: Cannot change compute type and routing config at the same time.',
      'LAMBDA_COMPUTE_TYPE_AND_ROUTING_CONFIG_CHANGE',
    )
  }

  /**
   * Optionally deploy the AWS Lambda function.
   */

  if (
    force ||
    hasChangedContainerComputeType ||
    hasChangedContainerCode ||
    hasChangedContainerComputeConfig ||
    hasChangedContainerRoutingConfig
  ) {
    /**
     * Perform the Lambda function deployment.
     */
    const functionArn = await awsLambdaClient.createOrUpdateFunction({
      resourceNameBase,
      containerName,
      imageUri:
        state.state.containers[containerName].compute.awsLambda.imageUri,
      iamRole: customRoleArn,
      environment: envVars,
      vpcEnabled: containerConfig.compute.awsLambda?.vpc ?? false,
      vpcConfig: {
        subnets: state.state.awsVpc.privateSubnets,
        securityGroups: [state.state.awsVpc.s2sSecurityGroupId],
      },
      memory: containerConfig.compute.awsLambda?.memory ?? 1024,
      timeout: containerConfig.compute.awsLambda?.timeout ?? 6,
    })

    // Get the function URL
    const functionUrl = await awsLambdaClient.getFunctionUrl({
      resourceNameBase,
      containerName,
    })

    // Store function info in state
    state.state.containers[containerName].compute.awsLambda.functionArn =
      functionArn
    state.state.containers[containerName].compute.awsLambda.functionUrl =
      functionUrl

    // Update the state
    state.state.containers[containerName].routing.pathPattern =
      containerConfig.routing?.pathPattern
    state.state.containers[containerName].routing.pathHealthCheck =
      routingPathHealthCheck
    state.state.containers[containerName].routing.customDomain =
      domain ?? undefined
  }

  /**
   * Optionally stop the Fargate service.
   */
  if (hasChangedContainerComputeType) {
    await awsEcsClient.stopFargateService({
      clusterArn: state.state.awsEcs.cluster.arn,
      resourceNameBase,
      containerName,
    })
  }
}

export default deployAwsLambdaContainer
