/**
 * Evaluate an IAM policy document against a methodArn. Permissive matcher —
 * scopes to what AWS API Gateway exercises in practice (exact, full-`*`,
 * and trailing-`*` suffix wildcards). Effect=Deny short-circuits.
 *
 * @param {object} args
 * @param {string} args.principalId    Required — non-empty string.
 * @param {string} args.methodArn      The route's methodArn.
 * @param {object} args.policyDocument Must have an Array `Statement`.
 * @param {object} [args.context]      Optional context to surface through.
 * @returns {{ allow: boolean, principalId: string, context: object }}
 * @throws when inputs are malformed.
 */
export function evaluatePolicy({
  principalId,
  methodArn,
  policyDocument,
  context = {},
}) {
  if (!principalId || typeof principalId !== 'string') {
    throw new Error('Authorizer policy is missing required principalId')
  }
  if (!policyDocument || !Array.isArray(policyDocument.Statement)) {
    throw new Error(
      'Authorizer policy is malformed: Statement must be an array',
    )
  }

  let allow = false

  for (const stmt of policyDocument.Statement) {
    const resources = Array.isArray(stmt.Resource)
      ? stmt.Resource
      : [stmt.Resource]
    const matched = resources.some((r) => matchesResource(r, methodArn))
    if (!matched) continue

    if (stmt.Effect === 'Deny') {
      return { allow: false, principalId, context }
    }
    if (stmt.Effect === 'Allow') {
      allow = true
    }
  }

  return { allow, principalId, context }
}

function matchesResource(pattern, methodArn) {
  if (typeof pattern !== 'string') return false
  if (pattern === '*') return true
  if (pattern === methodArn) return true
  // Trailing-* wildcard suffix match (e.g. `arn:.../dev/*`).
  if (pattern.endsWith('*')) {
    return methodArn.startsWith(pattern.slice(0, -1))
  }
  return false
}
