/**
 * Hapi auth scheme for HTTP API v2 JWT authorizers.
 *
 * Decode-only — the token's signature is NOT verified. Claims are validated:
 *   - `exp` must be present and in the future (epoch seconds).
 *   - `iss` must exactly equal the configured issuerUrl.
 *   - `aud` (string or array) must overlap with configured audience array,
 *     or fall back to `client_id` claim matching.
 *   - If `scopes` is configured, the token's `scope` claim (space-separated
 *     string or array) must contain at least one configured scope.
 *
 * On success, attaches `request.auth.credentials.authorizer = { jwt: {
 * claims, scopes } }`. The downstream v2 event factory surfaces this under
 * `event.requestContext.authorizer.jwt`.
 */

import { decodeJwt } from 'jose'
import { unauthorized } from '../shared/auth-envelopes.js'
import {
  parseV2IdentitySource,
  extractV2IdentitySource,
} from './v2-identity-source.js'

const DEFAULT_IDENTITY_SOURCE = '$request.header.Authorization'

/**
 * @param {object} opts
 * @param {object} opts.authorizerDef
 *   `{ issuerUrl, audience, identitySource?, scopes?, name }`.
 *   `audience` is normalized to an array internally; YAML may provide
 *   either a string or array.
 * @returns {() => object}  Hapi scheme factory.
 */
export function createJwtScheme({ authorizerDef }) {
  const issuerUrl = authorizerDef.issuerUrl
  const configuredAudience = normalizeToArray(authorizerDef.audience)
  const configuredScopes = normalizeToArray(authorizerDef.scopes)
  const sources = parseV2IdentitySource(
    authorizerDef.identitySource ?? DEFAULT_IDENTITY_SOURCE,
  )

  return function jwtSchemeFactory() {
    return {
      authenticate(request, h) {
        // 1. Resolve identity-source value.
        const raw = extractV2IdentitySource(request, sources)
        if (!raw) return unauthorized(h)

        // 2. Strip Bearer prefix case-insensitively.
        const token = stripBearer(raw)
        if (!token) return unauthorized(h)

        // 3. Decode (no signature verification).
        let claims
        try {
          claims = decodeJwt(token)
        } catch {
          return unauthorized(h)
        }

        // 4. exp claim required + in the future.
        if (
          typeof claims.exp !== 'number' ||
          claims.exp < Math.floor(Date.now() / 1000)
        ) {
          return unauthorized(h)
        }

        // 5. iss exact match.
        if (claims.iss !== issuerUrl) return unauthorized(h)

        // 6. Audience overlap (or client_id fallback).
        if (!audienceMatches(claims, configuredAudience)) {
          return unauthorized(h)
        }

        // 7. Scopes (optional).
        const tokenScopes = parseScopeClaim(claims.scope)
        if (configuredScopes.length > 0) {
          const overlap = tokenScopes.some((s) => configuredScopes.includes(s))
          if (!overlap) return unauthorized(h)
        }

        return h.authenticated({
          credentials: {
            authorizer: {
              jwt: {
                claims,
                scopes: tokenScopes.length > 0 ? tokenScopes : null,
              },
            },
          },
        })
      },
    }
  }
}

function normalizeToArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function stripBearer(raw) {
  const match = String(raw).match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : raw
}

function parseScopeClaim(scopeClaim) {
  if (Array.isArray(scopeClaim)) return scopeClaim.filter(Boolean)
  if (typeof scopeClaim !== 'string') return []
  return scopeClaim.split(/\s+/).filter(Boolean)
}

function audienceMatches(claims, configured) {
  const aud = claims.aud
  if (aud !== undefined && aud !== null) {
    const claimAud = Array.isArray(aud) ? aud : [aud]
    if (claimAud.some((a) => configured.includes(a))) return true
  }
  if (claims.client_id && configured.includes(claims.client_id)) return true
  return false
}
