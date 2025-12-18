import { getIamResourceInfo } from '../../lib/aws/resource-info.js'
import { handleAwsCredentialsError } from '../../lib/aws-credentials-error-handler.js'

/**
 * Get detailed information about AWS IAM roles and their policies.
 *
 * @param {Object} params - The parameters for the function
 * @param {string[]} params.roleNames - Array of IAM role names to get information about
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - Information about the IAM roles and their policies
 */
export async function getIamInfo(params) {
  try {
    const { roleNames, region, profile } = params

    if (!Array.isArray(roleNames) || roleNames.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Please provide at least one IAM role name.',
          },
        ],
        isError: true,
      }
    }

    // Use the shared resource info function to get information for each IAM role
    const results = await Promise.all(
      roleNames.map(async (roleName) => {
        try {
          // Call the shared function with the appropriate parameters
          const result = await getIamResourceInfo({
            resourceId: roleName,
            region,
            profile,
          })

          // Rename resourceId to roleName for backward compatibility
          const { resourceId, ...rest } = result
          return {
            roleName: resourceId,
            ...rest,
          }
        } catch (error) {
          // Check if this is an AWS credentials error
          const credentialErrorMessage = handleAwsCredentialsError(
            error,
            profile,
          )

          return {
            roleName,
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
    const errorMessage =
      credentialErrorMessage ||
      `Error retrieving IAM role information: ${error.message}`

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
