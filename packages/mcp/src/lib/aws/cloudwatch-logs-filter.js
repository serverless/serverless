import { AwsCloudWatchClient } from '../../../../engine/src/lib/aws/cloudwatch.js'

/**
 * Filters log events from CloudWatch Logs using the FilterLogEvents API.
 * This function is more cost-effective than CloudWatch Logs Insights queries
 * but less scalable for large volumes of logs.
 *
 * @param {Object} params - Parameters for filtering log events
 * @param {string[]} params.logGroupIdentifiers - Array of CloudWatch Log Group names or ARNs to search within
 * @param {string} [params.filterPattern] - Optional pattern to filter logs by (follows CloudWatch filter pattern syntax)
 * @param {number|string} [params.startTime] - Optional start time for logs (ISO string or timestamp in ms)
 * @param {number|string} [params.endTime] - Optional end time for logs (ISO string or timestamp in ms)
 * @param {number} [params.limit=100] - Optional limit for the number of log events to retrieve per log group
 * @param {string} [params.region] - AWS region
 * @param {string} [params.profile] - AWS profile name
 * @returns {Promise<Object>} - Object containing filtered log events and metadata
 */
/**
 * This function is a wrapper around the AwsCloudWatchClient.filterLogEvents method.
 * It's maintained for backward compatibility with existing code.
 *
 * @see AwsCloudWatchClient.filterLogEvents for the implementation details
 */
export async function filterLogEvents({
  logGroupIdentifiers,
  filterPattern,
  startTime,
  endTime,
  limit = 100,
  region,
  profile,
}) {
  // Configure AWS client
  const awsConfig = {}
  if (region) awsConfig.region = region

  // Set credentials if profile is provided
  if (profile) {
    // The AWS SDK expects the profile to be set in the 'credentials' object
    // but the SDK actually looks for it in the main config
    awsConfig.profile = profile
  }

  // Create CloudWatch client
  const cloudwatchClient = new AwsCloudWatchClient(awsConfig)

  // Use the client's filterLogEvents method
  return cloudwatchClient.filterLogEvents({
    logGroupIdentifiers,
    filterPattern,
    startTime,
    endTime,
    limit,
  })
}

// The parseTimeInput function is now handled by the AwsCloudWatchClient class
