import { AwsLambdaClient } from '@serverless/engine/src/lib/aws/lambda.js'
import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'
import { getErrorsInfoWithPatterns } from './errors-info-patterns.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Get detailed information about an AWS Lambda function
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.resourceId - Lambda function name or ARN
 * @param {number|string} [params.startTime] - Optional start time for metrics and error logs (ISO string or timestamp)
 * @param {number|string} [params.endTime] - Optional end time for metrics and error logs (ISO string or timestamp)
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use for all cloud provider requests
 * @param {string} [params.profile] - Optional profile to use for all cloud provider requests
 * @param {string} [params.confirmationToken] - Optional confirmation token from previous request
 * @returns {Promise<Object>} - The Lambda function information
 */
export async function getLambdaResourceInfo(params) {
  const {
    resourceId,
    startTime,
    endTime,
    period,
    region,
    profile,
    confirmationToken,
  } = params

  try {
    // Create instances of the required clients with region and/or profile if provided
    const awsConfig = {}
    if (region) awsConfig.region = region
    if (profile) awsConfig.profile = profile
    const lambdaClient = new AwsLambdaClient(awsConfig)
    const cloudWatchClient = new AwsCloudWatchClient(awsConfig)

    // Get Lambda function details
    const functionDetails =
      await lambdaClient.getLambdaFunctionDetails(resourceId)
    const errorResponse = handleAwsCredentialsError(
      functionDetails?.error,
      profile,
    )
    if (errorResponse) {
      functionDetails.error = errorResponse
    }

    // Extract the actual function name from the ARN or alias if provided
    const actualFunctionName = resourceId.includes(':')
      ? resourceId.split(':')[0]
      : resourceId

    // Set default time range to last 24 hours if not provided
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    // Parse dates if they are ISO strings (for both metrics and error logs)
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
      const metricsData = await cloudWatchClient.getMetricData({
        functionNames: [actualFunctionName],
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        period: period || 3600,
      })

      metrics = metricsData[actualFunctionName]
    } catch (metricsError) {
      const errorResponse = handleAwsCredentialsError(metricsError, profile)
      metrics = { error: errorResponse || metricsError.message }
    }

    // Fetch error logs with pattern analysis using the time range (default or provided)
    let errorLogs = null
    try {
      // Use the imported getErrorsInfoWithPatterns function

      // Use the pattern analytics to get more detailed error information
      // Check if the Lambda function has a custom log group configured
      let logGroupName = null

      // Extract log group from function configuration if available
      // The LoggingConfig property contains the custom log group if configured
      if (functionDetails.function?.Configuration?.LoggingConfig?.LogGroup) {
        logGroupName =
          functionDetails.function.Configuration.LoggingConfig.LogGroup
      } else {
        // Default to the standard log group naming pattern
        logGroupName = `/aws/lambda/${actualFunctionName}`
      }

      // Check if the timeframe is longer than 7 days (604800000 ms)
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000
      let limitedStartTime = parsedStartTime
      let timeframeLimited = false

      if (parsedEndTime - parsedStartTime > sevenDaysInMs) {
        // Limit to last 7 days from the end date
        limitedStartTime = parsedEndTime - sevenDaysInMs
        timeframeLimited = true
      }

      const errorsInfo = await getErrorsInfoWithPatterns({
        startTime: limitedStartTime,
        endTime: parsedEndTime,
        logGroupIdentifiers: [logGroupName],
        maxResults: 100,
        region,
        profile,
        confirmationToken,
      })

      if (errorsInfo.content) {
        return errorsInfo
      }

      // Transform the response to fit the expected format
      errorLogs = {
        patterns: errorsInfo.errorGroups || [],
        summary: errorsInfo.summary || { totalErrors: 0, uniqueErrorGroups: 0 },
        message: errorsInfo.message || null,
        timeframeLimited: timeframeLimited,
      }

      // Add a note for the agent if the timeframe was limited
      if (timeframeLimited) {
        errorLogs.agentNote = `Note: Error patterns were limited to the last 7 days (ending at ${new Date(parsedEndTime).toISOString()}) to reduce query costs and processing time. To analyze errors over a longer timeframe, use the aws-errors-info tool directly.`
      }
    } catch (errorLogsError) {
      errorLogs = { error: errorLogsError.message }
    }

    return {
      resourceId,
      type: 'lambda',
      ...functionDetails,
      metrics,
      errorLogs,
    }
  } catch (error) {
    return {
      resourceId,
      type: 'lambda',
      status: 'error',
      error: error.message,
    }
  }
}
