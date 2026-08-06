/**
 * A TOKEN-type API Gateway Lambda authorizer, in front of the `custom` MCP
 * server.
 *
 * TOKEN is the shape a user reaches for first — `authorizer: verifyToken` in
 * `serverless-auth.yml`, a bare function name — and API Gateway hands it only
 * the value of the identity source (`Authorization` by default), never the rest
 * of the request. That is the whole surface this file has: `authorizationToken`
 * and `methodArn`.
 *
 * REJECTION SHAPE, pinned deliberately: throwing an error whose message is
 * exactly `Unauthorized` is what makes API Gateway answer `401` with the body
 * `{"message":"Unauthorized"}` (its `UNAUTHORIZED` gateway response). Returning
 * an explicit `Deny` policy instead answers `403` with
 * `{"Message":"User is not authorized to access this resource with an explicit
 * deny"}`. The suite asserts the 401 form, so this handler must keep throwing —
 * the two are not interchangeable, and the difference is invisible in the
 * configuration.
 *
 * The secret is a per-run value the suite generates and injects; there is no
 * default, so a missing injection cannot silently authorize anything (the
 * comparison is against `Bearer undefined`, which no request carries).
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

export const handler = async (event) => {
  if (event.authorizationToken !== `Bearer ${process.env.MCP_TEST_SECRET}`) {
    // The literal API Gateway expects; any other message is a 500.
    throw new Error('Unauthorized')
  }
  return allow(event.methodArn)
}
