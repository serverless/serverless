/**
 * Evaluate an IAM policy document against a methodArn. Permissive matcher
 * supporting exact match, `*`, `?` (single char), mid-path `*` wildcards, and
 * the `arn:aws:execute-api:**` catch-all. Effect=Deny short-circuits.
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

function parseExecuteApiArn(arn) {
  const [, region = '*', accountId = '*', restApiId = '*', path = '*'] =
    arn.match(
      /arn:aws:execute-api:([^\s:]+)(?::([^\s:]+))?(?::([^\s/:]+))?(?:\/(.*))?/,
    ) ?? []
  return { region, accountId, restApiId, path }
}

function matchesResource(pattern, methodArn) {
  if (typeof pattern !== 'string') return false
  if (pattern === methodArn) return true
  if (pattern === '*') return true
  if (pattern === 'arn:aws:execute-api:**') return true

  if (!pattern.includes('*') && !pattern.includes('?')) return false

  const p = parseExecuteApiArn(pattern)
  const m = parseExecuteApiArn(methodArn)

  if (p.region !== '*' && p.region !== m.region) return false
  if (p.accountId !== '*' && p.accountId !== m.accountId) return false
  if (p.restApiId !== '*' && p.restApiId !== m.restApiId) return false

  // Path segment carries stage/method/resource-path; ? matches one char,
  // * matches any run. Anchor the end so a prefix is not a false match.
  const pathRegExp = new RegExp(
    `${p.path.replaceAll('*', '.*').replaceAll('?', '.')}$`,
  )
  return pathRegExp.test(m.path)
}
