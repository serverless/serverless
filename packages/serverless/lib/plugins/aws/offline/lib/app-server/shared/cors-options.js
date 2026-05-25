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
 * Build a Hapi route config that responds to OPTIONS preflight requests with
 * the configured Access-Control-* headers and a 204 status.
 *
 * The handler computes `Access-Control-Allow-Origin` as follows:
 *  - If origins include `*`:
 *      - `allowCredentials` is true AND request carries `Origin` → echo it
 *        (the spec forbids `*` together with credentials).
 *      - Otherwise → `*`.
 *  - Else if the request's origin matches one of the configured origins →
 *    echo the request origin.
 *  - Else → the first configured origin (APIGW still sends a header with a
 *    fixed value rather than omitting it).
 *
 * @param {{ path: string, corsConfig: ReturnType<typeof normalizeCorsConfig> }} params
 * @returns {{ method: 'OPTIONS', path: string, handler: Function }}
 */
export function buildCorsOptionsRoute({ path, corsConfig }) {
  return {
    handler(request, h) {
      const requestOrigin = request.headers?.origin

      let allowOrigin
      if (corsConfig.origins.includes('*')) {
        if (corsConfig.allowCredentials && requestOrigin) {
          allowOrigin = requestOrigin
        } else {
          allowOrigin = '*'
        }
      } else if (requestOrigin && corsConfig.origins.includes(requestOrigin)) {
        allowOrigin = requestOrigin
      } else {
        allowOrigin = corsConfig.origins[0]
      }

      let response = h
        .response('')
        .code(204)
        .header('Access-Control-Allow-Origin', allowOrigin)
        .header('Access-Control-Allow-Headers', corsConfig.headers.join(','))
        .header('Access-Control-Allow-Methods', corsConfig.methods.join(','))

      if (corsConfig.allowCredentials) {
        response = response.header('Access-Control-Allow-Credentials', 'true')
      }
      if (corsConfig.maxAge !== undefined) {
        response = response.header(
          'Access-Control-Max-Age',
          String(corsConfig.maxAge),
        )
      }
      if (corsConfig.exposedHeaders.length > 0) {
        response = response.header(
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
