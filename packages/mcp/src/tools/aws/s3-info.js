import { z } from 'zod'
import { getS3ResourceInfo } from '../../lib/aws/resource-info.js'
import { validateAndAdjustParameters } from '../../lib/parameter-validator.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'

/**
 * Get detailed information about AWS S3 buckets
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} params.bucketNames - Array of S3 bucket names
 * @param {string} [params.startTime] - Optional start time for metrics (ISO string or timestamp)
 *                                      If not provided, defaults to 24 hours ago
 * @param {string} [params.endTime] - Optional end time for metrics (ISO string or timestamp)
 *                                    If not provided, defaults to current time
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - The S3 bucket information
 */
export async function getS3Info(params) {
  const { bucketNames, startTime, endTime, period, region, profile } = params

  try {
    if (!Array.isArray(bucketNames) || bucketNames.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Please provide at least one S3 bucket name.',
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

    // Use the shared resource info function to get information for each S3 bucket
    const results = await Promise.all(
      bucketNames.map(async (bucketName) => {
        try {
          // Call the shared function with the appropriate parameters
          const result = await getS3ResourceInfo({
            resourceId: bucketName,
            startTime: startTimeMs,
            endTime: endTimeMs,
            period: adjustedPeriod,
            region,
            profile,
          })

          // Rename resourceId to bucketName for consistency
          const { resourceId, ...rest } = result
          return {
            bucketName: resourceId,
            ...rest,
          }
        } catch (error) {
          // Check if this is an AWS credentials error
          const credentialErrorMessage = handleAwsCredentialsError(
            error,
            profile,
          )

          return {
            bucketName,
            type: 's3',
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

export const s3InfoSchema = z.object({
  bucketNames: z
    .array(z.string())
    .min(1, 'At least one bucket name is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  period: z.number().min(60).optional(),
})

export default {
  handler: getS3Info,
  schema: s3InfoSchema,
}
