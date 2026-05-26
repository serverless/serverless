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

const DEFAULT_API_ID = 'private'
const ROUTE_SELECTION_KEY = 'action'

export function createWebSocketServer({
  hapiServer,
  serverless,
  onRequest,
  registry,
  stage,
  accountId,
  region,
  apiId = DEFAULT_API_ID,
}) {
  const routes = normalizeWebsocketEvents(serverless)
  const wss = new WebSocketServer({ noServer: true })

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
    if (result === 'Unauthorized') return { allow: false }
    const { principalId, policyDocument, context = {} } = result
    if (!principalId) return { allow: false }
    try {
      const evaluation = evaluatePolicy({
        principalId,
        methodArn: event.methodArn,
        policyDocument,
        context,
      })
      return { allow: evaluation.allow }
    } catch {
      return { allow: false }
    }
  }

  async function handleUpgrade(request, socket, head) {
    const connectionId = crypto.randomUUID()
    const connectRoute = routes.get('$connect')

    // Authorizer (if declared on $connect).
    if (connectRoute?.authorizer) {
      const { allow } = await runAuthorizer(
        connectRoute.authorizer,
        request,
        connectionId,
      )
      if (!allow) {
        rejectUpgrade(socket, 401)
        return
      }
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
      registry.add({
        connectionId,
        ws,
        sourceIp: request.socket?.remoteAddress ?? '127.0.0.1',
        userAgent: request.headers?.['user-agent'] ?? '',
      })

      ws.on('message', async (data) => {
        const payload = data.toString()
        registry.touch(connectionId)
        let action
        try {
          const parsed = JSON.parse(payload)
          if (parsed && typeof parsed === 'object') {
            const candidate = parsed[ROUTE_SELECTION_KEY]
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
          stage,
          accountId,
          region,
          apiId,
        })
        try {
          await onRequest(entry.functionKey, event)
        } catch {
          // Handler error — drop; WS clients can't see HTTP-style 502.
        }
      })

      ws.on('close', async () => {
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
        })
        try {
          await onRequest(disconnectRoute.functionKey, event)
        } catch {
          // Best-effort; nothing to surface.
        }
      })
    })
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
