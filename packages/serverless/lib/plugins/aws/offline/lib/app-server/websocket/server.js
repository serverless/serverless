/**
 * WebSocket server — hooks Hapi's HTTP `upgrade` event to a `ws.Server`
 * and orchestrates the AWS WebSocket API lifecycle: $connect handshake
 * (with optional Lambda authorizer), message dispatch via
 * `$request.body.action` route selection (default), and $disconnect close.
 *
 * - WS protocol upgrades short-circuit Hapi's HTTP route table (Hapi's
 *   `upgrade` event fires before route matching), so the WS surface
 *   doesn't compete with HTTP / ALB / REST routes for path matching.
 * - On reject (auth deny or $connect non-2xx), the underlying HTTP
 *   socket is responded to with `HTTP/1.1 <code>` and closed — no WS
 *   protocol switch happens.
 */

import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'
import {
  buildConnectEvent,
  buildDisconnectEvent,
  buildMessageEvent,
  buildAuthorizerEvent,
} from './event-factory.js'
import { normalizeWebsocketEvents } from './lifecycle-routes.js'
import { evaluatePolicy } from '../authorizers/policy-evaluator.js'
import { validateAuthorizerContext } from '../authorizers/validate-authorizer-context.js'

const DEFAULT_API_ID = 'private'
const ROUTE_SELECTION_KEY = 'action'
const DEFAULT_HARD_TIMEOUT_SECONDS = 7200
const DEFAULT_IDLE_TIMEOUT_SECONDS = 600

export function createWebSocketServer({
  hapiServer,
  serverless,
  onRequest,
  registry,
  stage,
  accountId,
  region,
  apiId = DEFAULT_API_ID,
  webSocketHardTimeout = DEFAULT_HARD_TIMEOUT_SECONDS,
  webSocketIdleTimeout = DEFAULT_IDLE_TIMEOUT_SECONDS,
}) {
  const routes = normalizeWebsocketEvents(serverless)
  const wss = new WebSocketServer({ noServer: true })

  // Route selection key. API Gateway picks the message route by evaluating
  // the provider's websocketsApiRouteSelectionExpression (default
  // `$request.body.action`); the `$request.body.<key>` form names the body
  // property whose value is the action.
  const selectionKey = parseRouteSelectionKey(
    serverless?.service?.provider?.websocketsApiRouteSelectionExpression,
  )

  function rejectUpgrade(socket, statusCode) {
    const status = `${statusCode}`
    socket.write(`HTTP/1.1 ${status} \r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }

  async function runAuthorizer(authorizerRef, request, connectionId) {
    const authFn = authorizerRef.name
    const event = buildAuthorizerEvent({
      connectionId,
      request,
      stage,
      accountId,
      region,
      apiId,
    })
    let result
    try {
      result = await onRequest(authFn, event)
    } catch {
      return { allow: false }
    }
    if (!result || typeof result !== 'object') return { allow: false }
    const { principalId, policyDocument, context = {} } = result
    if (!principalId) return { allow: false }
    try {
      const evaluation = evaluatePolicy({
        principalId,
        methodArn: event.methodArn,
        policyDocument,
        context,
      })
      if (!evaluation.allow) return { allow: false }
    } catch {
      return { allow: false }
    }
    const validated = validateAuthorizerContext(context)
    if (!validated.ok) return { allow: false }
    // Spread the context first so the reserved principalId / integrationLatency
    // fields always win — API Gateway does not let authorizer context override
    // them.
    const authorizer = {
      ...validated.context,
      integrationLatency: '42',
      principalId,
    }
    return { allow: true, authorizer }
  }

  async function handleUpgrade(request, socket, head) {
    const connectionId = crypto.randomUUID()
    const connectRoute = routes.get('$connect')

    // Authorizer (if declared on $connect). The validated context is held
    // for the connection's lifetime so it can be surfaced on
    // requestContext.authorizer of the $connect / message / $disconnect
    // events, matching real API Gateway.
    let connectionAuthorizer
    if (connectRoute?.authorizer) {
      const { allow, authorizer } = await runAuthorizer(
        connectRoute.authorizer,
        request,
        connectionId,
      )
      if (!allow) {
        rejectUpgrade(socket, 401)
        return
      }
      connectionAuthorizer = authorizer
    }

    // $connect handler (if declared).
    if (connectRoute) {
      let result
      try {
        const event = buildConnectEvent({
          connectionId,
          request,
          stage,
          accountId,
          region,
          apiId,
          authorizer: connectionAuthorizer,
        })
        result = await onRequest(connectRoute.functionKey, event)
      } catch {
        rejectUpgrade(socket, 500)
        return
      }
      const statusCode = result?.statusCode ?? 200
      if (statusCode < 200 || statusCode >= 300) {
        rejectUpgrade(socket, statusCode)
        return
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const hardTimer = setTimeout(
        () => ws.close(1001, 'WebSocket hard timeout exceeded'),
        webSocketHardTimeout * 1000,
      )
      hardTimer.unref?.()

      let idleTimer
      const resetIdleTimer = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(
          () => ws.close(1001, 'WebSocket idle timeout exceeded'),
          webSocketIdleTimeout * 1000,
        )
        idleTimer.unref?.()
      }
      resetIdleTimer()

      registry.add({
        connectionId,
        ws,
        sourceIp: request.socket?.remoteAddress ?? '127.0.0.1',
        userAgent: request.headers?.['user-agent'] ?? '',
      })

      ws.on('ping', resetIdleTimer)
      ws.on('pong', resetIdleTimer)

      ws.on('message', async (data) => {
        resetIdleTimer()
        const payload = data.toString()
        registry.touch(connectionId)
        let action
        try {
          const parsed = JSON.parse(payload)
          if (parsed && typeof parsed === 'object') {
            const candidate = parsed[selectionKey]
            if (typeof candidate === 'string') action = candidate
          }
        } catch {
          // Non-JSON payload — fall through to $default.
        }
        let route = action && routes.has(action) ? action : '$default'
        const entry = routes.get(route)
        if (!entry) return // No matching route + no $default; drop silently.
        const event = buildMessageEvent({
          connectionId,
          route,
          payload,
          request,
          stage,
          accountId,
          region,
          apiId,
          authorizer: connectionAuthorizer,
        })
        let result
        try {
          result = await onRequest(entry.functionKey, event)
        } catch {
          // Handler error. When the route declares a $default route response,
          // API Gateway returns an error frame to the client on the same
          // connection; otherwise the failure is invisible to WS clients.
          if (
            entry.routeResponseSelectionExpression === '$default' &&
            ws.readyState === ws.OPEN
          ) {
            ws.send(
              JSON.stringify({
                message: 'Internal server error',
                connectionId,
                requestId: crypto.randomUUID(),
              }),
            )
          }
          return
        }
        // Two-way send: when the route declares a $default route response, API
        // Gateway returns the proxy response body to the client on the same
        // connection. A bare (non-{body}) return sends nothing.
        if (
          entry.routeResponseSelectionExpression === '$default' &&
          result &&
          typeof result === 'object' &&
          result.body &&
          ws.readyState === ws.OPEN
        ) {
          ws.send(String(result.body))
        }
      })

      ws.on('close', async () => {
        clearTimeout(hardTimer)
        clearTimeout(idleTimer)
        registry.remove(connectionId)
        const disconnectRoute = routes.get('$disconnect')
        if (!disconnectRoute) return
        const event = buildDisconnectEvent({
          connectionId,
          request,
          stage,
          accountId,
          region,
          apiId,
          authorizer: connectionAuthorizer,
        })
        try {
          await onRequest(disconnectRoute.functionKey, event)
        } catch {
          // Best-effort; nothing to surface.
        }
      })
    })
  }

  function parseRouteSelectionKey(expression) {
    if (typeof expression === 'string') {
      const match = expression.match(/^\$request\.body\.(.+)$/)
      if (match) return match[1]
    }
    return ROUTE_SELECTION_KEY
  }

  hapiServer.listener.on('upgrade', (request, socket, head) => {
    handleUpgrade(request, socket, head)
  })

  return {
    async stop() {
      // Close all sockets gracefully on shutdown.
      for (const record of registry.all()) {
        try {
          record.ws.close(1001, 'Going away')
        } catch {
          // ignore
        }
      }
      wss.close()
    },
  }
}
