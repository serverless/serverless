import {
  executeCloudWatchLogsQuery,
  buildLogsSearchQuery,
  parseTimestamp,
} from '../../lib/aws/cloudwatch-logs-insights.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'
import {
  handleHistoricalConfirmation,
  handleExtendedTimeframeConfirmation,
  validateLogGroups,
} from '../../lib/confirmation-handler.js'

/**
 * Search logs across multiple AWS CloudWatch Log Groups simultaneously
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} params.logGroupIdentifiers - Array of CloudWatch Log Group names or ARNs
 * @param {string} [params.searchTerms] - Search terms to filter logs (space-separated for multiple terms)
 * @param {string} [params.startTime] - Optional start time for logs (ISO string or timestamp)
 *                                      If not provided, defaults to 3 hours ago
 * @param {string} [params.endTime] - Optional end time for logs (ISO string or timestamp)
 *                                    If not provided, defaults to current time
 * @param {number} [params.limit=100] - Optional limit for the number of log events to return
 * @param {boolean} [params.errorsOnly=false] - If true, only show logs that match common error patterns
 * @param {string} [params.region] - Optional region to use for AWS requests
 * @param {string} [params.profile] - Optional profile to use for AWS credentials
 * @returns {Promise<Object>} - The log search results in chronological order
 */
export async function getLogsSearch(params) {
  const {
    logGroupIdentifiers,
    searchTerms,
    startTime,
    endTime,
    limit = 100,
    errorsOnly = false,
    region,
    profile,
  } = params

  try {
    if (
      !Array.isArray(logGroupIdentifiers) ||
      logGroupIdentifiers.length === 0
    ) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error:
                  'Please provide at least one CloudWatch Log Group name or ARN.',
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      }
    }

    // Parse timestamps for confirmation checks
    const parsedStartTime = parseTimestamp(startTime)
    const parsedEndTime = parseTimestamp(endTime)

    // Check for historical data confirmation (more than 1 month old)
    const historicalResponse = handleHistoricalConfirmation(
      parsedStartTime,
      parsedEndTime,
      params.confirmationToken,
    )
    if (historicalResponse) {
      return historicalResponse
    }

    // Check for extended timeframe query confirmation (more than 3 hours)
    // First validate log groups to get size information
    const logGroupsInfo = await validateLogGroups(params.logGroupIdentifiers, {
      region: params.region,
      profile: params.profile,
    })

    const extendedTimeframeResponse = handleExtendedTimeframeConfirmation(
      parsedStartTime,
      parsedEndTime,
      params.confirmationToken,
      logGroupsInfo, // Pass the log group size information
    )

    if (extendedTimeframeResponse) {
      return extendedTimeframeResponse
    }

    // Build the query string for log searching
    const queryString = buildLogsSearchQuery({
      searchTerms,
      limit,
      errorsOnly,
    })

    // Execute the CloudWatch Logs Insights query
    const queryResult = await executeCloudWatchLogsQuery({
      logGroupIdentifiers,
      queryString,
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      limit,
      region,
      profile,
    })

    // Destructure the query result with default values to prevent undefined errors
    const {
      events: allEvents = [],
      errors = [],
      timeRange,
      statistics,
    } = queryResult || {}

    // Prepare the response
    const content = []

    // Add summary information
    content.push({
      type: 'text',
      text: JSON.stringify(
        {
          title: 'Log Search Results',
          timeRange,
          logGroupsCount: logGroupIdentifiers.length,
          totalEvents: allEvents.length,
          errorsOnly: errorsOnly
            ? 'Showing only error-related logs'
            : 'Showing all logs',
          statistics: statistics || undefined,
        },
        null,
        2,
      ),
    })

    // Add any errors if they occurred
    if (errors && errors.length > 0) {
      content.push({
        type: 'text',
        text: JSON.stringify(
          {
            errors: errors,
          },
          null,
          2,
        ),
      })
    }

    // Timeline visualization
    if (allEvents.length > 0) {
      // Convert events to a structured JSON format for AI agent consumption
      const formattedEvents = allEvents.map((event) => ({
        timestamp: event.timestamp || 'N/A',
        logGroupName: event.logGroupName || 'N/A',
        logStream: event.logStream || 'N/A',
        message: event.message || 'N/A',
      }))

      content.push({
        type: 'text',
        text: JSON.stringify(
          {
            timeline: {
              description: 'Events sorted by timestamp',
              events: formattedEvents,
            },
          },
          null,
          2,
        ),
      })
    } else {
      content.push({
        type: 'text',
        text: JSON.stringify(
          {
            message:
              'No matching log events found in the specified time range and filters.',
          },
          null,
          2,
        ),
      })
    }

    return {
      content,
      logGroups: logGroupIdentifiers,
      timeRange,
      events: allEvents,
      errors: errors && errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    // Use the credential error message if available, otherwise use the original error
    const errorMessage =
      credentialErrorMessage ||
      `Error searching logs: ${error.message || String(error)}`

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: errorMessage,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    }
  }
}
