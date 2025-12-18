import {
  LambdaClient as AwsSdkLambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  ResourceNotFoundException,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
  DeleteFunctionCommand,
  GetPolicyCommand,
  ListEventSourceMappingsCommand,
  GetEventSourceMappingCommand,
  CreateFunctionUrlConfigCommand,
  UpdateFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
  FunctionUrlAuthType,
} from '@aws-sdk/client-lambda'
import {
  ServerlessError,
  ServerlessErrorCodes,
  log,
  progress,
  addProxyToAwsClient,
} from '@serverless/util'
import { setTimeout } from 'node:timers/promises'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'

const logger = log.get('aws:lambda')

/**
 * Generates a lambda function name
 * Ensures the name is not longer than 64 characters
 * @param {string} resourceNameBase - The resource name base
 * @param {string} service - The name of the service
 * @returns {string} The lambda function name
 */
const lambdaName = (resourceNameBase, service) => {
  const maxLength = 64
  let baseName = `${resourceNameBase}-${service}`
  if (baseName.length > maxLength) {
    baseName = baseName.slice(0, maxLength)
  }
  return baseName
}

export class AwsLambdaClient {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkLambdaClient({
        ...awsConfig,
        retryStrategy: new ConfiguredRetryStrategy(
          10,
          (attempt) => 100 + attempt * 5000,
        ),
      }),
    )
    this.progressMain = progress.get('main')
  }

  /**
   * Removes a lambda function
   * @param {Object} params - The parameters for removing the function
   * @param {string} params.resourceNameBase - The resourceNameBase of the service
   * @param {string} params.service - The name of the service
   * @returns {Promise<void>}
   */
  async removeFunction({ resourceNameBase, service }) {
    const functionName = lambdaName(resourceNameBase, service)
    try {
      await this.client.send(
        new DeleteFunctionCommand({
          FunctionName: functionName,
        }),
      )
    } catch (error) {
      const name = error.name
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        return
      }
      throw error
    }
  }

  /**
   * Retrieves information about a Lambda function
   * @param {Object} params - The parameters for getting the function
   * @param {string} params.resourceNameBase - The resourceNameBase of the service
   * @param {string} params.service - The name of the service
   * @param {string} [params.stage='dev'] - The stage of the service
   * @returns {Promise<import('@aws-sdk/client-lambda').GetFunctionCommandOutput | null>} - The function information or null if the function does not exist
   */
  async getFunction({ resourceNameBase, containerName }) {
    const functionName = lambdaName(resourceNameBase, containerName)
    try {
      const getFunctionResponse = await this.client.send(
        new GetFunctionCommand({
          FunctionName: functionName,
        }),
      )
      if (getFunctionResponse.Configuration) {
        return getFunctionResponse
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
   * Creates or updates a lambda function
   * @param {string} resourceNameBase - The resourceNameBase
   * @param {string} containerName - The name of the container
   * @param {string} imageUri - The URI of the container image
   * @param {string} iamRole - The ARN of the IAM role
   * @param {object} environment - The environment variables for the lambda function
   * @param {string} stage - The stage of the service
   * @param {boolean} vpcEnabled - Whether the lambda function is in a VPC
   * @param {{ subnets: string[], securityGroups: string[] } | null} vpcConfig - The VPC configuration for the lambda function
   */
  async createOrUpdateFunction({
    resourceNameBase,
    containerName,
    imageUri,
    iamRole,
    environment = undefined,
    vpcEnabled = false,
    vpcConfig = null,
    memory = 1024,
    timeout = 6,
  }) {
    const functionName = lambdaName(resourceNameBase, containerName)
    let getFunctionResponse
    try {
      getFunctionResponse = await this.client.send(
        new GetFunctionCommand({ FunctionName: functionName }),
      )
    } catch (error) {
      const name = error.name
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        getFunctionResponse = undefined
      } else {
        throw error
      }
    }

    let functionArn

    if (getFunctionResponse?.Configuration) {
      if (vpcEnabled) {
        this.progressMain.update(
          'Updating AWS Lambda function (VPC enabled, this may take awhile)',
        )
      } else {
        this.progressMain.update('Updating AWS Lambda function')
      }
      await this.client.send(
        new UpdateFunctionCodeCommand({
          FunctionName: functionName,
          ImageUri: imageUri,
        }),
      )
      // Wait for the function to be ready after updating the code
      await this.waitForFunctionUpdated(functionName)
      await this.client.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Role: iamRole,
          Environment: {
            Variables: environment,
          },
          Timeout: timeout,
          MemorySize: memory,
          ...(vpcEnabled
            ? {
                VpcConfig: {
                  SubnetIds: vpcConfig.subnets,
                  SecurityGroupIds: vpcConfig.securityGroups,
                },
              }
            : { VpcConfig: { SubnetIds: [], SecurityGroupIds: [] } }),
        }),
      )
      await this.waitForFunctionUpdated(functionName)
      functionArn = getFunctionResponse.Configuration.FunctionArn
    } else {
      if (vpcEnabled) {
        this.progressMain.update(
          'Deploying AWS Lambda function (VPC enabled, this may take awhile)',
        )
      } else {
        this.progressMain.update('Deploying AWS Lambda function')
      }
      const createFunctionResponse = await this.client.send(
        new CreateFunctionCommand({
          FunctionName: functionName,
          PackageType: 'Image',
          MemorySize: memory,
          Timeout: timeout,
          Code: {
            ImageUri: imageUri,
          },
          Role: iamRole,
          Environment: {
            Variables: environment,
          },
          ...(vpcEnabled
            ? {
                VpcConfig: {
                  SubnetIds: vpcConfig.subnets,
                  SecurityGroupIds: vpcConfig.securityGroups,
                },
              }
            : {}),
        }),
      )
      if (createFunctionResponse.FunctionArn) {
        functionArn = createFunctionResponse.FunctionArn
      } else {
        throw new ServerlessError(
          `Failed to create lambda function ${functionName}`,
          ServerlessErrorCodes.lambda.FAILED_TO_CREATE_LAMBDA_FUNCTION,
        )
      }
    }

    // Create or update function URL
    this.progressMain.update(
      'Configuring AWS Lambda function URL with Response Stream mode',
    )

    try {
      // Check if function URL already exists
      await this.client.send(
        new GetFunctionUrlConfigCommand({
          FunctionName: functionName,
        }),
      )

      // If exists, update it
      await this.client.send(
        new UpdateFunctionUrlConfigCommand({
          FunctionName: functionName,
          AuthType: FunctionUrlAuthType.NONE, // Unauthenticated
          InvokeMode: 'RESPONSE_STREAM', // Enable response streaming for larger payloads (up to 20MB) and improved performance
        }),
      )
    } catch (error) {
      const name = error.name
      // If it doesn't exist, create it
      if (
        error instanceof ResourceNotFoundException ||
        name === 'ResourceNotFoundException'
      ) {
        await this.client.send(
          new CreateFunctionUrlConfigCommand({
            FunctionName: functionName,
            AuthType: FunctionUrlAuthType.NONE, // Unauthenticated
            InvokeMode: 'RESPONSE_STREAM', // Enable response streaming for larger payloads (up to 20MB) and improved performance
          }),
        )
      } else {
        throw error
      }
    }

    // Add permission to allow public access to function URL
    try {
      this.progressMain.update(
        'Configuring Function URL permissions for public access',
      )
      await this.client.send(
        new AddPermissionCommand({
          FunctionName: functionName,
          StatementId: 'FunctionURLAllowPublicAccess',
          Action: 'lambda:InvokeFunctionUrl',
          Principal: '*',
          FunctionUrlAuthType: FunctionUrlAuthType.NONE,
        }),
      )
    } catch (error) {
      // If permission already exists, ignore the error
      if (!error.message?.includes('already exists')) {
        logger.warn(
          `Failed to add public access permission for function URL: ${error.message}`,
        )
      }
    }
    return functionArn
  }

  async addPermission(functionName, action, principal, statementId) {
    this.progressMain.update('Configuring AWS Lambda function permissions')

    try {
      await this.client.send(
        new AddPermissionCommand({
          FunctionName: functionName,
          Action: action,
          Principal: principal,
          StatementId: statementId,
        }),
      )
    } catch (error) {
      /* EMPTY */
    }
  }

  async waitForFunctionUpdated(functionName) {
    const maxRetries = 30
    const baseDelay = 2000 // 2 seconds

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await this.client.send(
          new GetFunctionCommand({ FunctionName: functionName }),
        )

        const state = response.Configuration.State
        const lastUpdateStatus = response.Configuration.LastUpdateStatus

        if (state === 'Active' && lastUpdateStatus === 'Successful') {
          return // Function is updated and active
        }

        if (lastUpdateStatus === 'Failed') {
          throw new ServerlessError(
            `Function ${functionName} update failed: ${response.Configuration.LastUpdateStatusReason}`,
            ServerlessErrorCodes.lambda.FAILED_TO_UPDATE_LAMBDA_FUNCTION,
          )
        }
        // If still updating, wait with exponential backoff and retry
        await setTimeout(baseDelay * Math.pow(2, i))
      } catch (error) {
        if (error instanceof ServerlessError) {
          throw error
        }
        // For other errors (e.g., network issues), wait with exponential backoff and retry
        await setTimeout(baseDelay * Math.pow(2, i))
      }
    }

    throw new ServerlessError(
      `Timeout waiting for function ${functionName} to be updated`,
      ServerlessErrorCodes.lambda.FAILED_TO_UPDATE_LAMBDA_FUNCTION,
    )
  }

  /**
   * Get comprehensive information about a Lambda function including configuration, policy, and event source mappings
   * @param {string} functionName - The name or ARN of the Lambda function
   * @returns {Promise<Object>} - Detailed information about the Lambda function
   */
  async getLambdaFunctionDetails(functionName) {
    try {
      // Get function configuration and code details
      const functionData = await this.client.send(
        new GetFunctionCommand({ FunctionName: functionName }),
      )

      // Get function policy
      let policyData = null
      try {
        const policyResponse = await this.client.send(
          new GetPolicyCommand({ FunctionName: functionName }),
        )
        policyData = JSON.parse(policyResponse.Policy)
      } catch (error) {
        // Policy might not exist, which is fine
        logger.debug(
          `No policy found for function ${functionName}: ${error.message}`,
        )
      }

      // Get event source mappings
      let eventSourceMappings = []
      try {
        // First, list all event source mappings for the function
        const eventSourceResponse = await this.client.send(
          new ListEventSourceMappingsCommand({ FunctionName: functionName }),
        )
        const mappings = eventSourceResponse.EventSourceMappings || []

        // Then, get detailed information for each mapping
        if (mappings.length > 0) {
          const detailedMappings = await Promise.all(
            mappings.map(async (mapping) => {
              try {
                // Get detailed information for each mapping
                const detailedMapping = await this.client.send(
                  new GetEventSourceMappingCommand({ UUID: mapping.UUID }),
                )
                return detailedMapping
              } catch (error) {
                logger.debug(
                  `Error getting details for event source mapping ${mapping.UUID}: ${error.message}`,
                )
                // Return the basic mapping if we can't get details
                return mapping
              }
            }),
          )
          eventSourceMappings = detailedMappings
        }
      } catch (error) {
        // Event source mappings might not exist, which is fine
        logger.debug(
          `No event source mappings found for function ${functionName}: ${error.message}`,
        )
      }

      return {
        status: 'success',
        function: functionData,
        policy: policyData,
        eventSourceMappings: eventSourceMappings,
      }
    } catch (error) {
      return {
        status: 'error',
        functionName,
        error: error.message,
      }
    }
  }

  /**
   * Retrieves the URL for a Lambda function
   * @param {Object} params - The parameters for getting the function URL
   * @param {string} params.resourceNameBase - The resourceNameBase of the service
   * @param {string} params.containerName - The name of the container
   * @returns {Promise<string|null>} - The function URL or null if it does not exist
   */
  async getFunctionUrl({ resourceNameBase, containerName }) {
    const functionName = lambdaName(resourceNameBase, containerName)
    try {
      const urlConfigResponse = await this.client.send(
        new GetFunctionUrlConfigCommand({
          FunctionName: functionName,
        }),
      )

      if (urlConfigResponse && urlConfigResponse.FunctionUrl) {
        return urlConfigResponse.FunctionUrl
      }
      return null
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
}
