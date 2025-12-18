import { AwsS3Client } from '@serverless/engine/src/lib/aws/s3.js'
import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Get detailed information about an AWS S3 bucket
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.resourceId - S3 bucket name
 * @param {number|string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 *                                      If not provided, defaults to 24 hours ago
 * @param {number|string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 *                                    If not provided, defaults to current time
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The S3 bucket information
 */
export async function getS3ResourceInfo(params) {
  const { resourceId, startTime, endTime, period, region, profile } = params

  try {
    // Create AWS config with region and/or profile if provided
    const awsConfig = {}
    if (region) awsConfig.region = region
    if (profile) awsConfig.profile = profile

    // Create instances of the required clients with the AWS config
    const s3Client = new AwsS3Client(awsConfig)
    const cloudWatchClient = new AwsCloudWatchClient(awsConfig)

    // Get bucket details
    let bucketDetails
    try {
      bucketDetails = await s3Client.getBucketDetails({
        bucketName: resourceId,
      })
    } catch (bucketError) {
      // Check if this is an AWS credentials error
      const credentialErrorMessage = handleAwsCredentialsError(
        bucketError,
        profile,
      )

      return {
        resourceId,
        type: 's3',
        status: 'error',
        error: credentialErrorMessage || bucketError.message,
      }
    }

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
      const metricsData = await cloudWatchClient.getS3MetricData({
        bucketNames: [resourceId],
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        period: period || 3600,
      })

      metrics = metricsData[resourceId]
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
      type: 's3',
      bucketName: resourceId,
      location: bucketDetails.location,
      acl: bucketDetails.acl,
      policy: bucketDetails.policy,
      versioning: bucketDetails.versioning,
      encryption: bucketDetails.encryption,
      metrics,
    }
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    return {
      resourceId,
      type: 's3',
      status: 'error',
      error: credentialErrorMessage || error.message,
    }
  }
}
