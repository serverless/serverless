/**
 * Hapi auth scheme for REST API `private: true` routes.
 *
 * Validates the `x-api-key` header against the configured key set.
 * Mirrors AWS API Gateway's rejection envelope:
 *   status 403, body { "message": "Forbidden" },
 *   header x-amzn-ErrorType: ForbiddenException.
 *
 * @param {object} opts
 * @param {{ keys: Set<string> }} opts.store  API key store from buildApiKeyStore.
 * @returns {() => object}  Hapi scheme factory.
 */

import { forbidden } from '../shared/auth-envelopes.js'

export function createApiKeyScheme({ store }) {
  return function apiKeySchemeFactory() {
    return {
      authenticate(request, h) {
        const key = request.headers['x-api-key']
        if (typeof key === 'string' && store.keys.has(key)) {
          return h.authenticated({ credentials: { apiKey: key } })
        }
        return forbidden(h)
      },
    }
  }
}
