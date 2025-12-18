import { filterLogEvents } from '../../lib/aws/cloudwatch-logs-filter.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'

/**
 * Retrieves the most recent logs from AWS CloudWatch Log Groups using the FilterLogEvents API.
 * This tool is free to use (unlike CloudWatch Logs Insights) but less scalable for large volumes of logs.
 * It's ideal for debugging recent Lambda executions or checking the latest logs from a service.
 *
 * @param {Object} params - Parameters for the logs tail operation
 * @param {string[]} params.logGroupIdentifiers - Array of CloudWatch Log Group names or ARNs
 * @param {string} [params.filterPattern] - Optional pattern to filter logs by
 * @param {string|number} [params.startTime] - Optional start time (defaults to 15 minutes ago)
 * @param {string|number} [params.endTime] - Optional end time (defaults to current time)
 * @param {number} [params.limit=100] - Optional limit for log events per group
 * @param {string} [params.region] - AWS region
 * @param {string} [params.profile] - AWS profile name
 * @returns {Promise<Object>} - MCP response object with log events
 */
export async function getLogsTail(params) {
  const {
    logGroupIdentifiers,
    filterPattern,
    startTime,
    endTime,
    limit = 100,
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

    // Execute the CloudWatch Logs FilterLogEvents API call
    const result = await filterLogEvents({
      logGroupIdentifiers,
      filterPattern,
      startTime,
      endTime,
      limit,
      region,
      profile,
    })

    // Destructure the result with default values to prevent undefined errors
    const { events = [], errors = [], timeRange, metadata } = result || {}

    // Prepare the structured response object
    const response = {
      title: 'Recent Logs (Tail)',
      timeRange,
      metadata,
      logGroups: [],
      errors: errors.length > 0 ? errors : undefined,
    }

    // Format and add the log events
    if (events.length > 0) {
      // Group events by log group
      const eventsByLogGroup = events.reduce((groups, event) => {
        const { logGroupName } = event
        if (!groups[logGroupName]) {
          groups[logGroupName] = []
        }
        groups[logGroupName].push(event)
        return groups
      }, {})

      // Process each log group's events
      Object.entries(eventsByLogGroup).forEach(
        ([logGroupName, groupEvents]) => {
          // Group events by log stream within this log group
          const eventsByStream = groupEvents.reduce((streams, event) => {
            const streamName = event.logStreamName || 'unknown'
            if (!streams[streamName]) {
              streams[streamName] = []
            }
            streams[streamName].push(event)
            return streams
          }, {})

          // Format the log group entry
          const logGroupEntry = {
            name: logGroupName,
            logStreams: [],
          }

          // Add each log stream's events
          Object.entries(eventsByStream).forEach(
            ([streamName, streamEvents]) => {
              const logStreamEntry = {
                name: streamName,
                events: streamEvents.map((event) => ({
                  timestamp: new Date(event.timestamp).toISOString(),
                  message: event.message || '',
                  eventId: event.eventId,
                })),
              }
              logGroupEntry.logStreams.push(logStreamEntry)
            },
          )

          response.logGroups.push(logGroupEntry)
        },
      )
    }

    // Return a single stringified JSON response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    }
  } catch (error) {
    console.error(`Log Tail Tool Error: ${error.message || String(error)}`)

    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    // Use the credential error message if available, otherwise use the original error
    const errorMessage =
      credentialErrorMessage ||
      `Failed to retrieve logs: ${error.message || String(error)}`

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
