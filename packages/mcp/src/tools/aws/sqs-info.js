import { z } from 'zod'
import { getSqsResourceInfo } from '../../lib/aws/resource-info.js'
import { validateAndAdjustParameters } from '../../lib/parameter-validator.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'

/**
 * Get detailed information about AWS SQS queues
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} params.queueNames - Array of SQS queue names or URLs
 * @param {string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 *                                      If not provided, defaults to 24 hours ago
 * @param {string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 *                                    If not provided, defaults to current time
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The SQS queue information
 */
export async function getSqsInfo(params) {
  const { queueNames, startTime, endTime, period, region, profile } = params

  try {
    if (!Array.isArray(queueNames) || queueNames.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Please provide at least one SQS queue name or URL.',
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

    // Use the shared resource info function to get information for each SQS queue
    const results = await Promise.all(
      queueNames.map(async (queueName) => {
        try {
          // Call the shared function with the appropriate parameters
          const result = await getSqsResourceInfo({
            resourceId: queueName,
            startTime: startTimeMs,
            endTime: endTimeMs,
            period: adjustedPeriod,
            region,
            profile,
          })

          // Extract queue name from URL if it's a URL
          const extractedQueueName = queueName.includes('amazonaws.com')
            ? queueName.split('/').pop()
            : queueName

          // For queue URLs, ensure both queueName and queueUrl are set correctly
          if (queueName.includes('amazonaws.com')) {
            return {
              ...result,
              queueName: extractedQueueName,
              queueUrl: queueName,
            }
          } else {
            // For queue names, the queueUrl should come from the result
            return {
              ...result,
              queueName: extractedQueueName,
            }
          }
        } catch (error) {
          // Extract queue name from URL if it's a URL
          const extractedQueueName = queueName.includes('amazonaws.com')
            ? queueName.split('/').pop()
            : queueName

          // Check if this is an AWS credentials error
          const credentialErrorMessage = handleAwsCredentialsError(
            error,
            profile,
          )

          return {
            queueName: extractedQueueName,
            type: 'sqs',
            status: 'error',
            error: credentialErrorMessage || error.message,
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
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    // Use the credential error message if available, otherwise use the original error
    const errorMessage = credentialErrorMessage || `Error: ${error.message}`

    return {
      content: [
        {
          type: 'text',
          text: errorMessage,
        },
      ],
      isError: true,
    }
  }
}

// Schema for validation
export const schema = z.object({
  queueNames: z.array(z.string()).min(1, 'At least one queue name is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  period: z
    .number()
    .min(60)
    .optional()
    .or(z.string().transform((val) => parseInt(val, 10))),
})

// Metadata for the tool
export const meta = {
  name: 'sqs-info',
  description:
    'Get detailed information about AWS SQS queues including attributes and metrics',
  schema,
}
