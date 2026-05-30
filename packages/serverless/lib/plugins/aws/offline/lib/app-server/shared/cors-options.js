/**
 * Shared CORS preflight (OPTIONS) synthesizer for the offline app server.
 *
 * Real API Gateway answers preflight requests with a fixed shape of
 * `Access-Control-*` headers and a 204 status, governed by either a per-route
 * `http.cors` block (REST API) or a provider-wide `provider.httpApi.cors`
 * block (HTTP API).  Both surfaces ultimately need an OPTIONS route that
 * mirrors that behaviour, so the logic lives here as a single source of
 * truth.
 *
 * We deliberately do NOT lean on Hapi's built-in `cors` route option: Hapi
 * adds `vary: Origin`, normalises header casing, and emits `*` differently
 * from APIGW in a handful of edge cases.  Synthesising a focused OPTIONS
 * handler that matches the AWS spec keeps the offline response byte-for-byte
 * consistent with deployed behaviour.
 */

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Default allow-list of request headers that AWS API Gateway emits when CORS
 * is enabled without further configuration.
 *
 * @type {string[]}
 */
const AWS_DEFAULT_HEADERS = [
  'Content-Type',
  'X-Amz-Date',
  'Authorization',
  'X-Api-Key',
  'X-Amz-Security-Token',
  'X-Amz-User-Agent',
  'X-Amzn-Trace-Id',
]

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * Expand a raw `cors` value (as accepted by Framework YAML) into a typed
 * configuration object, or `null` when CORS is disabled.
 *
 * Recognised object fields:
 *  - `origin`           — single origin string
 *  - `origins`          — array of origins (takes precedence over `origin`)
 *  - `headers`          — array of allowed request headers (defaults to AWS defaults)
 *  - `methods`          — array of allowed methods (OPTIONS auto-appended if missing)
 *  - `allowCredentials` — boolean (default `false`)
 *  - `maxAge`           — integer seconds (default `undefined`)
 *  - `exposedHeaders`   — array of response header names (default `[]`)
 *
 * @param {true | false | null | undefined | object} cors
 * @returns {{
 *   origins: string[],
 *   headers: string[],
 *   methods: string[],
 *   allowCredentials: boolean,
 *   maxAge: number | undefined,
 *   exposedHeaders: string[],
 * } | null}
 */
export function normalizeCorsConfig(cors) {
  if (cors === false || cors === null || cors === undefined) {
    return null
  }

  if (cors === true) {
    return {
      origins: ['*'],
      headers: [...AWS_DEFAULT_HEADERS],
      methods: ['OPTIONS'],
      allowCredentials: false,
      maxAge: undefined,
      exposedHeaders: [],
    }
  }

  let origins
  if (Array.isArray(cors.origins) && cors.origins.length > 0) {
    origins = [...cors.origins]
  } else if (typeof cors.origin === 'string') {
    origins = [cors.origin]
  } else {
    origins = ['*']
  }

  const headers = Array.isArray(cors.headers)
    ? [...cors.headers]
    : [...AWS_DEFAULT_HEADERS]

  let methods
  if (Array.isArray(cors.methods)) {
    methods = [...cors.methods]
    if (!methods.includes('OPTIONS')) {
      methods.push('OPTIONS')
    }
  } else {
    methods = ['OPTIONS']
  }

  const exposedHeaders = Array.isArray(cors.exposedHeaders)
    ? [...cors.exposedHeaders]
    : []

  return {
    origins,
    headers,
    methods,
    allowCredentials: Boolean(cors.allowCredentials),
    maxAge: typeof cors.maxAge === 'number' ? cors.maxAge : undefined,
    exposedHeaders,
  }
}

/**
 * Union a CORS config's configured methods with the route's own HTTP
 * method(s), upper-cased and de-duped, always including OPTIONS — matching the
 * Access-Control-Allow-Methods API Gateway returns for a preflight. A
 * catch-all route method (`ANY`) is emitted as the `*` wildcard, never the
 * literal `ANY` token (which is not a valid HTTP method for the client).
 *
 * @param {string[]} configuredMethods
 * @param {string[]} routeMethods
 * @returns {string[]}
 */
export function mergeAllowMethods(configuredMethods, routeMethods) {
  const set = new Set()
  for (const m of [...routeMethods, ...configuredMethods, 'OPTIONS']) {
    if (typeof m !== 'string' || m.length === 0) continue
    const upper = m.toUpperCase()
    set.add(upper === 'ANY' ? '*' : upper)
  }
  return [...set]
}

/**
 * Compute the value to use for the `Access-Control-Allow-Origin` response
 * header given the request origin and the normalized CORS config.
 *
 * Resolution rules (matching real APIGW):
 *  - If the allow-list contains `*`:
 *      - `allowCredentials` is true AND request carries `Origin` → echo it
 *        (the spec forbids `*` together with credentials).
 *      - Otherwise → `*`.
 *  - Else if the request's origin matches one of the configured origins →
 *    echo the request origin.
 *  - Else → the first configured origin. APIGW behaviorally still emits an
 *    Allow-Origin header in this case (rather than omitting it or 403'ing
 *    the request); the browser is left to enforce the mismatch, which it
 *    will, blocking the response on the client side.
 *
 * Shared by both the OPTIONS preflight handler and the non-OPTIONS response
 * header injector so the two code paths cannot drift.
 *
 * @param {ReturnType<typeof normalizeCorsConfig>} corsConfig
 * @param {string | undefined} requestOrigin
 * @returns {string}
 */
export function resolveAllowOrigin(corsConfig, requestOrigin) {
  if (corsConfig.origins.includes('*')) {
    if (corsConfig.allowCredentials && requestOrigin) {
      return requestOrigin
    }
    return '*'
  }
  // Real APIGW lower-cases the scheme/host of both sides before comparing
  // (per RFC 6454, origins are case-insensitive in scheme + host). Browsers
  // typically normalize already, but configured allow-list entries can be
  // mixed-case in user YAML. Compare case-insensitively; echo the
  // request's value back verbatim (matching what the browser sent).
  if (requestOrigin) {
    const lowerRequestOrigin = requestOrigin.toLowerCase()
    const matches = corsConfig.origins.some(
      (allowed) => allowed.toLowerCase() === lowerRequestOrigin,
    )
    if (matches) return requestOrigin
  }
  return corsConfig.origins[0]
}

/**
 * Add CORS response headers to a non-OPTIONS Hapi response. Real APIGW adds
 * these to every successful response from a CORS-enabled endpoint so the
 * browser doesn't block cross-origin requests after a preflight succeeds —
 * without them, a successful 200 from a different origin is dropped by the
 * browser and the caller sees a CORS error despite the server having
 * responded normally.
 *
 * Emits:
 *  - Access-Control-Allow-Origin (always; value resolved via resolveAllowOrigin)
 *  - Access-Control-Allow-Credentials: 'true' (only when corsConfig.allowCredentials)
 *  - Access-Control-Expose-Headers (only when exposedHeaders.length > 0)
 *
 * Does NOT emit Allow-Headers, Allow-Methods, or Max-Age — those are
 * preflight-only per the AWS spec and have no meaning on a regular response.
 *
 * @param {import('@hapi/hapi').ResponseObject} response
 * @param {ReturnType<typeof normalizeCorsConfig>} corsConfig
 * @param {string | undefined} requestOrigin
 * @returns {import('@hapi/hapi').ResponseObject} The same response, mutated.
 */
export function applyCorsResponseHeaders(response, corsConfig, requestOrigin) {
  const allowOrigin = resolveAllowOrigin(corsConfig, requestOrigin)
  response.header('Access-Control-Allow-Origin', allowOrigin)

  if (corsConfig.allowCredentials) {
    response.header('Access-Control-Allow-Credentials', 'true')
  }

  if (corsConfig.exposedHeaders.length > 0) {
    response.header(
      'Access-Control-Expose-Headers',
      corsConfig.exposedHeaders.join(','),
    )
  }

  return response
}

/**
 * Build a Hapi route config that responds to OPTIONS preflight requests with
 * the configured Access-Control-* headers and a 204 status.
 *
 * Origin resolution is delegated to `resolveAllowOrigin` so preflight and
 * non-preflight responses share the exact same rules.
 *
 * `statusCode` lets the caller pick the preflight status: REST API answers a
 * preflight from a MOCK integration with `200`, while HTTP API answers `204`.
 *
 * @param {{ path: string, corsConfig: ReturnType<typeof normalizeCorsConfig>, statusCode?: number }} params
 * @returns {{ method: 'OPTIONS', path: string, handler: Function }}
 */
export function buildCorsOptionsRoute({ path, corsConfig, statusCode = 204 }) {
  return {
    handler(request, h) {
      const requestOrigin = request.headers.origin
      const allowOrigin = resolveAllowOrigin(corsConfig, requestOrigin)

      // Hapi's response.header() mutates and returns the same response
      // object — so chained / repeated header() calls all act on `response`.
      const response = h
        .response('')
        .code(statusCode)
        .header('Access-Control-Allow-Origin', allowOrigin)
        .header('Access-Control-Allow-Headers', corsConfig.headers.join(','))
        .header('Access-Control-Allow-Methods', corsConfig.methods.join(','))

      if (corsConfig.allowCredentials) {
        response.header('Access-Control-Allow-Credentials', 'true')
      }
      if (corsConfig.maxAge !== undefined) {
        response.header('Access-Control-Max-Age', String(corsConfig.maxAge))
      }
      if (corsConfig.exposedHeaders.length > 0) {
        response.header(
          'Access-Control-Expose-Headers',
          corsConfig.exposedHeaders.join(','),
        )
      }

      return response
    },
    method: 'OPTIONS',
    path,
  }
}
