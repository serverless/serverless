/**
 * Resolve the Hapi auth-strategy name for a route based on its YAML
 * declaration. Returns `undefined` when no auth applies — Hapi leaves
 * `route.options.auth` unset and the route is public.
 *
 * Generic over event shape: works for REST v1 `http` events
 * (`{ private, authorizer }`) and HTTP API v2 `httpApi` events
 * (`{ authorizer }`). Callers pass the Map that corresponds to the event
 * version they're processing.
 *
 * Precedence:
 *   1. `event.private === true` → `privateStrategy` (if set)
 *   2. `event.authorizer` (string or `{ name }`) → matching map entry
 *
 * @param {object} args
 * @param {object | string | undefined} args.event  Raw event object or
 *   short-form string. Strings always resolve to undefined (no auth
 *   metadata in short form).
 * @param {string | null} args.privateStrategy  Strategy registered for
 *   `private: true` routes, or null when none is registered.
 * @param {Map<string, string>} args.authorizerStrategies  Map from
 *   authorizer name → strategy name. The caller picks the v1 or v2 Map.
 * @returns {string | undefined}
 */
export function resolveAuthStrategy({
  event,
  privateStrategy,
  authorizerStrategies,
}) {
  if (!event || typeof event !== 'object') return undefined
  if (event.private === true && privateStrategy) return privateStrategy
  const auth = event.authorizer
  if (auth) {
    const name = typeof auth === 'string' ? auth : auth?.name
    if (typeof name === 'string') return authorizerStrategies.get(name)
  }
  return undefined
}
