/**
 * Walk `service.functions[*].events[].websocket` and produce a
 * Map<route, { functionKey, authorizer? }> for the WebSocket server to
 * dispatch incoming messages and lifecycle events against.
 *
 * Accepts both YAML forms:
 *   - Short: `websocket: '$connect'`
 *   - Long:  `websocket: { route: '$connect', authorizer: 'authFn' }`
 *
 * Authorizer references normalized to `{ name, ...rest }`. Duplicate
 * route declarations warn + first-wins.
 */

export function normalizeWebsocketEvents(serverless) {
  const functions = serverless?.service?.functions ?? {}
  /** @type {Map<string, { functionKey: string, authorizer?: object }>} */
  const routes = new Map()

  for (const [functionKey, fn] of Object.entries(functions)) {
    for (const eventEntry of fn?.events ?? []) {
      const ws = eventEntry?.websocket
      if (ws === undefined) continue

      let route
      let authorizer
      let routeResponseSelectionExpression
      if (typeof ws === 'string') {
        route = ws
      } else if (ws && typeof ws === 'object') {
        if (typeof ws.route !== 'string') continue
        route = ws.route
        if (ws.authorizer !== undefined) {
          authorizer =
            typeof ws.authorizer === 'string'
              ? { name: ws.authorizer }
              : ws.authorizer
        }
        if (typeof ws.routeResponseSelectionExpression === 'string') {
          routeResponseSelectionExpression = ws.routeResponseSelectionExpression
        }
      } else {
        continue
      }

      if (routes.has(route)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[offline] WebSocket route "${route}" is declared by multiple functions; ` +
            `"${routes.get(route).functionKey}" wins, "${functionKey}" is skipped.`,
        )
        continue
      }

      const entry = { functionKey }
      if (authorizer) entry.authorizer = authorizer
      if (routeResponseSelectionExpression) {
        entry.routeResponseSelectionExpression =
          routeResponseSelectionExpression
      }
      routes.set(route, entry)
    }
  }

  return routes
}
