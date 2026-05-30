/**
 * identitySource parsing + extraction for REQUEST-type Lambda authorizers.
 *
 * The route's `authorizer.identitySource` config is a comma-separated list
 * of AWS-style references (`method.request.header.<Name>` or
 * `method.request.querystring.<Name>`). A REQUEST authorizer requires EVERY
 * configured source to be present and non-empty; if any is missing the
 * authorizer Lambda is not invoked.
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
    const v = resolveSource(src, headers, query)
    if (v !== null) return v
  }
  return null
}

/**
 * Report whether EVERY parsed identitySource resolves to a non-empty value on
 * the request. Real API Gateway requires all configured identity sources to be
 * present for a REQUEST authorizer; if any is missing the authorizer Lambda is
 * not invoked (a 401 is returned). An empty list is vacuously true.
 *
 * @param {{ headers?: Record<string, unknown>, query?: Record<string, unknown> }} request
 * @param {Array<{ kind: 'header' | 'querystring', name: string }>} sources
 * @returns {boolean}
 */
export function allIdentitySourcesPresent(request, sources) {
  const headers = lowercaseHeaders(request?.headers ?? {})
  const query = request?.query ?? {}

  return sources.every((src) => resolveSource(src, headers, query) !== null)
}

function resolveSource(src, headers, query) {
  if (src.kind === 'header') {
    const v = headers[src.name.toLowerCase()]
    if (typeof v === 'string' && v.length > 0) return v
  } else if (src.kind === 'querystring') {
    const v = query[src.name]
    if (typeof v === 'string' && v.length > 0) return v
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
