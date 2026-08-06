// Descriptors are pre-normalized to what the api-gateway compiler expects
// downstream of its own event normalization: a `path` with no leading or
// trailing slash (its segments keep the server name's own casing — URL paths
// are case-sensitive), a lowercase `method`, and an uppercase `transferMode`.
const streamingHttp = (path, method, timeout) => ({
  path,
  method,
  integration: 'AWS_PROXY',
  timeoutInMillis: timeout * 1000,
  response: { transferMode: 'STREAM' },
})

// The one authorizer API Gateway resolves without an authorizer resource of its
// own, and therefore the one the http event spells as a bare string with no
// name or arn behind it. Matched case-insensitively, exactly as the seam's
// `getAuthorizer` matches it (api-gateway/lib/validate.js).
const IAM_AUTHORIZER = 'aws_iam'

/**
 * Turn the validated `authorizer` into what the api-gateway seam normalizes.
 *
 * Contributed events run through `getAuthorizer` just as declared http events
 * do, so this only has to pick the spelling that means what the user wrote:
 *
 *  - `aws_iam` stays a bare string, which is how an http event carries it;
 *  - any other string names an authorizer function and is wrapped, because the
 *    seam reads a bare string carrying a colon as an authorizer ARN instead;
 *  - an object is the seam's own authorizer shape already, and is handed over
 *    untouched - it is the only thing entitled to interpret it.
 */
const authorizerFor = (authorizer) => {
  if (authorizer === undefined) return undefined
  if (typeof authorizer !== 'string') return authorizer
  if (authorizer.toLowerCase() === IAM_AUTHORIZER) return authorizer
  return { name: authorizer }
}

export const buildRouteDescriptors = ({ servers }) =>
  servers.map((s) => {
    const http = streamingHttp(`${s.name}/mcp`, 'any', s.timeout)
    const authorizer = authorizerFor(s.authorizer)
    if (authorizer !== undefined) {
      http.authorizer = authorizer
    }
    return { functionName: s.name, http }
  })
