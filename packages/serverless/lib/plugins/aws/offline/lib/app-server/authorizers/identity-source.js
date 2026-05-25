/**
 * identitySource parsing + extraction for REQUEST-type Lambda authorizers.
 *
 * The route's `authorizer.identitySource` config is a comma-separated list
 * of AWS-style references (`method.request.header.<Name>` or
 * `method.request.querystring.<Name>`). At request time we walk the list
 * in declared order and return the first non-empty value as the
 * `authorizationToken` surfaced to the authorizer Lambda.
 */

/**
 * Parse the `identitySource` string into a typed-descriptor list.
 *
 * @param {string | undefined} spec
 * @returns {Array<{ kind: 'header' | 'querystring', name: string }>}
 */
export function parseIdentitySource(spec) {
  if (!spec) return []
  const out = []
  for (const part of spec.split(',')) {
    const trimmed = part.trim()
    const headerMatch = trimmed.match(/^method\.request\.header\.([\w-]+)$/)
    if (headerMatch) {
      out.push({ kind: 'header', name: headerMatch[1] })
      continue
    }
    const queryMatch = trimmed.match(/^method\.request\.querystring\.([\w-]+)$/)
    if (queryMatch) {
      out.push({ kind: 'querystring', name: queryMatch[1] })
      continue
    }
    // Anything else — silently skip.
  }
  return out
}

/**
 * Resolve the first non-empty value from a Hapi request against a parsed
 * identitySource list. Header lookup is case-insensitive.
 *
 * @param {{ headers?: Record<string, unknown>, query?: Record<string, unknown> }} request
 * @param {Array<{ kind: 'header' | 'querystring', name: string }>} sources
 * @returns {string | null}
 */
export function extractIdentitySource(request, sources) {
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
