/**
 * Shared Hapi-side helpers used by both the REST API (v1) and HTTP API (v2)
 * route loaders.
 *
 * Both loaders walk Framework `http` / `httpApi` events, translate APIGW
 * concepts (method strings, path templates, payload semantics) into Hapi
 * route-config primitives, and register Hapi routes.  The shared bits live
 * here so the two loaders stay in sync.
 */

/**
 * HTTP methods that cannot carry a request body.  Hapi refuses payload
 * options on these methods, so callers skip the payload configuration when
 * the route's method is one of them.
 *
 * @type {Set<string>}
 */
export const NO_BODY_METHODS = new Set([
  'GET',
  'HEAD',
  'DELETE',
  'OPTIONS',
  'TRACE',
])

/**
 * Map a normalized APIGW method to the Hapi method.
 *
 * APIGW uses `'*'` and `'ANY'` for catch-all; Hapi uses `'*'`.  Hapi v21
 * auto-serves HEAD for any GET route — explicit HEAD registration throws
 * "Cannot set HEAD route" — so HEAD declarations are folded onto GET.  The
 * APIGW routeKey still uses the original method because callers capture
 * `rawMethod` before invoking this function.
 *
 * @param {string} method  Uppercased method string.
 * @returns {string}
 */
export function toHapiMethod(method) {
  if (method === 'ANY' || method === '*') return '*'
  if (method === 'HEAD') return 'GET'
  return method
}

/**
 * Normalize a raw `http` / `httpApi` event declaration to `{ method, path }`.
 *
 * Framework accepts two YAML shapes for HTTP-style events:
 *  - String:  `'GET /users/{id}'` (and the bare `'*'` catch-all shorthand)
 *  - Object:  `{ method: 'get', path: '/users/{id}', ... }`
 *
 * Only the base `{ method, path }` shape is returned here; callers needing
 * additional object-form fields (e.g. `operationName` on httpApi events)
 * read them from the raw event at the call site.
 *
 * @param {string | { method: string, path: string }} eventValue
 * @returns {{ method: string, path: string }}
 */
export function normalizeHttpEvent(eventValue) {
  if (typeof eventValue === 'string') {
    // Bare '*' is the catch-all shorthand (any method, any path).
    if (eventValue === '*') return { method: 'ANY', path: '*' }

    const spaceIndex = eventValue.indexOf(' ')
    const method = eventValue.slice(0, spaceIndex).toUpperCase()
    const path = eventValue.slice(spaceIndex + 1)
    return { method, path }
  }

  return {
    method: eventValue.method.toUpperCase(),
    path: eventValue.path,
  }
}
