import { AwsHttpApiGatewayClient } from '@serverless/engine/src/lib/aws/httpApiGateway.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Get detailed information about an AWS HTTP API Gateway API
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.resourceId - HTTP API Gateway API ID
 * @param {number|string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 * @param {number|string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The HTTP API Gateway information
 */
export async function getHttpApiGatewayResourceInfo(params) {
  const { resourceId, startTime, endTime, period, region, profile } = params
  if (!resourceId) {
    return {
      resourceId,
      type: 'httpapigateway',
      status: 'error',
      error: 'Please provide an HTTP API Gateway API ID',
    }
  }
  const result = {
    resourceId,
    type: 'httpapigateway',
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

    // Initialize HTTP API Gateway client with the AWS config
    const httpApiGatewayClient = new AwsHttpApiGatewayClient(awsConfig)

    // Get all HTTP APIs if resourceId is not provided
    let apis = []
    if (!resourceId) {
      apis = await httpApiGatewayClient.getHttpApis()
    } else {
      // Check if resourceId is a valid API ID
      try {
        // Try to get stages for the API to verify it exists
        await httpApiGatewayClient.getStages(resourceId)
        apis = [{ ApiId: resourceId }]
      } catch (error) {
        // Check if this is an AWS credentials error
        const credentialErrorMessage = handleAwsCredentialsError(error, profile)
        if (credentialErrorMessage) {
          return {
            resourceId,
            type: 'httpapigateway',
            status: 'error',
            error: credentialErrorMessage,
          }
        }

        // If API doesn't exist, return error
        return {
          resourceId,
          type: 'httpapigateway',
          status: 'error',
          error: `HTTP API Gateway with ID ${resourceId} not found`,
        }
      }
    }

    // If no APIs found, return empty result
    if (apis.length === 0) {
      return {
        resourceId,
        type: 'httpapigateway',
        status: 'error',
        error: 'No HTTP API Gateway APIs found',
      }
    }

    // If resourceId is not provided, return list of APIs
    if (!resourceId) {
      return {
        resourceId: 'all',
        type: 'httpapigateway',
        apis: apis.map((api) => ({
          id: api.ApiId,
          name: api.Name,
          description: api.Description,
          createdDate: api.CreatedDate?.toISOString(),
          version: api.Version,
          apiEndpoint: api.ApiEndpoint,
          protocolType: api.ProtocolType,
          corsConfiguration: api.CorsConfiguration,
          disableSchemaValidation: api.DisableSchemaValidation,
          disableExecuteApiEndpoint: api.DisableExecuteApiEndpoint,
          apiKeySelectionExpression: api.ApiKeySelectionExpression,
          routeSelectionExpression: api.RouteSelectionExpression,
        })),
      }
    }

    // Get detailed information for the specified API
    const apiId = apis[0].ApiId

    // Get full API details using the enhanced getHttpApiDetails method
    // This will fetch all components (routes, integrations, stages, authorizers, deployments, metrics)
    const apiDetails = await httpApiGatewayClient.getHttpApiDetails(apiId, {
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      period: parsedPeriod,
    })

    // Format the response with all the details
    result.id = apiDetails.apiId
    result.apiInfo = apiDetails.apiInfo
    result.routes = apiDetails.routes
    result.integrations = apiDetails.integrations
    result.stages = apiDetails.stages.map((stage) => ({
      name: stage.StageName,
      description: stage.Description,
      defaultRouteSettings: stage.DefaultRouteSettings,
      deploymentId: stage.DeploymentId,
      stageVariables: stage.StageVariables,
      createdDate: stage.CreatedDate?.toISOString(),
      lastUpdatedDate: stage.LastUpdatedDate?.toISOString(),
      autoDeployEnabled: stage.AutoDeploy,
      apiGatewayManaged: stage.ApiGatewayManaged,
    }))
    result.stageLoggingConfig = apiDetails.stageLoggingConfig
    result.authorizers = apiDetails.authorizers
    result.deployments = apiDetails.deployments.map((deployment) => ({
      id: deployment.DeploymentId,
      description: deployment.Description,
      createdDate: deployment.CreatedDate?.toISOString(),
      autoDeployed: deployment.AutoDeployed,
    }))
    result.metrics = apiDetails.metrics

    // Get domain names and API mappings
    try {
      const domainNames = await httpApiGatewayClient.getDomainNames()

      // Process domain names and their API mappings in parallel
      result.domainNames = await Promise.all(
        domainNames.map(async (domain) => {
          try {
            const apiMappings = await httpApiGatewayClient.getApiMappings(
              domain.DomainName,
            )

            // Filter mappings to only include those for this API
            const relevantMappings = apiMappings.filter(
              (mapping) => mapping.ApiId === apiId,
            )

            if (relevantMappings.length > 0) {
              return {
                domainName: domain.DomainName,
                apiMappingSelectionExpression:
                  domain.ApiMappingSelectionExpression,
                domainNameStatus: domain.DomainNameStatus,
                domainNameStatusMessage: domain.DomainNameStatusMessage,
                endpointType: domain.EndpointType,
                mutualTlsAuthentication: domain.MutualTlsAuthentication,
                securityPolicy: domain.SecurityPolicy,
                tags: domain.Tags,
                apiMappings: relevantMappings.map((mapping) => ({
                  apiMappingId: mapping.ApiMappingId,
                  apiMappingKey: mapping.ApiMappingKey,
                  apiId: mapping.ApiId,
                  stage: mapping.Stage,
                })),
              }
            }
            return null
          } catch (error) {
            // Check if this is an AWS credentials error
            const credentialErrorMessage = handleAwsCredentialsError(
              error,
              profile,
            )
            return {
              domainName: domain.DomainName,
              error:
                credentialErrorMessage ||
                `Failed to fetch API mappings: ${error.message}`,
            }
          }
        }),
      )

      // Filter out null values (domains without mappings for this API)
      result.domainNames = result.domainNames.filter(
        (domain) => domain !== null,
      )
    } catch (error) {
      // Check if this is an AWS credentials error
      const credentialErrorMessage = handleAwsCredentialsError(error, profile)
      result.domainNames = {
        error:
          credentialErrorMessage ||
          `Failed to fetch domain names: ${error.message}`,
      }
    }

    // Get VPC links
    try {
      const vpcLinks = await httpApiGatewayClient.getVpcLinks()
      result.vpcLinks = vpcLinks.map((link) => ({
        id: link.VpcLinkId,
        name: link.Name,
        description: link.Description,
        vpcLinkStatus: link.VpcLinkStatus,
        vpcLinkStatusMessage: link.VpcLinkStatusMessage,
        vpcLinkVersion: link.VpcLinkVersion,
        securityGroupIds: link.SecurityGroupIds,
        subnetIds: link.SubnetIds,
        createdDate: link.CreatedDate?.toISOString(),
        tags: link.Tags,
      }))
    } catch (error) {
      // Check if this is an AWS credentials error
      const credentialErrorMessage = handleAwsCredentialsError(error, profile)
      result.vpcLinks = {
        error:
          credentialErrorMessage ||
          `Failed to fetch VPC links: ${error.message}`,
      }
    }

    return result
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    return {
      resourceId,
      type: 'httpapigateway',
      status: 'error',
      error:
        credentialErrorMessage ||
        `Failed to get HTTP API Gateway information: ${error.message}`,
    }
  }
}
