'use strict'

/**
 * AWS Credentials utilities for AgentCore dev mode.
 *
 * Provides helper functions for working with IAM trust policies
 * and STS credential management.
 */

/**
 * The SID used for local dev trust policy statements.
 * This allows Serverless Framework to identify and update
 * the trust policy without affecting other statements.
 */
export const LOCAL_DEV_POLICY_SID = 'ServerlessAgentCoreLocalDevPolicy'

/**
 * Extract role name from a role ARN
 *
 * @param {string} roleArn - Full IAM role ARN
 * @returns {string} Role name
 *
 * @example
 * getRoleNameFromArn('arn:aws:iam::123456789012:role/my-role')
 * // Returns: 'my-role'
 */
export function getRoleNameFromArn(roleArn) {
  const parts = roleArn.split('/')
  return parts[parts.length - 1]
}

/**
 * Check if credentials are about to expire (within threshold)
 *
 * @param {object} credentials - AWS credentials object with Expiration field
 * @param {number} [thresholdMs=600000] - Threshold in milliseconds (default 10 minutes)
 * @returns {boolean} True if credentials will expire within threshold
 */
export function areCredentialsExpiring(
  credentials,
  thresholdMs = 10 * 60 * 1000,
) {
  if (!credentials?.Expiration) {
    return true // Treat missing expiration as expired
  }

  const expirationTime = new Date(credentials.Expiration).getTime()
  const now = Date.now()

  return expirationTime - now < thresholdMs
}

/**
 * Calculate time remaining until credential expiration
 *
 * @param {object} credentials - AWS credentials object with Expiration field
 * @returns {number} Minutes until expiration (negative if already expired)
 */
export function getCredentialExpirationMinutes(credentials) {
  if (!credentials?.Expiration) {
    return 0
  }

  const expirationTime = new Date(credentials.Expiration).getTime()
  const now = Date.now()

  return Math.round((expirationTime - now) / 60000)
}

/**
 * Find the dev policy statement in a trust policy
 *
 * @param {object} trustPolicy - IAM trust policy document
 * @returns {number} Index of the dev policy statement, or -1 if not found
 */
export function findDevPolicyStatementIndex(trustPolicy) {
  if (!trustPolicy?.Statement || !Array.isArray(trustPolicy.Statement)) {
    return -1
  }

  return trustPolicy.Statement.findIndex(
    (stmt) => stmt.Sid === LOCAL_DEV_POLICY_SID,
  )
}

/**
 * Create a new dev policy statement for local development
 *
 * @param {string} userArn - ARN of the local user/role
 * @returns {object} Policy statement object
 */
export function createDevPolicyStatement(userArn) {
  return {
    Sid: LOCAL_DEV_POLICY_SID,
    Effect: 'Allow',
    Principal: {
      AWS: [userArn],
    },
    Action: 'sts:AssumeRole',
  }
}

/**
 * Get the list of principals from a policy statement
 *
 * @param {object} policyStatement - Policy statement object
 * @returns {Array<string>} List of principal ARNs
 */
export function getPolicyPrincipals(policyStatement) {
  if (!policyStatement?.Principal?.AWS) {
    return []
  }

  const principals = policyStatement.Principal.AWS

  if (Array.isArray(principals)) {
    return principals
  }

  return [principals].filter(Boolean)
}

/**
 * Check if a user ARN is already in a policy statement.
 * Checks both the exact ARN and the normalized form, so that
 * a previously written session ARN is recognized after normalization.
 *
 * @param {object} policyStatement - Policy statement object
 * @param {string} userArn - ARN to check (already normalized)
 * @returns {boolean} True if the ARN is in the policy
 */
export function isPrincipalInPolicy(policyStatement, userArn) {
  const principals = getPolicyPrincipals(policyStatement)
  if (principals.includes(userArn)) {
    return true
  }
  /**
   * Also check if any existing principal normalizes to the same ARN.
   * This handles the transition where an old session ARN was stored
   * and we now compare against the normalized role ARN.
   */
  return principals.some(
    (existing) => normalizeAssumedRoleArn(existing) === userArn,
  )
}

/**
 * Add a principal to a policy statement
 *
 * @param {object} policyStatement - Policy statement object (mutated)
 * @param {string} userArn - ARN to add
 */
export function addPrincipalToPolicy(policyStatement, userArn) {
  const principals = getPolicyPrincipals(policyStatement)

  if (!principals.includes(userArn)) {
    policyStatement.Principal.AWS = [...principals, userArn]
  }
}

/**
 * Normalize an STS assumed-role session ARN to an IAM role ARN.
 *
 * When using AWS SSO, GetCallerIdentity returns a session ARN like:
 *   arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_Admin_abc123/user@example.com
 *
 * Trust policies require the IAM role ARN format to work reliably:
 *   arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_Admin_abc123
 *
 * For non-SSO assumed roles (e.g. arn:aws:sts::ACCOUNT:assumed-role/MyRole/session),
 * it normalizes to:
 *   arn:aws:iam::ACCOUNT:role/MyRole
 *
 * For ARNs that are already IAM role or user ARNs, returns them as-is.
 *
 * @param {string} arn - The ARN from GetCallerIdentity
 * @returns {string} The normalized IAM principal ARN
 */
export function normalizeAssumedRoleArn(arn) {
  /**
   * Match STS assumed-role session ARNs across all partitions:
   * arn:aws:sts::ACCOUNT:assumed-role/ROLE_NAME/SESSION_NAME
   * arn:aws-us-gov:sts::ACCOUNT:assumed-role/ROLE_NAME/SESSION_NAME
   * arn:aws-cn:sts::ACCOUNT:assumed-role/ROLE_NAME/SESSION_NAME
   */
  const assumedRoleMatch = arn.match(
    /^arn:(aws[\w-]*):sts::(\d+):assumed-role\/(.+?)\/[^/]+$/,
  )
  if (!assumedRoleMatch) {
    return arn
  }

  const partition = assumedRoleMatch[1]
  const accountId = assumedRoleMatch[2]
  const roleName = assumedRoleMatch[3]

  /**
   * SSO roles have names starting with AWSReservedSSO_.
   * Their IAM role ARN includes the aws-reserved/sso.amazonaws.com path prefix.
   */
  if (roleName.startsWith('AWSReservedSSO_')) {
    return `arn:${partition}:iam::${accountId}:role/aws-reserved/sso.amazonaws.com/${roleName}`
  }

  return `arn:${partition}:iam::${accountId}:role/${roleName}`
}

/**
 * Calculate exponential backoff delay with cap
 *
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} [baseDelayMs=5000] - Base delay in milliseconds
 * @param {number} [maxDelayMs=30000] - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt,
  baseDelayMs = 5000,
  maxDelayMs = 30000,
) {
  const delay = baseDelayMs * Math.pow(2, attempt - 1)
  return Math.min(delay, maxDelayMs)
}
