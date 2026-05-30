/**
 * AWS WebSocket API event factories. The four lifecycle/dispatch shapes
 * AWS emits to a Lambda function attached to a WS route or authorizer:
 *
 *   - $connect:     eventType=CONNECT,    routeKey=$connect
 *   - $disconnect:  eventType=DISCONNECT, routeKey=$disconnect
 *   - message:      eventType=MESSAGE,    routeKey=<action or $default>
 *   - authorizer:   type=REQUEST,         requestContext.eventType=CONNECT
 *
 * The shared `requestContext` carries `apiId='private'` (parity literal),
 * `connectionId`, `connectedAt`, `domainName`, `stage`, an identity object
 * with placeholder null-fields, and UUID requestIds. When the $connect
 * authorizer validated a context, the $connect / message / $disconnect
 * builders also receive it via the optional `authorizer` param and expose
 * it on `requestContext.authorizer`; it is omitted when absent.
 *
 * Query / multi-value-query fields are OMITTED entirely when no query is
 * present on the upgrade URL (spread-when-truthy). Headers and
 * multiValueHeaders are always present on connect / disconnect / authorizer
 * events; message events carry only body + isBase64Encoded + requestContext.
 */

import crypto from 'node:crypto'
import { formatClfTime } from '../shared/clf-time.js'

function parseHeaders(rawHeaders) {
  const single = {}
  const multi = {}
  if (!Array.isArray(rawHeaders)) return { single, multi }
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase()
    const value = rawHeaders[i + 1]
    single[name] = value
    if (multi[name]) multi[name].push(value)
    else multi[name] = [value]
  }
  return { single, multi }
}

function parseQuery(rawUrl) {
  const qIdx = rawUrl.indexOf('?')
  if (qIdx < 0) return null
  const params = new URLSearchParams(rawUrl.slice(qIdx + 1))
  const single = {}
  const multi = {}
  for (const [k, v] of params.entries()) {
    single[k] = v
    if (multi[k]) multi[k].push(v)
    else multi[k] = [v]
  }
  return { single, multi }
}

function buildRequestContext({
  connectionId,
  eventType,
  routeKey,
  request,
  stage,
  apiId,
  authorizer,
  connectedAt,
  messageId,
}) {
  const now = Date.now()
  // Compose `domainName` from the Host header but fall back to the
  // server's bound port when the client omits it from the header (some
  // WS client libraries don't append the port to Host for HTTP upgrades,
  // even when the port isn't the protocol default). Handlers compose
  // ApiGatewayManagementApi endpoints from `domainName + '/' + stage`,
  // so the port must always be present.
  const hostHeader = request?.headers?.host
  const localPort = request?.socket?.localPort
  let host
  if (hostHeader && hostHeader.includes(':')) {
    host = hostHeader
  } else if (hostHeader && localPort) {
    host = `${hostHeader}:${localPort}`
  } else if (localPort) {
    host = `localhost:${localPort}`
  } else {
    host = hostHeader ?? 'localhost'
  }
  const userAgent = request?.headers?.['user-agent'] ?? ''
  const sourceIp = request?.socket?.remoteAddress ?? '127.0.0.1'
  return {
    apiId,
    ...(authorizer ? { authorizer } : {}),
    // The connection's establishment time is stable across all events for
    // that connection; the connect event seeds it (defaulting to now).
    connectedAt: connectedAt ?? now,
    connectionId,
    domainName: host,
    eventType,
    extendedRequestId: crypto.randomUUID(),
    identity: {
      accessKey: null,
      accountId: null,
      caller: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp,
      user: null,
      userAgent,
      userArn: null,
    },
    messageDirection: 'IN',
    // Real API Gateway sets messageId only on MESSAGE events; the key is
    // absent on $connect / $disconnect.
    ...(messageId != null ? { messageId } : {}),
    requestId: crypto.randomUUID(),
    requestTime: formatClfTime(new Date(now)),
    requestTimeEpoch: now,
    routeKey,
    stage,
  }
}

export function buildConnectEvent({
  connectionId,
  request,
  stage,
  accountId,
  region,
  apiId,
  authorizer,
  connectedAt,
}) {
  const { single: headers, multi: multiValueHeaders } = parseHeaders(
    request.rawHeaders,
  )
  const query = parseQuery(request.url ?? '')
  return {
    headers,
    multiValueHeaders,
    isBase64Encoded: false,
    ...(query
      ? {
          queryStringParameters: query.single,
          multiValueQueryStringParameters: query.multi,
        }
      : {}),
    requestContext: buildRequestContext({
      connectionId,
      eventType: 'CONNECT',
      routeKey: '$connect',
      request,
      stage,
      apiId,
      authorizer,
      connectedAt,
    }),
  }
}

export function buildDisconnectEvent({
  connectionId,
  request,
  stage,
  accountId,
  region,
  apiId,
  authorizer,
  connectedAt,
  disconnectStatusCode,
  disconnectReason,
}) {
  const { single: headers, multi: multiValueHeaders } = parseHeaders(
    request.rawHeaders,
  )
  return {
    headers,
    multiValueHeaders,
    isBase64Encoded: false,
    requestContext: {
      ...buildRequestContext({
        connectionId,
        eventType: 'DISCONNECT',
        routeKey: '$disconnect',
        request,
        stage,
        apiId,
        authorizer,
        connectedAt,
      }),
      // The $disconnect requestContext carries the WebSocket close code and
      // reason that ended the connection (e.g. 1001 / 'Going away').
      disconnectStatusCode,
      disconnectReason,
    },
  }
}

export function buildMessageEvent({
  connectionId,
  route,
  payload,
  request,
  stage,
  accountId,
  region,
  apiId,
  authorizer,
  connectedAt,
}) {
  return {
    body: payload,
    isBase64Encoded: false,
    requestContext: buildRequestContext({
      connectionId,
      eventType: 'MESSAGE',
      routeKey: route,
      request: request ?? {},
      stage,
      apiId,
      authorizer,
      connectedAt,
      messageId: crypto.randomUUID(),
    }),
  }
}

export function buildAuthorizerEvent({
  connectionId,
  request,
  stage,
  accountId,
  region,
  apiId,
}) {
  const { single: headers, multi: multiValueHeaders } = parseHeaders(
    request.rawHeaders,
  )
  const query = parseQuery(request.url ?? '')
  return {
    headers,
    methodArn: `arn:aws:execute-api:${region}:${accountId}:${apiId}/${stage}/$connect`,
    multiValueHeaders,
    ...(query
      ? {
          queryStringParameters: query.single,
          multiValueQueryStringParameters: query.multi,
        }
      : {}),
    requestContext: buildRequestContext({
      connectionId,
      eventType: 'CONNECT',
      routeKey: '$connect',
      request,
      stage,
      apiId,
    }),
    type: 'REQUEST',
  }
}
