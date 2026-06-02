'use strict'
// WebSocket API fixture: $connect / $disconnect / $default / broadcast.
//
// The module-level `connections` Set is shared across every route because we
// run offline with `useInProcess: true` (see serverless.yml). $connect adds
// the connection id, $disconnect removes it, and `broadcast` fans a message
// out to ALL tracked connections via the API Gateway Management API.
//
// To let the integration test assert the exact handler-received event shapes
// (including $connect / $disconnect, whose responses a WS client can't read),
// every invocation appends its event to a JSON-lines file named by the
// WS_EVENT_LOG env var. The test reads that file back.
const { appendFileSync } = require('node:fs')

const connections = new Set()

function record(event) {
  const logPath = process.env.WS_EVENT_LOG
  if (!logPath) return
  try {
    appendFileSync(logPath, `${JSON.stringify(event)}\n`)
  } catch {
    // Best-effort: never fail the handler because logging failed.
  }
}

// Post a message to a single connection via the API Gateway Management API.
// The endpoint mirrors what real AWS exposes: domainName + '/' + stage, which
// offline serves at http://localhost:<websocketPort>/<stage>/@connections/<id>.
async function postToConnection(event, connectionId, body) {
  const { domainName, stage } = event.requestContext
  const url = `http://${domainName}/${stage}/@connections/${connectionId}`
  return fetch(url, { method: 'POST', body })
}

exports.connect = async (event) => {
  record(event)
  connections.add(event.requestContext.connectionId)
  return { statusCode: 200 }
}

exports.disconnect = async (event) => {
  record(event)
  connections.delete(event.requestContext.connectionId)
  return { statusCode: 200 }
}

// The `$default` route deliberately uses a CommonJS `default`-named export
// (`handler: handler.default` in serverless.yml). This exercises the offline
// loader's CJS interop: `exports.default = fn` makes the ESM `default` binding
// the whole `{ default: fn }` object, which the loader must unwrap.
exports.default = async (event) => {
  record(event)
  return { statusCode: 200 }
}

exports.broadcast = async (event) => {
  record(event)
  const message = event.body
  await Promise.all(
    [...connections].map((id) =>
      postToConnection(event, id, message).catch(() => {}),
    ),
  )
  return { statusCode: 200 }
}
