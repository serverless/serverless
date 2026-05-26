/**
 * ApiGatewayManagementApi HTTP routes mounted on the offline app server
 * at `/<stage>/@connections/{id}` — these mirror the URLs real AWS
 * generates for `event.requestContext.domainName + '/' +
 * event.requestContext.stage`, so handlers using the AWS SDK's
 * ApiGatewayManagementApiClient with `endpoint: 'http://localhost:3000/dev'`
 * hit the right paths without modification.
 *
 *   POST   /<stage>/@connections/{id}  → PostToConnection
 *   GET    /<stage>/@connections/{id}  → GetConnection
 *   DELETE /<stage>/@connections/{id}  → DeleteConnection
 *
 * Missing or closed connection → 410 Gone (AWS-correct).
 */

const WS_OPEN = 1

function isOpen(ws) {
  return ws && ws.readyState === WS_OPEN
}

function gone(h) {
  return h.response({}).code(410)
}

export function registerManagementApiRoutes({ hapiServer, registry, stage }) {
  const basePath = `/${stage}/@connections/{id}`

  hapiServer.route({
    method: 'POST',
    path: basePath,
    options: {
      payload: { parse: false, output: 'data', maxBytes: 10 * 1024 * 1024 },
    },
    handler(request, h) {
      const record = registry.get(request.params.id)
      if (!record) return gone(h)
      if (!isOpen(record.ws)) return gone(h)
      const payload =
        request.payload === undefined || request.payload === null
          ? ''
          : typeof request.payload === 'string'
            ? request.payload
            : Buffer.isBuffer(request.payload)
              ? request.payload.toString('utf8')
              : JSON.stringify(request.payload)
      record.ws.send(payload)
      registry.touch(record.connectionId)
      return h.response({}).code(200)
    },
  })

  hapiServer.route({
    method: 'GET',
    path: basePath,
    handler(request, h) {
      const record = registry.get(request.params.id)
      if (!record) return gone(h)
      return h
        .response({
          ConnectedAt: record.connectedAt,
          Identity: {
            SourceIp: record.sourceIp,
            UserAgent: record.userAgent,
          },
          LastActiveAt: record.lastActiveAt,
        })
        .code(200)
        .type('application/json')
    },
  })

  hapiServer.route({
    method: 'DELETE',
    path: basePath,
    handler(request, h) {
      const record = registry.get(request.params.id)
      if (!record) return gone(h)
      try {
        record.ws.close(1000, 'Normal closure')
      } catch {
        // Best-effort; the close-listener in server.js still wipes the registry.
      }
      return h.response().code(204)
    },
  })
}
