/**
 * A REQUEST-type API Gateway Lambda authorizer, in front of the
 * `customRequest` MCP server.
 *
 * Same decision as `./verify-token.mjs`, reached from the other input: a
 * REQUEST authorizer is handed the whole request — headers, path, query,
 * context — instead of one identity-source value, so the secret is read out of
 * `event.headers` here. That is the only reason both shapes are exercised: the
 * MCP route is compiled by the same api-gateway seam an `http` event goes
 * through, and TOKEN and REQUEST take different branches of it.
 *
 * `resultTtlInSeconds: 0` in the configuration is what makes this run per
 * request. It also removes the identity source: with caching on, API Gateway
 * needs an identity source to key the cache and short-circuits a request that
 * omits it (a 401 the authorizer never sees). With TTL 0 there is no cache and
 * no identity source, so every request reaches this function — including one
 * with no `Authorization` header at all, which is the case the suite asserts on.
 *
 * Headers arrive with whatever casing the client sent, so the lookup is
 * case-insensitive; the harness sends `authorization` and a browser would send
 * `Authorization`.
 */
const allow = (methodArn) => ({
  principalId: 'mcp-auth-fixture',
  policyDocument: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: methodArn,
      },
    ],
  },
})

const headerOf = (headers, name) => {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) return value
  }
  return undefined
}

export const handler = async (event) => {
  const provided = headerOf(event.headers, 'authorization')
  if (provided !== `Bearer ${process.env.MCP_TEST_SECRET}`) {
    // The literal API Gateway expects: it answers 401 with
    // `{"message":"Unauthorized"}`. A returned Deny policy would be a 403.
    throw new Error('Unauthorized')
  }
  return allow(event.methodArn)
}
