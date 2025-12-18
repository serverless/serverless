/**
 * AWS Credentials Error Handler
 *
 * Provides user-friendly messages for AWS credential-related errors
 */

/**
 * Mapping of error message patterns to user-friendly responses
 */
const CREDENTIAL_ERROR_PATTERNS = [
  {
    patterns: ['Token has expired', 'ExpiredToken'],
    message:
      "Your credentials have expired. Please re-authenticate (e.g., 'aws sso login') or fetch new temporary tokens.",
  },
  {
    patterns: [
      'Unable to locate credentials',
      'Could not load credentials',
      'Cannot find credentials',
      'No credentials',
    ],
    message:
      "AWS SDK could not find any credentials. Run 'aws configure' or set the AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.",
  },
  {
    patterns: ['AccessDenied', 'Access Denied', 'not authorized to perform'],
    message:
      'Your IAM user or role lacks permissions for this action. Check your IAM policies or contact your administrator.',
  },
  {
    patterns: ['InvalidClientTokenId', 'invalid token', 'invalid access key'],
    message:
      'The access key or token is invalid. Make sure your credentials are correct and active. If using temporary credentials, include the AWS_SESSION_TOKEN.',
  },
  {
    patterns: ['The security token included in the request is invalid'],
    message:
      "Role assumption failed due to missing or incorrect MFA or SSO session. Make sure you're logged in (e.g., 'aws sso login') and providing any required MFA token (if applicable).",
  },
  {
    patterns: [
      'Region is missing',
      'region not specified',
      'Could not resolve region',
    ],
    message:
      "AWS region is missing or invalid. Specify a valid region or configure a default region with 'aws configure'.",
  },
  {
    patterns: ['Profile not found', 'Cannot find profile', 'Invalid profile'],
    message:
      "The specified AWS profile was not found. Check available profiles with 'aws configure list-profiles' and ensure the profile name is correct.",
  },
]

/**
 * Handles AWS credential errors by providing a user-friendly message
 *
 * @param {Error} error - The error object thrown during AWS API calls
 * @param {string} [profile] - The AWS profile that was used when the error occurred
 * @returns {Object|null} Formatted error response or null if not a recognized credentials error
 */
export function handleAwsCredentialsError(error, profile) {
  // Check if error is undefined or null
  if (!error) {
    return null
  }

  const rawErrorMessage =
    typeof error === 'string' ? error : error.message || String(error)

  // Check each pattern group for matches
  for (const errorPattern of CREDENTIAL_ERROR_PATTERNS) {
    if (
      errorPattern.patterns.some((pattern) => rawErrorMessage.includes(pattern))
    ) {
      // Build the user-facing error message with profile information and original error
      let userFacingMessage = errorPattern.message

      // Include the original AWS error message
      userFacingMessage += `\n\nOriginal AWS error: "${rawErrorMessage}"`

      // Use "default" if profile is not provided
      const profileName = profile || 'default'
      userFacingMessage += `\nProfile used: '${profileName}'. `

      // Always include guidance about checking profile and updating credentials
      userFacingMessage +=
        'Please verify this is the appropriate profile for your current task and update your AWS credentials configuration as needed before trying again.'

      // Create a separate message for the user without the agent instructions
      const messageForUser = userFacingMessage

      // Add instructions for the agent in the suggested format
      const agentMessage = `This is an AWS credentials error. Return this message to the user: "${messageForUser}"\n\nStop processing until the user confirms that the credentials issue has been fixed.`

      // Return in the requested format
      return agentMessage
    }
  }

  // Return null if no patterns match
  return null
}
