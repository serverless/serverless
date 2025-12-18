import '@aws-sdk/signature-v4-crt'
import '@aws-sdk/signature-v4a'
import { log, progress } from '@serverless/util'
import { generateCloudFrontFunctionCode } from '../../aws/cloudfront-function.js'
import { AwsCloudFrontKVClient } from '../../aws/cloudfront-kv.js'

const logger = log.get('scf:aws:deploy:dynamic-routing')
const sclProgress = progress.get('main')

// Origin types available in state
const ORIGIN_TYPE = {
  ALB: 'alb',
  LAMBDA: 'lambda',
}

/**
 * Deploy dynamic routing infrastructure using CloudFront Functions and KV Store
 *
 * @param {Object} params - Parameters for the deployment
 * @param {Object} params.awsClients - AWS client instances
 * @param {Object} params.state - Deployment state
 * @param {string} params.resourceNameBase - Base name for AWS resources
 * @returns {Promise<Object>} Result of the deployment
 */
export const deployDynamicRouting = async ({
  awsClients,
  state,
  resourceNameBase,
}) => {
  const { awsCloudFrontClient } = awsClients

  // Initialize the CloudFront KV Client with AWS configuration from AWS clients
  // CloudFront KV operations are global but api endpoints are in us-east-1
  const awsCloudFrontKVClient = new AwsCloudFrontKVClient({
    region: 'us-east-1', // CloudFront KVs are created in us-east-1 regardless of region
    credentials: awsClients.credentials,
  })

  sclProgress.notice('Setting up CloudFront dynamic routing infrastructure')

  try {
    // Create or get the KV Store
    logger.debug('Creating or getting CloudFront KV Store')
    const kvStore = await awsCloudFrontKVClient.getOrCreateKeyValueStore({
      resourceNameBase,
    })

    // Store KV Store info in state
    state.state.awsCloudFront = state.state.awsCloudFront || {}
    state.state.awsCloudFront.keyValueStore = {
      arn: kvStore.arn,
      name: kvStore.name,
      status: kvStore.status,
    }

    // Determine which origins are available
    const availableOrigins = {
      hasAlb: !!state.state.awsAlb?.dnsName,
      hasLambda: false, // Will be set to true if we find any Lambda function URL
    }

    // Check if any container uses Lambda and has a function URL
    if (state.state.containers) {
      Object.values(state.state.containers).forEach((container) => {
        if (
          container.compute?.type === 'awsLambda' &&
          container.compute?.awsLambda?.functionUrl
        ) {
          availableOrigins.hasLambda = true
        }
      })
    }

    // Default to whichever origin type is available
    const defaultOriginType = availableOrigins.hasAlb
      ? ORIGIN_TYPE.ALB
      : availableOrigins.hasLambda
        ? ORIGIN_TYPE.LAMBDA
        : ORIGIN_TYPE.ALB
    const defaultOriginId = `${resourceNameBase}-${defaultOriginType}-origin`

    logger.debug(
      `Available origins: ALB: ${availableOrigins.hasAlb}, Lambda: ${availableOrigins.hasLambda}`,
    )
    logger.debug(`Default origin: ${defaultOriginType}`)

    // Generate CloudFront function code with KV Store ARN
    const functionName = `${resourceNameBase}-router`

    // Generate new CloudFront function code
    const newFunctionCode = generateCloudFrontFunctionCode({
      kvStoreARN: kvStore.arn,
      defaultOriginId,
      defaultOriginType,
      availableOrigins,
      resourceNameBase,
    })

    // Check if the function already exists in state
    let functionResult
    if (state.state.awsCloudFront?.function?.name === functionName) {
      // Get the existing function to check code
      const existingFunction =
        await awsCloudFrontClient.getFunction(functionName)

      if (existingFunction) {
        const existingCode = existingFunction.FunctionCode.toString()

        // Compare existing code with new code
        if (existingCode !== newFunctionCode) {
          // Code has changed, update function with new code
          logger.debug(
            'CloudFront function code has changed, updating function',
          )
          functionResult = await awsCloudFrontClient.createOrUpdateFunction({
            name: functionName,
            code: newFunctionCode,
            kvStoreARN: kvStore.arn,
          })
        } else {
          // Code is the same, only update KV store association if needed
          logger.debug(
            'CloudFront function code unchanged, updating only KV store association if needed',
          )
          functionResult =
            await awsCloudFrontClient.updateFunctionKvAssociation({
              name: functionName,
              kvStoreARN: kvStore.arn,
            })
        }
      } else {
        // Function not found, create it
        logger.debug('CloudFront function not found, creating new function')
        functionResult = await awsCloudFrontClient.createOrUpdateFunction({
          name: functionName,
          code: newFunctionCode,
          kvStoreARN: kvStore.arn,
        })
      }
    } else {
      // Function doesn't exist yet, create it with full code
      logger.debug('Creating new CloudFront routing function')
      functionResult = await awsCloudFrontClient.createOrUpdateFunction({
        name: functionName,
        code: newFunctionCode,
        kvStoreARN: kvStore.arn,
      })
    }

    const functionArn = functionResult.FunctionSummary.ARN

    // Store function info in state
    state.state.awsCloudFront.function = {
      name: functionName,
      arn: functionArn,
    }

    // Check if we already have a CloudFront distribution
    if (state.state.awsCloudFront.distributionId) {
      // Associate function with existing distribution
      logger.debug('Associating function with existing CloudFront distribution')
      await awsCloudFrontClient.associateFunctionWithDistribution({
        distributionId: state.state.awsCloudFront.distributionId,
        functionArn,
      })
    }

    // Save state
    await state.save()

    return {
      kvStore,
      function: {
        name: functionName,
        arn: functionArn,
      },
      availableOrigins,
      defaultOriginType,
    }
  } catch (error) {
    logger.error('Failed to deploy CloudFront dynamic routing', error)
    throw error
  }
}

/**
 * Updates a route mapping in the CloudFront KV Store
 *
 * @param {Object} params - Parameters for updating the route mapping
 * @param {Object} params.awsClients - AWS client instances
 * @param {Object} params.state - Deployment state
 * @param {string} params.path - Path pattern for routing (e.g. "/api")
 * @param {string} params.containerName - Container name
 * @param {string} params.computeType - Compute type ('awsFargateEcs' or 'awsLambda')
 * @param {string} params.resourceNameBase - Base name for AWS resources
 * @returns {Promise<void>}
 */
export const updateRouteMapping = async ({
  awsClients,
  state,
  path,
  containerName,
  computeType,
  resourceNameBase,
}) => {
  // Get KV Store ARN from state
  const kvStoreARN = state.state.awsCloudFront?.keyValueStore?.arn

  if (!kvStoreARN) {
    throw new Error(
      'CloudFront KV Store not found in state. Deploy dynamic routing first.',
    )
  }

  // Initialize KV client
  const awsCloudFrontKVClient = new AwsCloudFrontKVClient({
    region: 'us-east-1', // CloudFront KVs are created in us-east-1 regardless of region
    credentials: awsClients.credentials,
  })

  // Determine origin ID based on compute type
  let originId, originType
  if (computeType === 'awsFargateEcs') {
    originId = `${resourceNameBase}-alb-origin`
    originType = 'alb'
  } else if (computeType === 'awsLambda') {
    // Create a unique origin ID for each Lambda container
    originId = `${resourceNameBase}-lambda-${containerName}-origin`
    originType = 'lambda'
  } else {
    throw new Error(`Unknown compute type: ${computeType}`)
  }

  // Get the previous path pattern from state if it exists
  const previousPath =
    state.state.containers[containerName]?.routing?.cloudFrontKV?.path

  // If the path has changed, log it
  if (previousPath && previousPath !== path) {
    logger.debug(`Path pattern changed from ${previousPath} to ${path}`)
  }

  // Update the route mapping
  logger.debug(`Updating route mapping for path ${path} to ${originId}`)
  await awsCloudFrontKVClient.updateRouteMapping({
    kvStoreName: kvStoreARN,
    path,
    originId,
    originType,
    resourceNameBase,
    previousPath, // Pass the previous path to handle cleanup
  })

  // Store the route mapping in state
  state.state.containers[containerName].routing.cloudFrontKV = {
    path,
    originId,
    originType,
  }
}
