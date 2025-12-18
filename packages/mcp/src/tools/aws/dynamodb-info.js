import z from 'zod'
import { getDynamoDBResourceInfo } from '../../lib/aws/resource-info.js'
import { validateAndAdjustParameters } from '../../lib/parameter-validator.js'

/**
 * Get detailed information about DynamoDB tables
 *
 * This tool retrieves comprehensive information about DynamoDB tables including:
 * - Table configuration details (throughput, keys, indexes, etc.)
 * - Performance metrics (read/write capacity, throttling events, latency)
 * - Stream metrics (if enabled)
 * - Time-To-Live metrics
 * - Error and system failure metrics
 *
 * The metrics are fetched in parallel for all specified tables to minimize
 * response time. You can specify a time range for metrics data.
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} params.tableNames - Array of DynamoDB table names to get information about
 * @param {string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 * @param {string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - Information about the requested DynamoDB tables
 */
export async function getDynamoDBInfo(params) {
  try {
    const { tableNames, startTime, endTime, period, region, profile } = params

    // Use the array of table names directly
    const tableNamesArray = tableNames

    if (tableNamesArray.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Please provide at least one DynamoDB table name.',
          },
        ],
        isError: true,
      }
    }

    // Validate and adjust time parameters
    const {
      startTimeMs,
      endTimeMs,
      period: adjustedPeriod,
    } = validateAndAdjustParameters({
      startTime,
      endTime,
      period,
    })

    // Process each table in parallel
    const results = await Promise.all(
      tableNamesArray.map(async (tableName) => {
        try {
          const result = await getDynamoDBResourceInfo({
            resourceId: tableName,
            startTime: startTimeMs,
            endTime: endTimeMs,
            period: adjustedPeriod,
            region,
            profile,
          })
          return result
        } catch (error) {
          return {
            resourceId: tableName,
            type: 'dynamodb',
            status: 'error',
            error: error.message,
          }
        }
      }),
    )

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: `Error retrieving DynamoDB information: ${error.message}`,
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

/**
 * Schema for the aws-dynamodb-info tool
 */
export const schema = {
  tableNames: z
    .array(z.string())
    .min(1, 'At least one table name is required')
    .describe('DynamoDB table names to get information about'),
  startTime: z
    .string()
    .optional()
    .describe(
      'Optional start time for metrics and logs. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
        'or a timestamp in milliseconds. If not provided, defaults to 24 hours ago.',
    ),
  endTime: z
    .string()
    .optional()
    .describe(
      'Optional end time for metrics and logs. Can be an ISO date string (e.g., "2023-01-01T00:00:00Z") ' +
        'or a timestamp in milliseconds. If not provided, defaults to current time.',
    ),
  period: z
    .number()
    .min(60)
    .optional()
    .describe(
      'Optional period for metrics in seconds (minimum 60, default 3600). ' +
        'This is the granularity of the metric data points.',
    ),
  region: z.string().optional().describe('Optional region to use'),
  profile: z
    .string()
    .optional()
    .describe('Optional profile to use for credentials'),
}
