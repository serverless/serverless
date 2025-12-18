import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'
import { handleAwsCredentialsError } from '../aws-credentials-error-handler.js'

/**
 * Parse a timestamp string or number into milliseconds
 *
 * @param {string|number} timestamp - The timestamp to parse
 * @returns {number} - The timestamp in milliseconds
 */
export function parseTimestamp(timestamp) {
  if (typeof timestamp === 'number') {
    return timestamp
  }

  if (typeof timestamp === 'string') {
    // Try to parse as ISO date string
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      return date.getTime()
    }

    // Try to parse as a numeric string, but only if it's a pure number
    if (/^\d+$/.test(timestamp)) {
      const numericTimestamp = parseInt(timestamp, 10)
      return numericTimestamp
    }
  }

  throw new Error(`Failed to parse timestamp: ${timestamp}`)
}

/**
 * Execute a CloudWatch Logs Insights query across multiple log groups
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} params.logGroupIdentifiers - Array of CloudWatch Log Group names or ARNs
 * @param {string} params.queryString - The CloudWatch Logs Insights query string
 * @param {string} [params.startTime] - Optional start time for logs (ISO string or timestamp)
 *                                      If not provided, defaults to 3 hours ago
 * @param {string} [params.endTime] - Optional end time for logs (ISO string or timestamp)
 *                                    If not provided, defaults to current time
 * @param {number} [params.limit=100] - Optional limit for the number of log events to return
 * @param {string} [params.region] - Optional region to use for AWS requests
 * @param {string} [params.profile] - Optional profile to use for AWS credentials
 * @returns {Promise<Object>} - The query results and any errors
 */
export async function executeCloudWatchLogsQuery(params) {
  const {
    logGroupIdentifiers,
    queryString,
    startTime,
    endTime,
    limit = 100,
    region,
    profile,
  } = params

  // Parse timestamps or use defaults (3 hours ago to now)
  const now = new Date()
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)

  const startTimeMs = startTime
    ? parseTimestamp(startTime)
    : threeHoursAgo.getTime()
  const endTimeMs = endTime ? parseTimestamp(endTime) : now.getTime()

  // Create CloudWatch client with provided region and profile
  const awsConfig = {}

  // Set region if provided
  if (region) {
    awsConfig.region = region
  }

  // Set credentials if profile is provided
  if (profile) {
    // The AWS SDK expects the profile to be set in the 'credentials' object
    // but the SDK actually looks for it in the main config
    awsConfig.profile = profile
  }

  const cloudwatchClient = new AwsCloudWatchClient(awsConfig)

  try {
    // Use the shared engine implementation to execute the query
    const result = await cloudwatchClient.executeLogsInsightsQuery({
      logGroupIdentifiers,
      queryString,
      startTime: startTimeMs,
      endTime: endTimeMs,
      limit,
    })

    // Ensure the result has the expected structure
    return {
      events: result.events || [],
      errors: result.errors || [],
      timeRange: result.timeRange || {
        start: new Date(startTimeMs).toISOString(),
        end: new Date(endTimeMs).toISOString(),
      },
    }
  } catch (error) {
    console.error(
      `CloudWatch Logs Insights Query Error: ${error.message || String(error)}`,
    )

    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    // Use the credential error message if available, otherwise use the original error
    const errorMessage =
      credentialErrorMessage ||
      `Error executing CloudWatch Logs Insights query: ${error.message || String(error)}`

    return {
      events: [],
      errors: [errorMessage],
      timeRange: {
        start: new Date(startTimeMs).toISOString(),
        end: new Date(endTimeMs).toISOString(),
      },
    }
  }
}

// Import the error filter pattern directly to avoid dynamic imports
import { ERROR_FILTER_PATTERN } from './errors-info-patterns.js'

/**
 * Build a CloudWatch Logs Insights query string for searching logs
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} [params.searchTerms] - Array of search terms to filter logs
 * @param {number} [params.limit=100] - Optional limit for the number of log events to return
 * @param {boolean} [params.errorsOnly=false] - If true, only show logs that match error patterns
 * @returns {string} - The CloudWatch Logs Insights query string
 */
export function buildLogsSearchQuery(params) {
  const { searchTerms, limit = 100, errorsOnly = false } = params

  // Build the filter conditions for the query
  const filterConditions = []

  // If errorsOnly is true, add the error filter pattern
  if (errorsOnly) {
    filterConditions.push(`@message like /${ERROR_FILTER_PATTERN}/`)
  }

  if (searchTerms && Array.isArray(searchTerms) && searchTerms.length > 0) {
    // Create filter conditions for each search term
    searchTerms.forEach((term) => {
      // Use (?i) prefix for case-insensitive regex matching
      filterConditions.push(`@message like /(?i)${term}/`)
    })
  }

  const filterClause =
    filterConditions.length > 0
      ? `| filter ${filterConditions.join(' or ')}`
      : ''

  // CloudWatch Logs Insights query to find and sort logs across all log groups
  return `
    fields @timestamp, @logStream, @log, @message
    ${filterClause}
    | sort @timestamp asc
    | limit ${limit}
  `
}
