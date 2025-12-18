import { z } from 'zod'
import { getRestApiGatewayResourceInfo } from '../../lib/aws/rest-api-gateway-resource-info.js'
import { validateAndAdjustParameters } from '../../lib/parameter-validator.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'

/**
 * Get detailed information about AWS REST API Gateway APIs
 * @param {Object} params - Parameters for the function
 * @param {string[]} params.apiIds - Array of REST API Gateway API IDs
 * @param {string} [params.startTime] - Start time for metrics (ISO string or timestamp)
 * @param {string} [params.endTime] - End time for metrics (ISO string or timestamp)
 * @param {number} [params.period] - Period for metrics in seconds (minimum 60)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - Tool response with REST API Gateway information
 */
export async function getRestApiGatewayInfo(params) {
  const { apiIds, startTime, endTime, period, region, profile } = params

  if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Error: Please provide at least one REST API Gateway API ID',
        },
      ],
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

  try {
    // Process each API individually to better handle errors
    const apiResults = await Promise.all(
      apiIds.map(async (apiId) => {
        try {
          return await getRestApiGatewayResourceInfo({
            resourceId: apiId,
            startTime: startTimeMs,
            endTime: endTimeMs,
            period: adjustedPeriod,
            region,
            profile,
          })
        } catch (error) {
          // Check if this is an AWS credentials error
          const credentialErrorMessage = handleAwsCredentialsError(
            error,
            profile,
          )

          // Handle individual API errors
          return {
            resourceId: apiId,
            type: 'restapigateway',
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
          text: JSON.stringify(apiResults, null, 2),
        },
      ],
    }
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    // Use the credential error message if available, otherwise use the original error
    const errorMessage = credentialErrorMessage || `Error: ${error.message}`

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
    }
  }
}

// Schema for the tool parameters
export const schema = z.object({
  apiIds: z
    .array(z.string())
    .min(1, { message: 'At least one REST API Gateway API ID is required' }),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  period: z.number().min(60).optional(),
  region: z.string().optional(),
  profile: z.string().optional(),
})

// Tool metadata
export const metadata = {
  name: 'aws-rest-api-gateway-info',
  description:
    'Get detailed information about AWS REST API Gateway APIs for debugging and troubleshooting API issues.',
  parameters: schema,
}
