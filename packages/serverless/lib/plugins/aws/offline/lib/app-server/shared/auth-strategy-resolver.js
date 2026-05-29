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
 *   1. `event.authorizer` (string or `{ name }`) → matching map entry. When a
 *      route declares both an authorizer and `private`, the authorizer wins so
 *      its Lambda actually runs through Hapi auth; the api-key requirement is
 *      enforced separately by the route handler.
 *   2. `event.private === true` → `privateStrategy` (if set) — the fallback
 *      used for private-only routes (or when the authorizer is unregistered).
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
  // Resolve the authorizer first so a both-present route runs its authorizer
  // through Hapi auth. Fall back to the private strategy when there is no
  // authorizer (or the named authorizer is not registered).
  const auth = event.authorizer
  if (auth) {
    const name = typeof auth === 'string' ? auth : auth?.name
    if (typeof name === 'string') {
      const strategy = authorizerStrategies.get(name)
      if (strategy) return strategy
    }
  }
  return event.private === true && privateStrategy ? privateStrategy : undefined
}
