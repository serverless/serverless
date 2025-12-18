import { APIGateway } from '@aws-sdk/client-api-gateway'
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from '@aws-sdk/client-cloudwatch'
import { addProxyToAwsClient } from '@serverless/util'

export class AwsRestApiGatewayClient {
  constructor(awsConfig = {}) {
    this.apiGatewayClient = addProxyToAwsClient(new APIGateway(awsConfig))
    this.cloudWatchClient = addProxyToAwsClient(new CloudWatchClient(awsConfig))
  }

  async getRestApis() {
    try {
      const response = await this.apiGatewayClient.getRestApis({})
      return response.items || []
    } catch (error) {
      console.error('Error fetching REST APIs:', error)
      throw error
    }
  }

  async getRestApi(restApiId) {
    try {
      // The getRestApi method returns the API details directly, not in an items array
      const api = await this.apiGatewayClient.getRestApi({ restApiId })
      return api
    } catch (error) {
      console.error(`Error fetching REST API ${restApiId}:`, error)
      throw error
    }
  }

  async getApiKeys() {
    try {
      const response = await this.apiGatewayClient.getApiKeys({})
      return response.items || []
    } catch (error) {
      console.error('Error fetching REST API Gateway keys:', error)
      throw error
    }
  }

  async getStages(restApiId) {
    try {
      const response = await this.apiGatewayClient.getStages({ restApiId })
      return response.item || []
    } catch (error) {
      console.error(`Error fetching stages for REST API ${restApiId}:`, error)
      throw error
    }
  }

  async getDeployments(restApiId) {
    try {
      const response = await this.apiGatewayClient.getDeployments({ restApiId })
      return response.items || []
    } catch (error) {
      console.error(
        `Error fetching deployments for REST API ${restApiId}:`,
        error,
      )
      throw error
    }
  }

  async getResources(restApiId) {
    try {
      const response = await this.apiGatewayClient.getResources({ restApiId })
      return response.items || []
    } catch (error) {
      console.error(
        `Error fetching resources for REST API ${restApiId}:`,
        error,
      )
      throw error
    }
  }

  async getIntegration(restApiId, resourceId, httpMethod) {
    try {
      const response = await this.apiGatewayClient.getIntegration({
        restApiId,
        resourceId,
        httpMethod,
      })
      return response
    } catch (error) {
      console.error(
        `Error fetching integration for REST API ${restApiId}, resource ${resourceId}, method ${httpMethod}:`,
        error,
      )
      throw error
    }
  }

  async getUsagePlans() {
    try {
      const response = await this.apiGatewayClient.getUsagePlans({})
      return response.items || []
    } catch (error) {
      console.error('Error fetching REST API Gateway usage plans:', error)
      throw error
    }
  }

  async getVpcLinks() {
    try {
      const response = await this.apiGatewayClient.getVpcLinks({})
      return response.items || []
    } catch (error) {
      console.error('Error fetching REST API Gateway VPC links:', error)
      throw error
    }
  }

  async getRestApiGatewayMetricData({
    apiNames,
    stageNames,
    startTime,
    endTime,
    period = 3600,
  }) {
    // Validate inputs to prevent null values
    if (!apiNames || !apiNames.length) {
      return {}
    }

    // Filter out any null or undefined stage names
    const validStageNames = stageNames?.filter((stageName) => stageName) || []
    if (validStageNames.length === 0) {
      return {}
    }

    const metricDataQueries = []
    const metricNames = [
      'Count',
      '4XXError',
      '5XXError',
      'Latency',
      'IntegrationLatency',
      'CacheHitCount',
      'CacheMissCount',
      'DataProcessed',
      'ThrottledRequests',
    ]

    const statisticsByMetric = {
      Count: ['Sum', 'Average'],
      '4XXError': ['Sum', 'Average', 'p95'],
      '5XXError': ['Sum', 'Average', 'p95'],
      Latency: ['Average', 'p95', 'p99', 'Maximum'],
      IntegrationLatency: ['Average', 'p95', 'p99', 'Maximum'],
      CacheHitCount: ['Sum'],
      CacheMissCount: ['Sum'],
      DataProcessed: ['Sum'],
      ThrottledRequests: ['Sum'],
    }

    // For each API and stage, create metric data queries
    let queryId = 0
    for (const apiName of apiNames) {
      // Skip if API name is null or undefined
      if (!apiName) continue

      for (const stageName of validStageNames) {
        for (const metricName of metricNames) {
          const statistics = statisticsByMetric[metricName]

          for (const stat of statistics) {
            metricDataQueries.push({
              Id: `q${queryId++}`,
              MetricStat: {
                Metric: {
                  Namespace: 'AWS/ApiGateway', // AWS namespace remains the same (cannot be changed)
                  MetricName: metricName,
                  Dimensions: [
                    {
                      Name: 'ApiName',
                      Value: apiName,
                    },
                    {
                      Name: 'Stage',
                      Value: stageName,
                    },
                  ],
                },
                Period: period,
                Stat:
                  stat === 'p95' ? 'p95.00' : stat === 'p99' ? 'p99.00' : stat,
              },
              ReturnData: true,
            })
          }
        }
      }
    }

    if (metricDataQueries.length === 0) {
      return {}
    }

    try {
      const command = new GetMetricDataCommand({
        MetricDataQueries: metricDataQueries,
        StartTime: new Date(startTime),
        EndTime: new Date(endTime),
      })

      const response = await this.cloudWatchClient.send(command)

      // Process and organize the results
      const results = {}

      response.MetricDataResults.forEach((result) => {
        const idParts = result.Id.split('_')
        const metricInfo = metricDataQueries.find((q) => q.Id === result.Id)

        if (!metricInfo) return

        const apiName = metricInfo.MetricStat.Metric.Dimensions.find(
          (d) => d.Name === 'ApiName',
        )?.Value
        const stageName = metricInfo.MetricStat.Metric.Dimensions.find(
          (d) => d.Name === 'Stage',
        )?.Value
        const metricName = metricInfo.MetricStat.Metric.MetricName
        const stat =
          metricInfo.MetricStat.Stat === 'p95.00'
            ? 'p95'
            : metricInfo.MetricStat.Stat === 'p99.00'
              ? 'p99'
              : metricInfo.MetricStat.Stat

        if (!apiName || !stageName) return

        if (!results[apiName]) {
          results[apiName] = {}
        }

        if (!results[apiName][stageName]) {
          results[apiName][stageName] = {}
        }

        if (!results[apiName][stageName][metricName]) {
          results[apiName][stageName][metricName] = {}
        }

        results[apiName][stageName][metricName][stat] = {
          values: result.Values || [],
          timestamps: result.Timestamps?.map((t) => t.toISOString()) || [],
        }
      })

      return results
    } catch (error) {
      console.error('Error fetching API Gateway metrics:', error)
      throw error
    }
  }
}

export default AwsRestApiGatewayClient
