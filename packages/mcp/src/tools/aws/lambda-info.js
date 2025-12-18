import { z } from 'zod'
import { getLambdaResourceInfo } from '../../lib/aws/resource-info.js'
import { validateAndAdjustParameters } from '../../lib/parameter-validator.js'

/**
 * Get detailed information about AWS Lambda functions
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} params.functionNames - Array of Lambda function names or ARNs
 * @param {string} [params.startTime] - Optional start time for metrics and error logs (ISO string or timestamp)
 *                                      If not provided, defaults to 24 hours ago
 * @param {string} [params.endTime] - Optional end time for metrics and error logs (ISO string or timestamp)
 *                                    If not provided, defaults to current time
 * @param {number} [params.period] - Optional period for metrics in seconds (minimum 60, default 3600)
 * @param {string} [params.region] - Optional region to use for all cloud provider requests
 * @param {string} [params.profile] - Optional profile to use for all cloud provider requests
 * @param {string} [params.confirmationToken] - Optional confirmation token from previous request
 * @returns {Promise<Object>} - The Lambda function information
 */
export async function getLambdaInfo(params) {
  const {
    functionNames,
    startTime,
    endTime,
    period,
    region,
    profile,
    confirmationToken,
  } = params

  try {
    if (!Array.isArray(functionNames) || functionNames.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Please provide at least one Lambda function name or ARN.',
          },
        ],
        isError: true,
      }
    }

    // Use parameter validator to optimize parameters based on timeframe
    const {
      startTimeMs: parsedStartTime,
      endTimeMs: parsedEndTime,
      period: adjustedPeriod,
    } = validateAndAdjustParameters({
      startTime,
      endTime,
      period,
    })

    // Use the shared resource info function to get information for each Lambda function
    const results = await Promise.all(
      functionNames.map(async (functionName) => {
        try {
          // Call the shared function with the appropriate parameters
          const result = await getLambdaResourceInfo({
            resourceId: functionName,
            startTime: parsedStartTime,
            endTime: parsedEndTime,
            period: adjustedPeriod,
            region,
            profile,
            confirmationToken,
          })

          if (result.content) {
            return result
          }

          // Rename resourceId to functionName for backward compatibility
          const { resourceId, ...rest } = result
          return {
            functionName: resourceId,
            ...rest,
          }
        } catch (error) {
          return {
            functionName,
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
          text: `Error retrieving Lambda function information: ${error.message}`,
        },
      ],
      isError: true,
    }
  }
}

// Schema for validation
export const schema = z.object({
  functionNames: z
    .array(z.string())
    .min(1, 'At least one function name is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  period: z
    .number()
    .min(60)
    .optional()
    .or(z.string().transform((val) => parseInt(val, 10))),
  region: z.string().optional(),
  profile: z.string().optional(),
})

// Metadata for the tool
export const meta = {
  name: 'lambda-info',
  description:
    'Get detailed information about AWS Lambda functions including configuration, metrics, and error logs',
  schema,
}
