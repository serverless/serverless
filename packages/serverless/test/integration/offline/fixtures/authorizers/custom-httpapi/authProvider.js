'use strict'
// Custom authentication provider in the community serverless-offline shape.
// The factory returns a Hapi auth-scheme tuple { name, scheme,
// getAuthenticateFunction }. On authenticate it returns credentials in the
// plugin's contract — { principalId, context } — which the event factories map
// into requestContext.authorizer (REST v1: context spread at root + principalId;
// HTTP API v2: { lambda: context }).
module.exports = function authenticationProvider() {
  return {
    name: 'customScheme',
    scheme: 'custom-scheme',
    getAuthenticateFunction() {
      return {
        async authenticate(request, h) {
          return h.authenticated({
            credentials: {
              principalId: 'user-123',
              context: {
                source: 'custom-provider',
                expected: 'it works',
                count: 7,
              },
            },
          })
        },
      }
    },
  }
}
