'use strict'
// Custom authentication provider (offline.customAuthenticationProvider).
// Factory returns a Hapi auth-scheme tuple { name, scheme,
// getAuthenticateFunction }. The offline runtime calls the factory once at
// boot and wires the scheme/strategy onto the server under `name`.
//
// On authenticate, it attaches `credentials.authorizer`, which the v2 event
// factory surfaces verbatim at `requestContext.authorizer` on the handler
// event.
module.exports = function authenticationProvider() {
  return {
    name: 'customScheme',
    scheme: 'custom-scheme',
    getAuthenticateFunction() {
      return {
        async authenticate(request, h) {
          return h.authenticated({
            credentials: {
              authorizer: {
                lambda: { source: 'custom-provider', expected: 'it works' },
              },
            },
          })
        },
      }
    },
  }
}
