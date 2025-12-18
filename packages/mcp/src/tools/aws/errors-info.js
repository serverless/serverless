/**
 * AWS Errors Info Tool - Analyzes and groups error patterns from CloudWatch logs using pattern analytics
 */
import { getErrorsInfoWithPatterns } from '../../lib/aws/errors-info-patterns.js'
import { parseTimestamp } from '../../lib/aws/cloudwatch-logs-insights.js'
import { handleHistoricalConfirmation } from '../../lib/confirmation-handler.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'

/**
 * Analyzes CloudWatch logs to identify and group similar error patterns
 *
 * @param {Object} params - Parameters for the function
 * @param {string|number} params.startTime - Start time for logs (ISO string or timestamp)
 * @param {string|number} params.endTime - End time for logs (ISO string or timestamp)
 * @param {string[]} [params.logGroupIdentifiers] - Optional array of CloudWatch Log Group names/ARNs
 * @param {boolean} [params.serviceWideAnalysis] - Boolean flag to analyze all logs for a service
 * @param {string} [params.serviceName] - Required if serviceWideAnalysis is true
 * @param {string} [params.serviceType] - Required if serviceWideAnalysis is true (serverless-framework, cloudformation)
 * @param {number} [params.maxResults] - Optional limit for the number of error groups to return
 * @param {string} [params.region] - AWS region
 * @param {string} [params.profile] - AWS profile
 * @returns {Promise<Object>} - Error groups and summary information
 */
export async function getAwsErrorsInfo({
  startTime,
  endTime,
  logGroupIdentifiers,
  serviceWideAnalysis = false,
  serviceName,
  serviceType,
  maxResults = 100,
  region,
  profile,
  confirmationToken,
}) {
  try {
    // Convert timestamps to proper format
    const parsedStartTime = parseTimestamp(startTime)
    const parsedEndTime = parseTimestamp(endTime)

    // Check for historical confirmation (more than 1 month old)
    const historicalResponse = handleHistoricalConfirmation(
      parsedStartTime,
      parsedEndTime,
      confirmationToken,
    )
    if (historicalResponse) {
      return historicalResponse
    }

    // The schema validation is already done in tools-definition.js
    // Here we just need to prepare the parameters for the library function
    const validatedParams = {
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      logGroupIdentifiers,
      serviceWideAnalysis,
      serviceName,
      serviceType,
      maxResults,
      region,
      profile,
      confirmationToken,
    }

    // Call the pattern-based library function
    const result = await getErrorsInfoWithPatterns(validatedParams)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (error) {
    // Check if this is an AWS credentials error
    const credentialErrorMessage = handleAwsCredentialsError(error, profile)

    // Use the credential error message if available, otherwise use the original error
    const errorMessage =
      credentialErrorMessage ||
      `Error retrieving error information: ${error.message}`

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
