import { AwsDynamoDBClient } from '@serverless/engine/src/lib/aws/dynamodb.js'
import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Get detailed information about an AWS DynamoDB table
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.resourceId - DynamoDB table name
 * @param {number|string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 * @param {number|string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The DynamoDB table information
 */
export async function getDynamoDBResourceInfo(params) {
  const { resourceId, startTime, endTime, period, region, profile } = params

  try {
    // Create AWS config with region and/or profile if provided
    const awsConfig = {}
    if (region) awsConfig.region = region
    if (profile) awsConfig.profile = profile

    // Create instances of the required clients with the AWS config
    const dynamoDBClient = new AwsDynamoDBClient(awsConfig)
    const cloudWatchClient = new AwsCloudWatchClient(awsConfig)

    // Set default time range to last 24 hours if not provided
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    // Parse dates if they are ISO strings
    let parsedStartTime = oneDayAgo
    let parsedEndTime = now

    if (startTime) {
      parsedStartTime =
        typeof startTime === 'string' && startTime.includes('-')
          ? new Date(startTime).getTime()
          : parseInt(startTime, 10)
    }

    if (endTime) {
      parsedEndTime =
        typeof endTime === 'string' && endTime.includes('-')
          ? new Date(endTime).getTime()
          : parseInt(endTime, 10)
    }

    // Get table details first as we need the ARN for resource policy
    const tableName = resourceId
    const tableDetails = await dynamoDBClient.describeTable({ tableName })

    // Run all other API calls in parallel
    let [
      continuousBackups,
      kinesisStreamingDestination,
      tableReplicaAutoScaling,
      timeToLive,
      metrics,
    ] = await Promise.all([
      dynamoDBClient.describeContinuousBackups({ tableName }),
      dynamoDBClient.describeKinesisStreamingDestination({ tableName }),
      dynamoDBClient.describeTableReplicaAutoScaling({ tableName }),
      dynamoDBClient.describeTimeToLive({ tableName }),
      // Fetch metrics using the time range (default or provided)
      (async () => {
        try {
          const metricsData = await cloudWatchClient.getDynamoDBMetricData({
            tableNames: [tableName],
            startTime: parsedStartTime,
            endTime: parsedEndTime,
            period: period || 3600,
          })
          return metricsData[tableName]
        } catch (metricsError) {
          // Check if this is an AWS credentials error
          const credentialErrorMessage = handleAwsCredentialsError(
            metricsError,
            profile,
          )
          return { error: credentialErrorMessage || metricsError.message }
        }
      })(),
    ])

    // Helper function to enhance error messages with AWS credentials error handling
    const enhanceErrorMessage = (result) => {
      if (result && result.error) {
        const credentialErrorMessage = handleAwsCredentialsError(
          { message: result.error },
          profile,
        )
        if (credentialErrorMessage) {
          result.error = credentialErrorMessage
        }
      }
      return result
    }

    // Check for credential errors in the results and enhance them
    continuousBackups = enhanceErrorMessage(continuousBackups)
    kinesisStreamingDestination = enhanceErrorMessage(
      kinesisStreamingDestination,
    )
    tableReplicaAutoScaling = enhanceErrorMessage(tableReplicaAutoScaling)
    timeToLive = enhanceErrorMessage(timeToLive)

    // Get resource policy (requires table ARN) - can't be parallelized with the initial calls
    // because it depends on the tableDetails result
    let resourcePolicy = { Policy: 'No policy attached' }
    if (tableDetails && tableDetails.Table && tableDetails.Table.TableArn) {
      try {
        resourcePolicy = await dynamoDBClient.getResourcePolicy({
          resourceArn: tableDetails.Table.TableArn,
        })
        // If no policy is returned, provide a default value
        if (!resourcePolicy.Policy) {
          resourcePolicy.Policy = 'No policy attached'
        }
      } catch (error) {
        // Check if this is an AWS credentials error
        const credentialErrorMessage = handleAwsCredentialsError(error, profile)
        resourcePolicy = {
          Policy:
            'Error fetching policy: ' +
            (credentialErrorMessage || error.message),
        }
      }
    }

    return {
      resourceId,
      type: 'dynamodb',
      tableName,
      tableDetails,
      continuousBackups,
      kinesisStreamingDestination,
      tableReplicaAutoScaling,
      timeToLive,
      resourcePolicy,
      metrics,
    }
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    return {
      resourceId,
      type: 'dynamodb',
      status: 'error',
      error: credentialErrorMessage || error.message,
    }
  }
}
