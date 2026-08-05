// Runs inside the user's Lambda: no framework imports, plain Errors.
// Resource-Server token verification. The composition layer feeds the returned
// function to the MCP SDK's bearer-auth gate as its pluggable verifier, so the
// return value is the SDK's `AuthInfo` shape verbatim.
import { createRemoteJWKSet, jwtVerify } from 'jose'

const asString = (value) => (typeof value === 'string' ? value : undefined)

// RFC 7519 allows `aud` to be a single string or an array; anything else is a
// malformed claim and carries no audience.
const claimedAudiences = (aud) =>
  (Array.isArray(aud) ? aud : [aud]).filter((v) => typeof v === 'string')

/**
 * The audience rule, identical to AWS's managed JWT authorizers: `aud` is
 * authoritative whenever the token carries one, and only a token with no `aud`
 * at all is matched on `client_id`. Amazon Cognito access tokens are the reason
 * the fallback exists — they carry `client_id` and no `aud`, so a strict-`aud`
 * check would reject every Cognito token.
 *
 * Returns nothing on success and throws on rejection.
 */
export const checkAudience = (payload, audiences) => {
  const claimed = claimedAudiences(payload?.aud)
  if (claimed.length > 0) {
    if (claimed.some((value) => audiences.includes(value))) return
    throw new Error(
      `The token's "aud" claim (${claimed.join(
        ', ',
      )}) matches none of this server's configured audiences (${audiences.join(
        ', ',
      )}).`,
    )
  }
  const clientId = asString(payload?.client_id)
  if (clientId !== undefined && audiences.includes(clientId)) return
  throw new Error(
    `The token carries no "aud" claim, and its "client_id" claim (${
      clientId ?? 'absent'
    }) matches none of this server's configured audiences (${audiences.join(
      ', ',
    )}). Tokens without an audience are matched on "client_id" — for Amazon Cognito issuers, list your app client IDs in the server's auth.audiences.`,
  )
}

/**
 * The token-class rule, for issuers that state one.
 *
 * Amazon Cognito is the issuer that makes this necessary. It signs ID tokens
 * with the same keys, the same issuer and the same app client id its access
 * tokens carry — an ID token's `aud` *is* the app client id, the very value
 * `auth.audiences` has to list for that pool's access tokens to pass at all —
 * so the audience rule cannot tell the two apart, and an ID token minted for a
 * sign-in would otherwise be accepted as authorization to call tools. AWS's own
 * guidance for APIs behind a Cognito pool is to check `token_use`, and it is
 * the only claim that distinguishes them.
 *
 * Narrow on purpose: only a token that states its class is judged on it. No
 * other issuer emits `token_use`, so their tokens never reach the rejection.
 *
 * Returns nothing on success and throws on rejection.
 */
export const checkTokenClass = (payload) => {
  const tokenUse = asString(payload?.token_use)
  if (tokenUse === undefined || tokenUse === 'access') return
  throw new Error(
    `The token's "token_use" claim is "${tokenUse}", not "access", so it is not an access token — this server only accepts access tokens. An Amazon Cognito ID token carries the app client id in "aud" and would otherwise pass the audience check; send the access token from the same sign-in instead.`,
  )
}

/**
 * OpenID Connect Discovery: the metadata document lives at the issuer
 * identifier with `/.well-known/openid-configuration` appended, so a trailing
 * slash on the issuer (Auth0's canonical form) must not double up.
 */
const discoverJwks = async (issuer) => {
  const metadataUrl = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
  let metadata
  try {
    // Discovery runs on the request path, so an issuer that accepts the
    // connection and then stalls must not hold the invocation open until the
    // Lambda timeout. 5s mirrors jose's own default for JWKS fetches.
    const response = await fetch(metadataUrl, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      throw new Error(`the request returned HTTP ${response.status}`)
    }
    metadata = await response.json()
  } catch (error) {
    throw new Error(
      `Could not read the OpenID configuration of the auth issuer "${issuer}" at ${metadataUrl}: ${error.message}. The issuer must be an OIDC provider serving that document.`,
      { cause: error },
    )
  }
  // RFC 8414 §3.3 and OIDC Discovery §4.3: the document's own issuer must
  // equal the identifier it was fetched for, character for character. A
  // mismatch means the document describes some other issuer, and its keys must
  // not be trusted for this one.
  const declaredIssuer = asString(metadata?.issuer)
  if (declaredIssuer !== issuer) {
    throw new Error(
      `The OpenID configuration at ${metadataUrl} declares "issuer": ${
        declaredIssuer === undefined ? 'nothing' : `"${declaredIssuer}"`
      }, which is not the configured auth.issuer "${issuer}". The two must match exactly, including any trailing slash — set auth.issuer to the value the provider publishes.`,
    )
  }
  const jwksUri = asString(metadata?.jwks_uri)
  if (jwksUri === undefined) {
    throw new Error(
      `The OpenID configuration at ${metadataUrl} declares no "jwks_uri", so the issuer's token signing keys cannot be fetched.`,
    )
  }
  let jwksUrl
  try {
    jwksUrl = new URL(jwksUri)
  } catch (error) {
    throw new Error(
      `The OpenID configuration at ${metadataUrl} declares a "jwks_uri" that is not an absolute URL ("${jwksUri}"), so the issuer's token signing keys cannot be fetched.`,
      { cause: error },
    )
  }
  // The keys this fetch returns decide which tokens the server accepts, so the
  // fetch itself has to be authenticated: over plaintext anything on the path
  // can serve its own key set and mint tokens that verify. OIDC Discovery §4.2
  // requires HTTPS for the endpoints a document advertises, so an http:// value
  // is a broken provider (or a tampered document) either way.
  if (jwksUrl.protocol !== 'https:') {
    throw new Error(
      `The OpenID configuration at ${metadataUrl} declares a "jwks_uri" that is not HTTPS ("${jwksUri}"). The issuer's token signing keys are what decide which tokens this server accepts, so they are only fetched over HTTPS - serve the JWKS over https, or point auth.issuer at a provider that does.`,
    )
  }
  return createRemoteJWKSet(jwksUrl)
}

const parseScopes = (payload) => {
  // `scope` is the OAuth space-delimited string; `scp` (array or string) is the
  // Microsoft Entra ID spelling.
  const claim = payload.scope ?? payload.scp
  if (Array.isArray(claim)) return claim.filter((v) => typeof v === 'string')
  if (typeof claim === 'string') return claim.split(' ').filter(Boolean)
  return []
}

/**
 * Build the token verifier for one server's `auth` configuration.
 *
 * Returns `async (token) => authInfo`, throwing when the token is not
 * acceptable. The key set is discovered once per container and shared by every
 * request; a discovery failure is not cached, so a transient network error does
 * not wedge the container for the rest of its life.
 */
export const createTokenVerifier = ({ issuer, audiences }) => {
  // Validate at construction so a misconfigured environment fails at cold
  // start rather than turning every request into a 500.
  if (asString(issuer) === undefined || issuer === '') {
    throw new Error(
      'createTokenVerifier() needs the auth.issuer URL, and got none — the entry passes it as SERVERLESS_MCP_AUTH_ISSUER.',
    )
  }
  if (!Array.isArray(audiences) || audiences.length === 0) {
    throw new Error(
      'createTokenVerifier() needs at least one entry in auth.audiences, and got none — the entry passes them as SERVERLESS_MCP_AUTH_AUDIENCES.',
    )
  }

  let jwksPromise
  const jwks = () => {
    jwksPromise ??= discoverJwks(issuer).catch((error) => {
      jwksPromise = undefined
      throw error
    })
    return jwksPromise
  }

  return async (token) => {
    // No `audience` option on purpose: setting it makes jose treat a missing
    // `aud` as a verification failure, which would reject every Cognito access
    // token. The audience decision belongs to checkAudience.
    //
    // `exp` is required here because the SDK's bearer gate rejects an AuthInfo
    // whose expiresAt is not a number: without this, a token with no `exp`
    // fails later as an opaque 401 instead of as a stated verification failure.
    const { payload } = await jwtVerify(token, await jwks(), {
      issuer,
      requiredClaims: ['exp'],
    })
    // Class before audience: an ID token can satisfy the audience rule, so
    // rejecting it on audience grounds is not something that can happen, and a
    // token that is the wrong kind entirely should say so rather than being
    // reported as an audience mismatch.
    checkTokenClass(payload)
    checkAudience(payload, audiences)
    return {
      token,
      // AuthInfo.clientId names the OAuth client: `client_id` on Cognito and
      // most access tokens, `azp` on Auth0's. The whole verified claim set
      // rides along on `extra.claims`, so `sub` stays reachable from handlers.
      clientId: asString(payload.client_id) ?? asString(payload.azp) ?? '',
      scopes: parseScopes(payload),
      // The SDK's bearer gate refuses a token whose `expiresAt` is not a
      // number, so this must carry the `exp` claim through.
      expiresAt: payload.exp,
      extra: { claims: payload },
    }
  }
}
