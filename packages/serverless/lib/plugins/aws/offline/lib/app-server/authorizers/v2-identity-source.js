/**
 * v2 identitySource parsing + extraction for HTTP API authorizers.
 *
 * v2 syntax (different from v1's `method.request.*`):
 *   $request.header.<Name>
 *   $request.querystring.<Name>
 *
 * Accepts a comma-separated string OR an array of strings. First non-empty
 * value wins (declaration order). Returns null when nothing resolves.
 */

/**
 * @param {string | string[] | undefined} spec
 * @returns {Array<{ kind: 'header' | 'querystring', name: string }>}
 */
export function parseV2IdentitySource(spec) {
  if (!spec) return []
  const parts = Array.isArray(spec) ? spec : String(spec).split(',')
  const out = []
  for (const part of parts) {
    const trimmed = String(part).trim()
    const headerMatch = trimmed.match(/^\$request\.header\.([\w-]+)$/)
    if (headerMatch) {
      out.push({ kind: 'header', name: headerMatch[1] })
      continue
    }
    const queryMatch = trimmed.match(/^\$request\.querystring\.([\w-]+)$/)
    if (queryMatch) {
      out.push({ kind: 'querystring', name: queryMatch[1] })
    }
    // Anything else (incl. v1's method.request.*) silently skipped.
  }
  return out
}

/**
 * Resolve the first non-empty identitySource value from a Hapi request.
 * Header lookup is case-insensitive (HTTP headers are case-insensitive).
 *
 * @param {{ headers?: Record<string, unknown>, query?: Record<string, unknown> }} request
 * @param {Array<{ kind: 'header' | 'querystring', name: string }>} sources
 * @returns {string | null}
 */
export function extractV2IdentitySource(request, sources) {
  const headers = lowercaseHeaders(request?.headers ?? {})
  const query = request?.query ?? {}

  for (const src of sources) {
    if (src.kind === 'header') {
      const v = headers[src.name.toLowerCase()]
      if (typeof v === 'string' && v.length > 0) return v
    } else if (src.kind === 'querystring') {
      const v = query[src.name]
      if (typeof v === 'string' && v.length > 0) return v
    }
  }
  return null
}

function lowercaseHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v
  }
  return out
}
