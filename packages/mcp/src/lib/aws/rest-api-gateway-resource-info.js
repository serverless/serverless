import AwsRestApiGatewayClient from '@serverless/engine/src/lib/aws/restApiGateway.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Get detailed information about an AWS REST API Gateway API
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.resourceId - REST API Gateway API ID
 * @param {number|string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 * @param {number|string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The REST API Gateway information
 */
export async function getRestApiGatewayResourceInfo(params) {
  const { resourceId, startTime, endTime, period, region, profile } = params
  if (!resourceId) {
    return {
      resourceId,
      type: 'restapigateway',
      status: 'error',
      error: 'Please provide a REST API Gateway API ID',
    }
  }
  const result = {
    resourceId,
    type: 'restapigateway',
  }

  // Set default time range to last 24 hours if not provided
  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000

  // For internal calculations and defaults
  let parsedStartTime = startTime
    ? typeof startTime === 'string' && startTime.includes('-')
      ? new Date(startTime).getTime()
      : parseInt(startTime, 10)
    : oneDayAgo

  let parsedEndTime = endTime
    ? typeof endTime === 'string' && endTime.includes('-')
      ? new Date(endTime).getTime()
      : parseInt(endTime, 10)
    : now

  // Use default period of 3600 seconds (1 hour) if not provided
  const parsedPeriod = period || 3600

  // For API calls, use ISO strings if not provided
  const apiStartTime = startTime || new Date(parsedStartTime).toISOString()
  const apiEndTime = endTime || new Date(parsedEndTime).toISOString()

  try {
    // Create AWS config with region and/or profile if provided
    const awsConfig = {}
    if (region) awsConfig.region = region
    if (profile) awsConfig.profile = profile

    // Initialize REST API Gateway client with the AWS config
    const restApiGatewayClient = new AwsRestApiGatewayClient(awsConfig)

    // Get all REST APIs if resourceId is not provided
    let apis = []
    if (!resourceId) {
      apis = await restApiGatewayClient.getRestApis()
    } else {
      // Check if resourceId is a valid API ID
      try {
        // Fetch the API directly by ID
        const api = await restApiGatewayClient.getRestApi(resourceId)
        // The API object should have id, name, and other properties
        if (api && api.id) {
          apis = [api]
        } else {
          // If API doesn't exist or doesn't have expected properties, return error
          return {
            resourceId,
            type: 'restapigateway',
            status: 'error',
            error: `REST API Gateway with ID ${resourceId} not found or has invalid format`,
          }
        }
      } catch (error) {
        // If API doesn't exist, return error
        return {
          resourceId,
          type: 'restapigateway',
          status: 'error',
          error: `REST API Gateway with ID ${resourceId} not found: ${error.message}`,
        }
      }
    }

    // If no APIs found, return empty result
    if (apis.length === 0) {
      return {
        resourceId,
        type: 'restapigateway',
        status: 'error',
        error: 'No REST API Gateway APIs found',
      }
    }

    // If resourceId is not provided, return list of APIs
    if (!resourceId) {
      return {
        resourceId: 'all',
        type: 'restapigateway',
        apis: apis.map((api) => ({
          id: api.id,
          name: api.name,
          description: api.description,
          createdDate: api.createdDate?.toISOString(),
          version: api.version,
          apiKeySource: api.apiKeySource,
          endpointConfiguration: api.endpointConfiguration,
        })),
      }
    }

    // Get detailed information for the specified API
    const api = apis[0]
    result.id = api.id
    result.name = api.name
    result.description = api.description
    result.createdDate = api.createdDate?.toISOString()
    result.version = api.version
    result.apiKeySource = api.apiKeySource
    result.endpointConfiguration = api.endpointConfiguration

    // Fetch all API data in parallel
    const fetchData = async () => {
      // Helper function to wrap API calls with error handling
      const withErrorHandling = (promise, errorMessage) => {
        return promise.catch((error) => {
          // Check if this is an AWS credentials error
          const credentialErrorMessage = handleAwsCredentialsError(
            error,
            profile,
          )
          return {
            error:
              credentialErrorMessage || `${errorMessage}: ${error.message}`,
          }
        })
      }

      // Create promises for all the API calls
      const stagesPromise = withErrorHandling(
        restApiGatewayClient.getStages(api.id),
        `Failed to fetch stages for API ${api.id}`,
      )

      const resourcesPromise = withErrorHandling(
        restApiGatewayClient.getResources(api.id),
        `Failed to fetch resources for API ${api.id}`,
      )

      const deploymentsPromise = withErrorHandling(
        restApiGatewayClient.getDeployments(api.id),
        `Failed to fetch deployments for API ${api.id}`,
      )

      const apiKeysPromise = withErrorHandling(
        restApiGatewayClient.getApiKeys(),
        'Failed to fetch REST API Gateway keys',
      )

      const usagePlansPromise = withErrorHandling(
        restApiGatewayClient.getUsagePlans(),
        'Failed to fetch usage plans',
      )

      const vpcLinksPromise = withErrorHandling(
        restApiGatewayClient.getVpcLinks(),
        'Failed to fetch VPC links',
      )

      // Execute all promises in parallel
      const [
        stagesResult,
        resourcesResult,
        deploymentsResult,
        apiKeysResult,
        usagePlansResult,
        vpcLinksResult,
      ] = await Promise.all([
        stagesPromise,
        resourcesPromise,
        deploymentsPromise,
        apiKeysPromise,
        usagePlansPromise,
        vpcLinksPromise,
      ])

      // Process stages if successful
      if (!stagesResult.error) {
        result.stages = stagesResult.map((stage) => ({
          name: stage.stageName,
          deploymentId: stage.deploymentId,
          description: stage.description,
          createdDate: stage.createdDate?.toISOString(),
          lastUpdatedDate: stage.lastUpdatedDate?.toISOString(),
          methodSettings: stage.methodSettings,
          variables: stage.variables,
          documentationVersion: stage.documentationVersion,
          accessLogSettings: stage.accessLogSettings,
          canarySettings: stage.canarySettings,
          tracingEnabled: stage.tracingEnabled,
        }))
      } else {
        result.stages = { error: stagesResult.error }
      }

      // Process deployments if successful
      if (!deploymentsResult.error) {
        result.deployments = deploymentsResult.map((deployment) => ({
          id: deployment.id,
          description: deployment.description,
          createdDate: deployment.createdDate?.toISOString(),
          apiSummary: deployment.apiSummary,
        }))
      } else {
        result.deployments = { error: deploymentsResult.error }
      }

      // Process resources if successful
      if (!resourcesResult.error) {
        result.resources = await Promise.all(
          resourcesResult.map(async (resource) => {
            const resourceInfo = {
              id: resource.id,
              path: resource.path,
              pathPart: resource.pathPart,
              parentId: resource.parentId,
              resourceMethods: {},
            }

            // Process methods in parallel if they exist
            if (resource.resourceMethods) {
              const methodEntries = Object.entries(resource.resourceMethods)
              const methodPromises = methodEntries.map(
                async ([method, methodDetails]) => {
                  try {
                    const integration =
                      await restApiGatewayClient.getIntegration(
                        api.id,
                        resource.id,
                        method,
                      )
                    return [
                      method,
                      {
                        ...methodDetails,
                        integration: {
                          type: integration.type,
                          httpMethod: integration.httpMethod,
                          uri: integration.uri,
                          integrationResponses:
                            integration.integrationResponses,
                          requestParameters: integration.requestParameters,
                          requestTemplates: integration.requestTemplates,
                          passthroughBehavior: integration.passthroughBehavior,
                          contentHandling: integration.contentHandling,
                          timeoutInMillis: integration.timeoutInMillis,
                          cacheNamespace: integration.cacheNamespace,
                          cacheKeyParameters: integration.cacheKeyParameters,
                          connectionType: integration.connectionType,
                          connectionId: integration.connectionId,
                        },
                      },
                    ]
                  } catch (error) {
                    return [
                      method,
                      {
                        ...methodDetails,
                        integration: {
                          error: `Failed to fetch integration: ${error.message}`,
                        },
                      },
                    ]
                  }
                },
              )

              // Wait for all method integrations to be fetched
              const methodResults = await Promise.all(methodPromises)

              // Convert the array of [method, details] pairs back to an object
              resourceInfo.resourceMethods = Object.fromEntries(methodResults)
            }

            return resourceInfo
          }),
        )
      } else {
        result.resources = { error: resourcesResult.error }
      }

      // Process API keys if successful
      if (!apiKeysResult.error) {
        result.apiKeys = apiKeysResult
          .filter((key) =>
            key.stageKeys?.some((stageKey) => stageKey.includes(api.id)),
          )
          .map((key) => ({
            id: key.id,
            name: key.name,
            description: key.description,
            enabled: key.enabled,
            createdDate: key.createdDate?.toISOString(),
            lastUpdatedDate: key.lastUpdatedDate?.toISOString(),
            stageKeys: key.stageKeys,
          }))
      } else {
        result.apiKeys = apiKeysResult
      }

      // Process usage plans if successful
      if (!usagePlansResult.error) {
        result.usagePlans = usagePlansResult
          .filter((plan) =>
            plan.apiStages?.some((stage) => stage.apiId === api.id),
          )
          .map((plan) => ({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            apiStages: plan.apiStages,
            throttle: plan.throttle,
            quota: plan.quota,
            productCode: plan.productCode,
            tags: plan.tags,
          }))
      } else {
        result.usagePlans = usagePlansResult
      }

      // Process VPC links if successful
      if (!vpcLinksResult.error) {
        result.vpcLinks = vpcLinksResult.map((link) => ({
          id: link.id,
          name: link.name,
          description: link.description,
          targetArns: link.targetArns,
          status: link.status,
          statusMessage: link.statusMessage,
        }))
      } else {
        result.vpcLinks = vpcLinksResult
      }

      // Get metrics for the API (using default time range if not provided)
      try {
        // Filter out any stages with null or undefined names
        const stageNames = result.stages
          .map((stage) => stage.name)
          .filter((name) => name) // Filter out null/undefined values

        // Only attempt to get metrics if we have valid API name and at least one stage
        if (api.name && stageNames.length > 0) {
          const metrics =
            await restApiGatewayClient.getRestApiGatewayMetricData({
              apiNames: [api.name],
              stageNames,
              startTime: apiStartTime,
              endTime: apiEndTime,
              period: parsedPeriod,
            })
          result.metrics = metrics[api.name] || {}
        } else {
          result.metrics = {
            note: 'No metrics available: missing API name or valid stages',
          }
        }
      } catch (error) {
        // Check if this is an AWS credentials error
        const credentialErrorMessage = handleAwsCredentialsError(error, profile)
        result.metrics = {
          error:
            credentialErrorMessage ||
            `Failed to fetch metrics: ${error.message}`,
        }
      }
    }

    // Execute all data fetching in parallel
    await fetchData()

    return result
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    return {
      resourceId,
      type: 'restapigateway',
      status: 'error',
      error:
        credentialErrorMessage ||
        `Failed to get REST API Gateway information: ${error.message}`,
    }
  }
}
