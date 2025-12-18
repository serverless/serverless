import { getHttpApiGatewayResourceInfo } from '../../lib/aws/http-api-gateway-resource-info.js'
import { validateAndAdjustParameters } from '../../lib/parameter-validator.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'

/**
 * Get detailed information about AWS HTTP API Gateway APIs
 * @param {Object} params - Parameters for the function
 * @param {string[]} params.apiIds - Array of HTTP API Gateway API IDs
 * @param {string} [params.startTime] - Start time for metrics (ISO string or timestamp)
 * @param {string} [params.endTime] - End time for metrics (ISO string or timestamp)
 * @param {number} [params.period] - Period for metrics in seconds (minimum 60)
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - Tool response with HTTP API Gateway information
 */
export async function getHttpApiGatewayInfo(params) {
  const { apiIds, startTime, endTime, period, region, profile } = params

  if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Error: Please provide at least one HTTP API Gateway API ID',
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
          return await getHttpApiGatewayResourceInfo({
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
            type: 'httpapigateway',
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
          text: JSON.stringify(
            {
              error: errorMessage,
            },
            null,
            2,
          ),
        },
      ],
    }
  }
}
