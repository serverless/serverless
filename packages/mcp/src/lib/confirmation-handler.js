import { handleAwsCredentialsError } from './aws-credentials-error-handler.js'
import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'

/**
 * Confirmation handler for CloudWatch Logs Insights queries
 * Provides session-based confirmation tracking for potentially costly operations
 */

/**
 * Helper function to check if two timestamps are within a given margin
 * @param {number} timestamp1 - First timestamp to compare
 * @param {number} timestamp2 - Second timestamp to compare
 * @param {number} marginMs - Margin in milliseconds (default: 15 minutes)
 * @returns {boolean} - True if timestamps are within the margin
 */
function areTimestampsWithinMargin(
  timestamp1,
  timestamp2,
  marginMs = 15 * 60 * 1000,
) {
  const timeDifference = Math.abs(timestamp1 - timestamp2)
  return timeDifference <= marginMs
}

// Session-based confirmation tracking
// This will persist for the lifetime of the server
const sessionConfirmations = {
  // Global confirmation for queries with extended timeframes (more than 3 hours)
  extendedTimeframeConfirmed: false,
  // Global confirmation for historical queries (more than 1 month old)
  historicalQueryConfirmed: false,
}

/**
 * Handles confirmation for historical queries (more than 1 month old)
 * @param {number} startTime - Query start time in milliseconds
 * @param {number} endTime - Query end time in milliseconds
 * @param {string} [confirmationToken] - Optional confirmation token from previous request
 * @returns {Object|null} - Returns a response object if confirmation is needed, null if confirmed
 */
/**
 * Validates log groups and returns their size information
 * @param {string[]} logGroups - Array of log group names to validate
 * @param {Object} awsConfig - AWS configuration object
 * @returns {Object} - Object containing validated log groups and size information
 */
export async function validateLogGroups(logGroups, awsConfig = {}) {
  const cloudWatchClient = new AwsCloudWatchClient(awsConfig)
  const validLogGroups = []
  let totalSizeBytes = 0

  // Process log groups in batches of 10 to avoid throttling
  const batchSize = 10
  const batches = []

  for (let i = 0; i < logGroups.length; i += batchSize) {
    batches.push(logGroups.slice(i, i + batchSize))
  }

  try {
    // Process each batch in parallel
    await Promise.all(
      batches.map(async (batch) => {
        // Create promises for each log group in the batch
        const batchPromises = batch.map(async (logGroupName) => {
          // Use describeLogGroups to check if the log group exists
          const response = await cloudWatchClient.describeLogGroups({
            logGroupNamePrefix: logGroupName,
            limit: 1,
          })

          // Check if the exact log group exists in the response
          const exactMatch = response.logGroups?.find(
            (group) => group.logGroupName === logGroupName,
          )

          if (exactMatch) {
            // Add the log group with its size information
            validLogGroups.push({
              name: logGroupName,
              storedBytes: exactMatch.storedBytes || 0,
            })

            // Add to the total size
            if (exactMatch.storedBytes) {
              totalSizeBytes += exactMatch.storedBytes
            }
          } else {
            console.error(`Log group not found: ${logGroupName}`)
          }
        })

        // Wait for all log groups in this batch to be checked
        await Promise.all(batchPromises)
      }),
    )
  } catch (error) {
    console.error('Error validating log groups:', error)
    const errorMessage = handleAwsCredentialsError(error, awsConfig?.profile)
    if (errorMessage) {
      throw new Error(errorMessage)
    }
    throw error
  }

  // Return both the valid log groups and the total size information
  return {
    logGroups: validLogGroups.map((group) => group.name), // For backward compatibility
    logGroupsWithSize: validLogGroups,
    totalSizeBytes,
    totalSizeGB: totalSizeBytes / (1024 * 1024 * 1024), // Convert to GB
  }
}

/**
 * Handles confirmation for historical queries (more than 1 month old)
 * @param {number} startTime - Query start time in milliseconds
 * @param {number} endTime - Query end time in milliseconds
 * @param {string} [confirmationToken] - Optional confirmation token from previous request
 * @returns {Object|null} - Returns a response object if confirmation is needed, null if confirmed
 */
export function handleHistoricalConfirmation(
  startTime,
  endTime,
  confirmationToken,
) {
  const now = Date.now()

  // Use safe defaults for undefined values
  const safeStartTime =
    startTime !== undefined ? startTime : now - 90 * 24 * 60 * 60 * 1000 // Default to 90 days ago if undefined
  const safeEndTime = endTime !== undefined ? endTime : now

  const oneMonthMs = 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds
  const isHistoricalQuery = now - safeStartTime > oneMonthMs

  // Skip if not a historical query or already confirmed
  if (!isHistoricalQuery || sessionConfirmations.historicalQueryConfirmed) {
    return null
  }

  // Generate a confirmation token if one wasn't provided
  if (!confirmationToken) {
    // Calculate how old the data is
    const ageInDays = (now - safeStartTime) / (24 * 60 * 60 * 1000)
    let ageText

    if (ageInDays > 365) {
      ageText = `${(ageInDays / 365).toFixed(1)} years`
    } else {
      ageText = `${ageInDays.toFixed(0)} days`
    }

    // Generate a unique token that includes the timeframe information
    const token = Buffer.from(
      JSON.stringify({
        startTime: safeStartTime,
        endTime: safeEndTime,
        timestamp: Date.now(),
        type: 'historical',
      }),
    ).toString('base64')

    return {
      content: [
        {
          type: 'text',
          text: `The requested start time is ${ageText} old.\n\nIMPORTANT: You will only be asked to confirm historical queries ONCE per session. Please verify that the date range is correct:\n- Start: ${new Date(safeStartTime).toISOString()}\n- End: ${new Date(safeEndTime).toISOString()}\n\nPlease ask the user explicitly: "This query will access logs from ${ageText} ago. Please confirm this is the correct time range you want to query."\n\nOnly if the user explicitly confirms, run this tool again with the same parameters AND include this confirmation token: ${token}`,
        },
      ],
    }
  }

  // Verify the confirmation token is valid
  try {
    const tokenData = JSON.parse(
      Buffer.from(confirmationToken, 'base64').toString(),
    )

    // Verify the token is for historical query
    // Allow a 15-minute margin for both timestamps to account for time differences
    const isStartTimeValid = areTimestampsWithinMargin(
      tokenData.startTime,
      safeStartTime,
    )
    const isEndTimeValid = areTimestampsWithinMargin(
      tokenData.endTime,
      safeEndTime,
    )

    if (
      !isStartTimeValid ||
      !isEndTimeValid ||
      tokenData.type !== 'historical'
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid historical confirmation token. The token doesn't match the current query parameters. Please request a new confirmation from the user.`,
          },
        ],
      }
    }

    // Token is valid, mark as confirmed for the entire session and proceed with the query
    sessionConfirmations.historicalQueryConfirmed = true
    return null
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid historical confirmation token. Please request a new confirmation from the user.`,
        },
      ],
    }
  }
}

/**
 * Handles confirmation for queries with extended timeframes (more than 3 hours)
 * @param {number} startTime - Query start time in milliseconds
 * @param {number} endTime - Query end time in milliseconds
 * @param {string} [confirmationToken] - Optional confirmation token from previous request
 * @param {Object} [logGroupsInfo] - Optional information about log groups size
 * @param {number} [logGroupsInfo.totalSizeGB] - Total size of log groups in GB
 * @param {number} [logGroupsInfo.logGroups] - Array of log group names
 * @returns {Object|null} - Returns a response object if confirmation is needed, null if confirmed
 */
export function handleExtendedTimeframeConfirmation(
  startTime,
  endTime,
  confirmationToken,
  logGroupsInfo,
) {
  const now = Date.now()

  // Use safe defaults for undefined values
  const safeStartTime =
    startTime !== undefined ? startTime : now - 3 * 60 * 60 * 1000 // Default to 3 hours ago if undefined
  const safeEndTime = endTime !== undefined ? endTime : now

  const timeframeDurationMs = safeEndTime - safeStartTime
  const threeHoursMs = 3 * 60 * 60 * 1000

  // Check if log groups size is available and less than 1 GB
  if (
    logGroupsInfo &&
    logGroupsInfo.totalSizeGB !== undefined &&
    logGroupsInfo.totalSizeGB < 1
  ) {
    // Skip confirmation for small log groups (less than 1 GB)
    return null
  }

  // Skip if not an extended timeframe query or already confirmed
  if (
    timeframeDurationMs <= threeHoursMs ||
    sessionConfirmations.extendedTimeframeConfirmed
  ) {
    // Skip confirmation for short timeframes or already confirmed
    return null
  }

  // Generate a confirmation token if one wasn't provided
  if (!confirmationToken) {
    // Calculate the duration in a human-readable format
    let durationText
    const hoursDuration = timeframeDurationMs / (60 * 60 * 1000)

    if (hoursDuration >= 24) {
      const daysDuration = hoursDuration / 24
      durationText = `${daysDuration.toFixed(1)} days`
    } else {
      durationText = `${hoursDuration.toFixed(1)} hours`
    }

    // Generate a unique token that includes the timeframe information
    const token = Buffer.from(
      JSON.stringify({
        startTime: safeStartTime,
        endTime: safeEndTime,
        timestamp: Date.now(),
        type: 'extendedTimeframe',
      }),
    ).toString('base64')

    // Format the size information if available
    let logGroupsCountInfo = ''

    if (logGroupsInfo && logGroupsInfo.totalSizeGB) {
      const estimatedCost = (logGroupsInfo.totalSizeGB * 0.005).toFixed(2)
      const logGroupsCount = logGroupsInfo.logGroups
        ? logGroupsInfo.logGroups.length
        : 'multiple'

      logGroupsCountInfo = ` across ${logGroupsCount} log groups`
    }

    // Prepare the cost estimate for the user message
    const userSizeInfo =
      logGroupsInfo && logGroupsInfo.totalSizeGB
        ? `The selected log groups contain approximately ${logGroupsInfo.totalSizeGB.toFixed(2)} GB of data across all time periods`
        : ''

    const userCostInfo =
      logGroupsInfo && logGroupsInfo.totalSizeGB
        ? `Only data within your specified timeframe and relevant to your query will be scanned, so the actual cost will be significantly lower than the theoretical maximum of $${(logGroupsInfo.totalSizeGB * 0.005).toFixed(2)}`
        : 'Costs are based on the amount of data scanned and vary depending on the AWS region.'

    return {
      content: [
        {
          type: 'text',
          text: `IMPORTANT: CloudWatch Logs Insights queries incur costs based on the amount of data scanned.\n\nPlease ask the user explicitly: "This query will scan logs over ${durationText}${logGroupsCountInfo}. ${userSizeInfo}. ${userCostInfo}. You'll only be asked to confirm once per session. Do you want to proceed?"\n\nOnly if the user explicitly confirms, run this tool again with the same parameters AND include this confirmation token: ${token}`,
        },
      ],
    }
  }

  // Verify the confirmation token is valid
  try {
    const tokenData = JSON.parse(
      Buffer.from(confirmationToken, 'base64').toString(),
    )

    // Verify the token is for extended timeframe query
    // Allow a 15-minute margin for both timestamps to account for time differences when using current time
    const isStartTimeValid = areTimestampsWithinMargin(
      tokenData.startTime,
      safeStartTime,
    )
    const isEndTimeValid = areTimestampsWithinMargin(
      tokenData.endTime,
      safeEndTime,
    )

    if (
      !isStartTimeValid ||
      !isEndTimeValid ||
      tokenData.type !== 'extendedTimeframe'
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid confirmation token. The token doesn't match the current query parameters. Please request a new confirmation from the user.`,
          },
        ],
      }
    }

    // Token is valid, mark as confirmed for the entire session and proceed with the query
    sessionConfirmations.extendedTimeframeConfirmed = true
    return null
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid confirmation token. Please request a new confirmation from the user.`,
        },
      ],
    }
  }
}
