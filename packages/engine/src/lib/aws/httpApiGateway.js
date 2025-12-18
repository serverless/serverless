import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetApiCommand,
  GetRoutesCommand,
  GetRouteCommand,
  GetIntegrationsCommand,
  GetIntegrationCommand,
  GetStagesCommand,
  GetStageCommand,
  GetAuthorizersCommand,
  GetAuthorizerCommand,
  GetDeploymentsCommand,
  GetDeploymentCommand,
  GetApiMappingsCommand,
  GetVpcLinksCommand,
  GetVpcLinkCommand,
  GetDomainNamesCommand,
  GetDomainNameCommand,
} from '@aws-sdk/client-apigatewayv2'
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from '@aws-sdk/client-cloudwatch'
import { addProxyToAwsClient } from '@serverless/util'

/**
 * Client for interacting with AWS HTTP API Gateway
 */
export class AwsHttpApiGatewayClient {
  /**
   * Create a new HTTP API Gateway client
   * @param {Object} awsConfig - AWS configuration options
   */
  constructor(awsConfig = {}) {
    this.apiGatewayV2Client = addProxyToAwsClient(
      new ApiGatewayV2Client(awsConfig),
    )
    this.cloudWatchClient = addProxyToAwsClient(new CloudWatchClient(awsConfig))
  }

  /**
   * Get all HTTP APIs
   * @returns {Promise<Array>} - List of HTTP APIs
   */
  async getHttpApis() {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetApisCommand({}),
      )
      return response.Items || []
    } catch (error) {
      console.error('Error fetching HTTP APIs:', error)
      throw error
    }
  }

  /**
   * Get detailed information about a specific HTTP API
   * @param {string} apiId - API Gateway HTTP API ID
   * @returns {Promise<Object>} - HTTP API details
   */
  async getHttpApi(apiId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetApiCommand({ ApiId: apiId }),
      )
      return response
    } catch (error) {
      console.error(`Error fetching HTTP API ${apiId}:`, error)
      throw error
    }
  }

  /**
   * Get all routes for a HTTP API
   * @param {string} apiId - API Gateway HTTP API ID
   * @returns {Promise<Array>} - List of routes
   */
  async getRoutes(apiId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetRoutesCommand({ ApiId: apiId }),
      )
      return response.Items || []
    } catch (error) {
      console.error(`Error fetching routes for HTTP API ${apiId}:`, error)
      throw error
    }
  }

  /**
   * Get details for a specific route
   * @param {string} apiId - API Gateway HTTP API ID
   * @param {string} routeId - Route ID
   * @returns {Promise<Object>} - Route details
   */
  async getRoute(apiId, routeId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetRouteCommand({ ApiId: apiId, RouteId: routeId }),
      )
      return response
    } catch (error) {
      console.error(
        `Error fetching route ${routeId} for HTTP API ${apiId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get all integrations for a HTTP API
   * @param {string} apiId - API Gateway HTTP API ID
   * @returns {Promise<Array>} - List of integrations
   */
  async getIntegrations(apiId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetIntegrationsCommand({ ApiId: apiId }),
      )
      return response.Items || []
    } catch (error) {
      console.error(`Error fetching integrations for HTTP API ${apiId}:`, error)
      throw error
    }
  }

  /**
   * Get details for a specific integration
   * @param {string} apiId - API Gateway HTTP API ID
   * @param {string} integrationId - Integration ID
   * @returns {Promise<Object>} - Integration details
   */
  async getIntegration(apiId, integrationId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetIntegrationCommand({
          ApiId: apiId,
          IntegrationId: integrationId,
        }),
      )
      return response
    } catch (error) {
      console.error(
        `Error fetching integration ${integrationId} for HTTP API ${apiId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get all stages for a HTTP API
   * @param {string} apiId - API Gateway HTTP API ID
   * @returns {Promise<Array>} - List of stages
   */
  async getStages(apiId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetStagesCommand({ ApiId: apiId }),
      )
      return response.Items || []
    } catch (error) {
      console.error(`Error fetching stages for HTTP API ${apiId}:`, error)
      throw error
    }
  }

  /**
   * Get details for a specific stage
   * @param {string} apiId - API Gateway HTTP API ID
   * @param {string} stageName - Stage name
   * @returns {Promise<Object>} - Stage details
   */
  async getStage(apiId, stageName) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetStageCommand({ ApiId: apiId, StageName: stageName }),
      )
      return response
    } catch (error) {
      console.error(
        `Error fetching stage ${stageName} for HTTP API ${apiId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get logging configuration for a specific stage
   * @param {string} apiId - API Gateway HTTP API ID
   * @param {string} stageName - Stage name
   * @returns {Promise<Object>} - Logging configuration
   */
  async getStageLoggingConfig(apiId, stageName) {
    try {
      const stage = await this.getStage(apiId, stageName)

      // Extract specific logging properties for convenience
      const loggingConfig = {
        // Include the full stage object to ensure we don't miss any information
        stageDetails: stage,
        // Extract key logging properties for easier access
        accessLogging: stage.AccessLogSettings || null,
        executionLogging:
          stage.DefaultRouteSettings?.DetailedMetricsEnabled || false,
        loggingLevel: stage.DefaultRouteSettings?.LoggingLevel || null,
        dataTraceEnabled: stage.DefaultRouteSettings?.DataTraceEnabled || false,
      }

      return loggingConfig
    } catch (error) {
      console.error(
        `Error fetching logging config for stage ${stageName} of HTTP API ${apiId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get all authorizers for a HTTP API
   * @param {string} apiId - API Gateway HTTP API ID
   * @returns {Promise<Array>} - List of authorizers
   */
  async getAuthorizers(apiId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetAuthorizersCommand({ ApiId: apiId }),
      )
      return response.Items || []
    } catch (error) {
      console.error(`Error fetching authorizers for HTTP API ${apiId}:`, error)
      throw error
    }
  }

  /**
   * Get details for a specific authorizer
   * @param {string} apiId - API Gateway HTTP API ID
   * @param {string} authorizerId - Authorizer ID
   * @returns {Promise<Object>} - Authorizer details
   */
  async getAuthorizer(apiId, authorizerId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetAuthorizerCommand({ ApiId: apiId, AuthorizerId: authorizerId }),
      )
      return response
    } catch (error) {
      console.error(
        `Error fetching authorizer ${authorizerId} for HTTP API ${apiId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get all deployments for a HTTP API
   * @param {string} apiId - API Gateway HTTP API ID
   * @returns {Promise<Array>} - List of deployments
   */
  async getDeployments(apiId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetDeploymentsCommand({ ApiId: apiId }),
      )
      return response.Items || []
    } catch (error) {
      console.error(`Error fetching deployments for HTTP API ${apiId}:`, error)
      throw error
    }
  }

  /**
   * Get details for a specific deployment
   * @param {string} apiId - API Gateway HTTP API ID
   * @param {string} deploymentId - Deployment ID
   * @returns {Promise<Object>} - Deployment details
   */
  async getDeployment(apiId, deploymentId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetDeploymentCommand({ ApiId: apiId, DeploymentId: deploymentId }),
      )
      return response
    } catch (error) {
      console.error(
        `Error fetching deployment ${deploymentId} for HTTP API ${apiId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get all domain names
   * @returns {Promise<Array>} - List of domain names
   */
  async getDomainNames() {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetDomainNamesCommand({}),
      )
      return response.Items || []
    } catch (error) {
      console.error('Error fetching domain names:', error)
      throw error
    }
  }

  /**
   * Get details for a specific domain name
   * @param {string} domainName - Domain name
   * @returns {Promise<Object>} - Domain name details
   */
  async getDomainName(domainName) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetDomainNameCommand({ DomainName: domainName }),
      )
      return response
    } catch (error) {
      console.error(`Error fetching domain name ${domainName}:`, error)
      throw error
    }
  }

  /**
   * Get all API mappings for a domain name
   * @param {string} domainName - Domain name
   * @returns {Promise<Array>} - List of API mappings
   */
  async getApiMappings(domainName) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetApiMappingsCommand({ DomainName: domainName }),
      )
      return response.Items || []
    } catch (error) {
      console.error(
        `Error fetching API mappings for domain ${domainName}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get all VPC links
   * @returns {Promise<Array>} - List of VPC links
   */
  async getVpcLinks() {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetVpcLinksCommand({}),
      )
      return response.Items || []
    } catch (error) {
      console.error('Error fetching VPC links:', error)
      throw error
    }
  }

  /**
   * Get details for a specific VPC link
   * @param {string} vpcLinkId - VPC link ID
   * @returns {Promise<Object>} - VPC link details
   */
  async getVpcLink(vpcLinkId) {
    try {
      const response = await this.apiGatewayV2Client.send(
        new GetVpcLinkCommand({ VpcLinkId: vpcLinkId }),
      )
      return response
    } catch (error) {
      console.error(`Error fetching VPC link ${vpcLinkId}:`, error)
      throw error
    }
  }

  /**
   * Get metrics for HTTP APIs
   * @param {Object} params - Parameters for fetching metrics
   * @param {string[]} params.apiIds - Array of API Gateway HTTP API IDs
   * @param {string[]} params.stageNames - Array of API stage names
   * @param {number} params.startTime - Start time in milliseconds
   * @param {number} params.endTime - End time in milliseconds
   * @param {number} params.period - Period in seconds (minimum 60)
   * @returns {Promise<Object>} - API metrics organized by API ID and stage
   */
  async getHttpApiGatewayMetricData({
    apiIds,
    stageNames,
    startTime,
    endTime,
    period = 3600,
  }) {
    try {
      const metricDataQueries = []
      const metricNames = [
        'Count',
        '4XXError',
        '5XXError',
        'Latency',
        'IntegrationLatency',
        'DataProcessed',
      ]

      const statisticsByMetric = {
        Count: ['Sum', 'Average'],
        '4XXError': ['Sum', 'Average', 'p95'],
        '5XXError': ['Sum', 'Average', 'p95'],
        Latency: ['Average', 'p95', 'p99', 'Maximum'],
        IntegrationLatency: ['Average', 'p95', 'p99', 'Maximum'],
        DataProcessed: ['Sum'],
      }

      // For each API and stage, create metric data queries
      let queryId = 0
      for (const apiId of apiIds) {
        for (const stageName of stageNames) {
          for (const metricName of metricNames) {
            const statistics = statisticsByMetric[metricName]

            for (const stat of statistics) {
              metricDataQueries.push({
                Id: `q${queryId++}`,
                MetricStat: {
                  Metric: {
                    Namespace: 'AWS/ApiGateway',
                    MetricName: metricName,
                    Dimensions: [
                      { Name: 'ApiId', Value: apiId },
                      { Name: 'Stage', Value: stageName },
                    ],
                  },
                  Period: period,
                  Stat: stat,
                },
                ReturnData: true,
              })
            }
          }
        }
      }

      // CloudWatch GetMetricData has a limit of 500 metrics per request
      // If we exceed that, we need to split into multiple requests
      const MAX_METRICS_PER_REQUEST = 500
      const metricDataResults = []

      // Process metrics in chunks of 500
      for (
        let i = 0;
        i < metricDataQueries.length;
        i += MAX_METRICS_PER_REQUEST
      ) {
        const chunkQueries = metricDataQueries.slice(
          i,
          i + MAX_METRICS_PER_REQUEST,
        )

        const command = new GetMetricDataCommand({
          MetricDataQueries: chunkQueries,
          StartTime: new Date(startTime),
          EndTime: new Date(endTime),
        })

        const response = await this.cloudWatchClient.send(command)
        metricDataResults.push(...(response.MetricDataResults || []))
      }

      // Process and organize the metrics by API ID, stage, metric name, and statistic
      const result = {}

      metricDataResults.forEach((metricData) => {
        // Extract information from the metric ID (qX) and label
        // The label format is typically: AWS/ApiGateway MetricName ApiId Stage Statistic
        const labelParts = metricData.Label.split(' ')
        if (labelParts.length < 5) return

        const metricName = labelParts[1]
        const apiId = labelParts[2]
        const stageName = labelParts[3]
        const statistic = labelParts[4]

        // Initialize nested objects if they don't exist
        if (!result[apiId]) result[apiId] = {}
        if (!result[apiId][stageName]) result[apiId][stageName] = {}
        if (!result[apiId][stageName][metricName])
          result[apiId][stageName][metricName] = {}

        // Store the metric data
        result[apiId][stageName][metricName][statistic] = {
          timestamps: metricData.Timestamps.map((t) => t.toISOString()),
          values: metricData.Values,
        }
      })

      return result
    } catch (error) {
      console.error('Error fetching HTTP API Gateway metrics:', error)
      throw error
    }
  }

  /**
   * Get comprehensive information about HTTP APIs
   * @param {string|string[]} apiIds - API Gateway HTTP API ID or array of IDs
   * @param {Object} options - Additional options
   * @param {number} options.startTime - Start time for metrics in milliseconds
   * @param {number} options.endTime - End time for metrics in milliseconds
   * @param {number} options.period - Period for metrics in seconds
   * @returns {Promise<Object>} - Comprehensive HTTP API information
   */
  async getHttpApiDetails(apiIds, options = {}) {
    const { startTime, endTime, period = 3600 } = options

    // Convert single apiId to array for consistent processing
    const apiIdArray = Array.isArray(apiIds) ? apiIds : [apiIds]

    try {
      // Process all APIs in parallel
      const apiDetailsPromises = apiIdArray.map(async (apiId) => {
        try {
          // Create an object to store all the details for this API
          const apiDetails = { apiId }

          // Create an array of promises for parallel execution
          const detailPromises = []

          // Basic API information (always included)
          detailPromises.push(
            this.getHttpApi(apiId)
              .then((info) => {
                apiDetails.apiInfo = info
              })
              .catch((error) => {
                console.error(`Error fetching HTTP API ${apiId}:`, error)
                apiDetails.apiInfo = { error: error.message }
              }),
          )

          // Routes
          detailPromises.push(
            this.getRoutes(apiId)
              .then((routes) => {
                apiDetails.routes = routes
              })
              .catch((error) => {
                console.error(
                  `Error fetching routes for HTTP API ${apiId}:`,
                  error,
                )
                apiDetails.routes = { error: error.message }
              }),
          )

          // Integrations
          detailPromises.push(
            this.getIntegrations(apiId)
              .then((integrations) => {
                apiDetails.integrations = integrations
              })
              .catch((error) => {
                console.error(
                  `Error fetching integrations for HTTP API ${apiId}:`,
                  error,
                )
                apiDetails.integrations = { error: error.message }
              }),
          )

          // Stages
          detailPromises.push(
            this.getStages(apiId)
              .then(async (stages) => {
                apiDetails.stages = stages

                // Get logging configuration for each stage
                if (Array.isArray(stages) && stages.length > 0) {
                  const stageLoggingPromises = stages.map(async (stage) => {
                    if (stage.StageName) {
                      try {
                        const loggingConfig = await this.getStageLoggingConfig(
                          apiId,
                          stage.StageName,
                        )
                        return { stageName: stage.StageName, loggingConfig }
                      } catch (error) {
                        console.error(
                          `Error fetching logging config for stage ${stage.StageName}:`,
                          error,
                        )
                        return {
                          stageName: stage.StageName,
                          loggingConfig: { error: error.message },
                        }
                      }
                    }
                    return null
                  })

                  const stageLoggingResults =
                    await Promise.all(stageLoggingPromises)

                  // Create a map of stage name to logging config
                  const loggingConfigMap = {}
                  stageLoggingResults.forEach((result) => {
                    if (result && result.stageName) {
                      loggingConfigMap[result.stageName] = result.loggingConfig
                    }
                  })

                  apiDetails.stageLoggingConfig = loggingConfigMap
                }
              })
              .catch((error) => {
                console.error(
                  `Error fetching stages for HTTP API ${apiId}:`,
                  error,
                )
                apiDetails.stages = { error: error.message }
              }),
          )

          // Authorizers
          detailPromises.push(
            this.getAuthorizers(apiId)
              .then((authorizers) => {
                apiDetails.authorizers = authorizers
              })
              .catch((error) => {
                console.error(
                  `Error fetching authorizers for HTTP API ${apiId}:`,
                  error,
                )
                apiDetails.authorizers = { error: error.message }
              }),
          )

          // Deployments
          detailPromises.push(
            this.getDeployments(apiId)
              .then((deployments) => {
                apiDetails.deployments = deployments
              })
              .catch((error) => {
                console.error(
                  `Error fetching deployments for HTTP API ${apiId}:`,
                  error,
                )
                apiDetails.deployments = { error: error.message }
              }),
          )

          // Wait for all promises to resolve
          await Promise.all(detailPromises)

          return apiDetails
        } catch (error) {
          console.error(`Error processing HTTP API ${apiId}:`, error)
          return {
            apiId,
            error: error.message,
          }
        }
      })

      // Wait for all API details to be collected
      const apiDetailsResults = await Promise.all(apiDetailsPromises)

      // Create the result object with all API details
      const result = {}
      apiDetailsResults.forEach((apiDetails) => {
        result[apiDetails.apiId] = apiDetails
      })

      // Always fetch metrics after we have all the stage information
      try {
        // Collect all stage names from all APIs
        const stageNames = new Set()
        const validApiIds = []

        // Find all valid APIs that have stages
        for (const apiId of apiIdArray) {
          const apiDetails = result[apiId]
          if (
            apiDetails &&
            apiDetails.stages &&
            Array.isArray(apiDetails.stages)
          ) {
            validApiIds.push(apiId)
            apiDetails.stages.forEach((stage) => {
              if (stage.StageName) {
                stageNames.add(stage.StageName)
              }
            })
          }
        }

        // If we have valid APIs and stages, fetch metrics
        if (validApiIds.length > 0 && stageNames.size > 0) {
          const effectiveStartTime =
            startTime || Date.now() - 24 * 60 * 60 * 1000 // Default to last 24 hours
          const effectiveEndTime = endTime || Date.now()

          const metrics = await this.getHttpApiGatewayMetricData({
            apiIds: validApiIds,
            stageNames: Array.from(stageNames),
            startTime: effectiveStartTime,
            endTime: effectiveEndTime,
            period,
          })

          // Add metrics to each API
          for (const apiId in metrics) {
            if (result[apiId]) {
              result[apiId].metrics = metrics[apiId]
            }
          }
        }
      } catch (error) {
        console.error('Error fetching metrics for HTTP APIs:', error)
        // Add error information to the result
        for (const apiId of apiIdArray) {
          if (result[apiId]) {
            result[apiId].metrics = { error: error.message }
          }
        }
      }

      // If only one API was requested, return just that API's details
      if (!Array.isArray(apiIds)) {
        return result[apiIds]
      }

      return result
    } catch (error) {
      console.error(`Error fetching details for HTTP APIs:`, error)
      throw error
    }
  }
}
