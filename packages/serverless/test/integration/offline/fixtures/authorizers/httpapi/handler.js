'use strict'
// echo: returns the received event so the test can assert the
// requestContext.authorizer surface the handler receives.
exports.echo = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
})

// HTTP API v2 REQUEST authorizer (simple-response, enableSimpleResponses).
// Receives a v2 (version "2.0") event. Authorizes when the Authorization
// header is "allow-me"; 'Unauthorized' literal (-> 401) for "deny-401";
// else { isAuthorized: false } (-> 403).
exports.v2RequestAuthorizer = async (event) => {
  const headers = event.headers || {}
  const auth = headers.Authorization || headers.authorization
  if (auth === 'deny-401') {
    return 'Unauthorized'
  }
  return {
    isAuthorized: auth === 'allow-me',
    context: { role: 'admin', team: 'core' },
  }
}
