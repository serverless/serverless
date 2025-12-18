import { AwsSqsClient } from '@serverless/engine/src/lib/aws/sqs.js'
import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Get detailed information about an AWS SQS queue
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.resourceId - SQS queue URL or name
 * @param {number|string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 * @param {number|string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The SQS queue information
 */
export async function getSqsResourceInfo(params) {
  const { resourceId, startTime, endTime, period, region, profile } = params

  try {
    // Create AWS config with region and/or profile if provided
    const awsConfig = {}
    if (region) awsConfig.region = region
    if (profile) awsConfig.profile = profile

    // Create instances of the required clients with the AWS config
    const sqsClient = new AwsSqsClient(awsConfig)
    const cloudWatchClient = new AwsCloudWatchClient(awsConfig)

    // Determine if resourceId is a queue URL or queue name
    let queueUrl = resourceId
    let queueName = resourceId

    if (resourceId.includes('amazonaws.com')) {
      // Extract queue name from URL
      queueName = sqsClient.getQueueNameFromUrl(resourceId)
    } else {
      // Get queue URL from name
      try {
        // Since getQueueUrl doesn't exist, we need to list queues and find the one with matching name
        const queueUrls = await sqsClient.listQueues({
          queueNamePrefix: resourceId,
        })

        // Find the exact queue by name
        const matchingQueue = queueUrls.find(
          (url) => sqsClient.getQueueNameFromUrl(url) === resourceId,
        )

        if (!matchingQueue) {
          throw new Error(`Queue with name '${resourceId}' not found`)
        }

        queueUrl = matchingQueue
      } catch (error) {
        if (error.message.includes('Queue with name')) {
          throw error
        } else {
          throw new Error(`Failed to get queue URL: ${error.message}`)
        }
      }
    }

    // Get queue details
    const attributes = await sqsClient.getQueueAttributes({ queueUrl })

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

    // Fetch metrics using the time range (default or provided)
    let metrics = null
    try {
      const metricsData = await cloudWatchClient.getSqsMetricData({
        queueNames: [queueName],
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        period: period || 3600,
      })

      metrics = metricsData[queueName]
    } catch (metricsError) {
      // Check if this is an AWS credentials error
      const credentialErrorMessage = handleAwsCredentialsError(
        metricsError,
        profile,
      )

      metrics = { error: credentialErrorMessage || metricsError.message }
    }

    return {
      resourceId,
      type: 'sqs',
      queueUrl,
      queueName,
      attributes,
      metrics,
    }
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    return {
      resourceId,
      type: 'sqs',
      status: 'error',
      error: credentialErrorMessage || error.message,
    }
  }
}
