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

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const ENDPOINT_TYPES = ['EDGE', 'REGIONAL', 'PRIVATE']

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
 * The effective endpoint type of the shared REST API: the provider value when
 * it is one of the known types (any case), the Framework's EDGE default when
 * unset. A value that is set but unrecognized reports nothing — that
 * configuration fails validation elsewhere, and guessing here would file it
 * under a type nobody chose.
 */
const effectiveEndpointType = (provider) => {
  const raw = provider?.endpointType
  if (raw === undefined || raw === null) return 'EDGE'
  if (typeof raw !== 'string') return undefined
  const up = raw.toUpperCase()
  return ENDPOINT_TYPES.includes(up) ? up : undefined
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
    const cfgs = Object.values(servers).filter(isObj)

    const block = { count: names.length }

    const withAuth = cfgs.filter((c) => isObj(c.auth))
    addIfPositive(block, 'auth', withAuth.length)
    addIfPositive(
      block,
      'authAuthorizer',
      withAuth.filter((c) => typeof c.auth.authorizer === 'string').length,
    )

    addIfNonEmpty(
      block,
      'issuerTypes',
      [
        ...new Set(
          withAuth.map((c) => classifyIssuer(c.auth.issuer)).filter(Boolean),
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

    // `auth` without a root-mapped custom domain is the population exposed to
    // the OAuth-discovery limitation, so domain presence rides along here.
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
