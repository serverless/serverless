'use strict'
// echo: returns the received event so the test can assert the
// requestContext.authorizer surface the handler receives.
exports.echo = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
})

// TOKEN authorizer: receives { type: 'TOKEN', authorizationToken, methodArn }.
// Returns an Allow policy with a principalId + context for "allow-me",
// the literal 'Unauthorized' (-> 401) when the token is "deny-401",
// and an explicit Deny policy (-> 403) otherwise.
exports.tokenAuthorizer = async (event) => {
  const token = event.authorizationToken
  if (token === 'deny-401') {
    return 'Unauthorized'
  }
  const effect = token === 'allow-me' ? 'Allow' : 'Deny'
  return {
    principalId: 'user-token-123',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: event.methodArn,
        },
      ],
    },
    context: { scope: 'read', tier: 'gold', count: 7, flag: true },
  }
}

// REQUEST authorizer: receives { type: 'REQUEST', methodArn, headers, ... }.
// Allows when the Authorization header is "allow-me", else denies (403).
exports.requestAuthorizer = async (event) => {
  const auth =
    event.headers &&
    (event.headers.Authorization || event.headers.authorization)
  const effect = auth === 'allow-me' ? 'Allow' : 'Deny'
  return {
    principalId: 'user-request-456',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: event.methodArn,
        },
      ],
    },
    context: { dept: 'eng' },
  }
}
