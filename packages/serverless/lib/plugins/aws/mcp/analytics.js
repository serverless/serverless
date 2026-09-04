/**
 * Pure builder for the `mcp` block of the sfcore.analysis.generated.v1
 * analytics event. Consumed by the sf-core framework runner's
 * getAnalysisEventDetails(), exactly like the sandboxes block
 * (`../sandboxes/analytics.js`), whose contract this mirrors:
 *
 *  - Fixed keys and closed value vocabularies only — never server names,
 *    issuer URLs, ARNs, paths, or any other user-authored string.
 *  - Explicit-only for per-server knobs: a value is reported only when a
 *    server sets it in serverless.yml (an explicit value equal to the
 *    default IS reported). The one deliberate exception is `endpointType`,
 *    which reports the EFFECTIVE value with the Framework's EDGE default
 *    applied — the default is precisely the exposed population (an
 *    edge-optimized endpoint ends a stream quiet for ~30 s), so
 *    explicit-only reporting would hide the servers the number exists to
 *    find.
 *  - Omit-empty: absent key ≡ 0 ≡ "no server sets this".
 *  - HARD REQUIREMENT: total function — never throws. Malformed input
 *    degrades to omitted keys or `undefined`; analytics must never break a
 *    user command.
 */

import awsArnRegExs from '../utils/arn-regular-expressions.js'
import { resolveBaseUrls } from './lib/discovery-route.js'
import { effectiveEndpointType } from './lib/endpoint-type.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const sortedUniqueNumbers = (values) =>
  [...new Set(values)].sort((a, b) => a - b)

const addIfPositive = (target, key, n) => {
  if (typeof n === 'number' && n > 0) target[key] = n
}

const addIfNonEmpty = (target, key, arr) => {
  if (Array.isArray(arr) && arr.length > 0) target[key] = arr
}

/**
 * Closed classification of an OIDC issuer URL's hostname. The URL itself is
 * never reported — only which provider family it belongs to, which is what
 * decides documentation and verification priorities.
 */
export const classifyIssuer = (issuer) => {
  if (typeof issuer !== 'string') return undefined
  let host
  try {
    host = new URL(issuer).hostname.toLowerCase()
  } catch {
    return undefined
  }
  if (host.startsWith('cognito-idp.') && host.endsWith('.amazonaws.com')) {
    return 'cognito'
  }
  if (host.endsWith('.auth0.com')) return 'auth0'
  if (
    host.endsWith('.okta.com') ||
    host.endsWith('.oktapreview.com') ||
    host.endsWith('.okta-emea.com')
  ) {
    return 'okta'
  }
  if (
    host === 'login.microsoftonline.com' ||
    host === 'sts.windows.net' ||
    host.endsWith('.ciamlogin.com') ||
    host.endsWith('.b2clogin.com')
  ) {
    return 'entra'
  }
  return 'other'
}

/**
 * Closed classification of a server's `authorizer`. What is reported is the
 * kind of gate in front of the route - which is what decides documentation and
 * verification priorities - never the user's authorizer name, ARN, or
 * authorizer id.
 *
 * The Cognito test mirrors the api-gateway compiler's own detection
 * (`../package/compile/events/api-gateway/lib/authorizers.js`): an explicit
 * `COGNITO_USER_POOLS` type, or a literal `cognito-idp` ARN, which the compiler
 * reads as a user pool whether or not the type says so. An intrinsic ARN hides
 * the service, so it classifies as what the compiler would build from it - a
 * TOKEN authorizer - rather than being guessed at.
 */
export const classifyAuthorizer = (authorizer) => {
  if (typeof authorizer === 'string') {
    if (authorizer.length === 0) return undefined
    return authorizer.toLowerCase() === 'aws_iam' ? 'aws_iam' : 'function-token'
  }
  if (!isObj(authorizer)) return undefined
  const type =
    typeof authorizer.type === 'string'
      ? authorizer.type.toLowerCase()
      : undefined
  if (type === 'aws_iam') return 'aws_iam'
  if (
    type === 'cognito_user_pools' ||
    (typeof authorizer.arn === 'string' &&
      awsArnRegExs.cognitoIdpArnExpr.test(authorizer.arn))
  ) {
    return 'cognito'
  }
  if (type === 'request') return 'function-request'
  // TOKEN is the type the compiler defaults an unspecified authorizer to, so it
  // is what an absent, custom, or `token` type reports here.
  return 'function-token'
}

/**
 * Which of the three base URLs each discovery-publishing server is advertised
 * on: the user's `publicUrl` override, a custom domain in front of the REST
 * API, or the stage URL.
 *
 * Derived through the deploy's own resolver (`./lib/discovery-route.js`) rather
 * than re-deciding the chain here, so the reported source cannot drift from the
 * URL that was actually published. Guarded on its own: a resolver throw costs
 * this one key, not the whole block.
 */
const discoveryUrlSources = (discoveryServers, provider) => {
  try {
    return [
      ...new Set(
        [...resolveBaseUrls({ servers: discoveryServers, provider }).values()]
          .map(({ source }) => source)
          .filter(Boolean),
      ),
    ].sort()
  } catch {
    return []
  }
}

// Pure: the top-level `mcp` config plus the provider block -> the analytics
// block, or undefined when there is nothing to report. Total (never throws)
// on malformed input.
export const deriveMcpBlock = (mcpConfig, provider) => {
  try {
    const servers = isObj(mcpConfig) ? mcpConfig.servers : undefined
    if (!isObj(servers)) return undefined
    const names = Object.keys(servers)
    if (names.length === 0) return undefined
    // Malformed entries still count toward `count` (they exist in config) but
    // contribute nothing to knob derivation.
    const entries = Object.entries(servers).filter(([, c]) => isObj(c))
    const cfgs = entries.map(([, c]) => c)

    const block = { count: names.length }

    // Count and classes come from the same pass, so an authorizer that
    // classifies as nothing is counted as nothing - the two can never disagree.
    const authorizerTypes = cfgs
      .map((c) => classifyAuthorizer(c.authorizer))
      .filter(Boolean)
    addIfPositive(block, 'authorizer', authorizerTypes.length)
    addIfNonEmpty(
      block,
      'authorizerTypes',
      [...new Set(authorizerTypes)].sort(),
    )

    const withDiscovery = cfgs.filter((c) => isObj(c.oauthDiscovery))
    addIfPositive(block, 'oauthDiscovery', withDiscovery.length)
    const discoveryServers = entries
      .filter(([, c]) => {
        if (!isObj(c.oauthDiscovery)) return false
        const { publicUrl } = c.oauthDiscovery
        // A non-string override is not a URL the resolver could strip, and an
        // empty one is not a URL the schema would have accepted; reading past
        // either would file the server under a source nobody configured - so
        // they contribute nothing instead.
        return (
          publicUrl === undefined ||
          (typeof publicUrl === 'string' && publicUrl.length > 0)
        )
      })
      .map(([name, c]) => ({ name, oauthDiscovery: c.oauthDiscovery }))

    // Only resolve when there is a source to report. The resolver is deploy
    // machinery - it walks the provider's custom domains and logs when more
    // than one fronts the REST API - and this block is built on every command,
    // so running it for a service publishing no discovery is work and debug
    // noise spent on a key that would be omitted anyway.
    if (discoveryServers.length > 0) {
      addIfNonEmpty(
        block,
        'oauthDiscoveryUrlSources',
        discoveryUrlSources(discoveryServers, provider),
      )
    }

    addIfNonEmpty(
      block,
      'issuerTypes',
      [
        ...new Set(
          withDiscovery
            .map((c) => classifyIssuer(c.oauthDiscovery.issuer))
            .filter(Boolean),
        ),
      ].sort(),
    )

    const state = {}
    addIfPositive(state, 'true', cfgs.filter((c) => c.state === true).length)
    addIfPositive(
      state,
      'arn',
      cfgs.filter((c) => typeof c.state === 'string').length,
    )
    if (Object.keys(state).length > 0) block.state = state

    addIfNonEmpty(
      block,
      'timeouts',
      sortedUniqueNumbers(
        cfgs.map((c) => c.timeout).filter((v) => typeof v === 'number'),
      ),
    )
    addIfNonEmpty(
      block,
      'memorySizes',
      sortedUniqueNumbers(
        cfgs.map((c) => c.memorySize).filter((v) => typeof v === 'number'),
      ),
    )

    const endpointType = effectiveEndpointType(provider)
    if (endpointType) block.endpointType = endpointType

    // Whether a custom domain fronts the service at all, which is the shape of
    // the address clients are given - reported for every service defining MCP
    // servers, not only the ones publishing discovery (where the same fact
    // shows up per-server as an `oauthDiscoveryUrlSources` entry).
    // Presence only — never the domain itself.
    if (
      typeof provider?.domain === 'string' ||
      isObj(provider?.domain) ||
      isObj(provider?.domains) ||
      Array.isArray(provider?.domains)
    ) {
      block.domain = true
    }

    return block
  } catch {
    // Last-resort guard: analytics must never throw into the CLI run.
    return undefined
  }
}

/**
 * Runner-facing entry: takes the full service config and returns a spreadable
 * details fragment — `{ mcp: <block> }` when the service defines MCP servers,
 * or `{}` otherwise.
 *
 * The `config?.mcp` / `config?.provider` reads happen INSIDE this try/catch
 * (not at the call site), so a hostile/throwing config getter degrades to
 * `{}` rather than escaping into getAnalysisEventDetails — a throw there
 * aborts finalization and silently drops the billing usage event. Total —
 * never throws.
 */
export const buildMcpAnalytics = (config) => {
  try {
    const block = deriveMcpBlock(config?.mcp, config?.provider)
    return block ? { mcp: block } : {}
  } catch {
    return {}
  }
}
