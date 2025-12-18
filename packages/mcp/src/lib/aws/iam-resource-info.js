import { AwsIamClient } from '@serverless/engine/src/lib/aws/iam.js'

/**
 * Get detailed information about an AWS IAM role
 *
 * @param {Object} params - The parameters for the function
 * @param {string} params.resourceId - IAM role name
 * @param {string} [params.region] - Optional region to use
 * @param {string} [params.profile] - Optional profile to use for credentials
 * @returns {Promise<Object>} - Information about the IAM role and its policies
 */
export async function getIamResourceInfo(params) {
  const { resourceId, region, profile } = params

  try {
    // Create AWS config with region and/or profile if provided
    const awsConfig = {}
    if (region) awsConfig.region = region
    if (profile) awsConfig.profile = profile

    // Create an instance of the AwsIamClient with the AWS config
    const iamClient = new AwsIamClient(awsConfig)

    // Get role details
    const roleDetails = await iamClient.getRoleDetails(resourceId)

    return {
      resourceId,
      type: 'iam',
      ...roleDetails,
    }
  } catch (error) {
    return {
      resourceId,
      type: 'iam',
      status: 'error',
      error: error.message,
    }
  }
}
