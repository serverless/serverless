/**
 * Derive the raw request path the same way AWS API Gateway HTTP API reports it:
 * verbatim from the wire, with a trailing slash preserved and percent-encoding
 * left undecoded.
 *
 * The app server strips trailing slashes for slash-insensitive route matching
 * and Hapi decodes `request.path`, so neither is suitable as the raw path. The
 * original target (request line) is available as `request.raw.req.url` (e.g.
 * `/items/?x=1`); the raw path is that value with the query string removed.
 *
 * Falls back to Hapi's decoded `request.path` for in-process callers (unit
 * tests, simulated requests) that don't carry the raw socket data.
 *
 * @param {object} request  The Hapi request.
 * @returns {string}
 */
export function resolveRawPath(request) {
  const target = request?.raw?.req?.url
  if (typeof target === 'string' && target.length > 0) {
    const queryIndex = target.indexOf('?')
    return queryIndex === -1 ? target : target.slice(0, queryIndex)
  }
  return request.path
}
