/**
 * The single place the REST API's endpoint type is resolved, and the one
 * consequence of it that other layers ask about: whether a response that stays
 * silent for a while still reaches the client.
 *
 * Both the analytics block (`../analytics.js`) and the dev-mode invoke path
 * (`../../dev/index.js`) read the same value, so the resolution lives here
 * rather than in either of them - two copies would eventually disagree about
 * what an unset or oddly-cased `endpointType` means.
 *
 * Unit tests: `test/unit/lib/plugins/aws/dev/dev-mcp.test.js`.
 */

const ENDPOINT_TYPES = ['EDGE', 'REGIONAL', 'PRIVATE']

/**
 * The effective endpoint type of the shared REST API: the provider value when
 * it is one of the known types (any case), the Framework's EDGE default when
 * unset. A value that is set but unrecognized reports nothing — that
 * configuration fails validation elsewhere, and guessing here would file it
 * under a type nobody chose.
 */
export const effectiveEndpointType = (provider) => {
  const raw = provider?.endpointType
  if (raw === undefined || raw === null) return 'EDGE'
  if (typeof raw !== 'string') return undefined
  const up = raw.toUpperCase()
  return ENDPOINT_TYPES.includes(up) ? up : undefined
}

/**
 * CloudFront ends a connection that has produced no bytes for ~30 s, so an
 * edge-optimized endpoint gives a streaming response about 29 s to say
 * something before the client is left with a 504 - a ceiling raising the
 * function `timeout` does not move.
 */
export const EDGE_FIRST_BYTE_BUDGET_MS = 29000

/**
 * Whether a local MCP invocation that took `executionTimeInMs` is worth warning
 * about on this provider's endpoint type.
 *
 * Constraints this encodes:
 *  - REGIONAL and PRIVATE endpoints have no CloudFront hop, so the budget does
 *    not exist there: a 35 s tool call answers 200 both deployed and through a
 *    dev session. Their real bound is the integration timeout, which for an MCP
 *    server is the function `timeout`, and the invoke path's generic
 *    configured-timeout warning already fires past that value with advice that
 *    is correct there.
 *  - Anything the resolver cannot place - unset, or a value that is not one of
 *    the three types - is treated as edge. The asymmetry is deliberate: an
 *    over-eager warning costs a line of output, while a missing one costs a
 *    dropped response the user has to rediscover. The provider block is also
 *    not the whole picture - an imported REST API, or a CDN the user puts in
 *    front of the service, can reintroduce the same ceiling on an endpoint
 *    type that reports no CloudFront hop.
 */
export const shouldWarnEdgeFirstByteBudget = ({
  provider,
  executionTimeInMs,
}) => {
  if (!(executionTimeInMs > EDGE_FIRST_BYTE_BUDGET_MS)) return false
  const endpointType = effectiveEndpointType(provider)
  return endpointType === 'EDGE' || endpointType === undefined
}
