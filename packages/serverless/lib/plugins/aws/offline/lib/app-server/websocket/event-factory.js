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
 * with placeholder null-fields, and UUID requestIds.
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
}) {
  const now = Date.now()
  const host = request?.headers?.host ?? 'localhost'
  const userAgent = request?.headers?.['user-agent'] ?? ''
  const sourceIp = request?.socket?.remoteAddress ?? '127.0.0.1'
  return {
    apiId,
    connectedAt: now,
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
    messageId: null,
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
}) {
  const { single: headers, multi: multiValueHeaders } = parseHeaders(
    request.rawHeaders,
  )
  return {
    headers,
    multiValueHeaders,
    isBase64Encoded: false,
    requestContext: buildRequestContext({
      connectionId,
      eventType: 'DISCONNECT',
      routeKey: '$disconnect',
      request,
      stage,
      apiId,
    }),
  }
}

export function buildMessageEvent({
  connectionId,
  route,
  payload,
  stage,
  accountId,
  region,
  apiId,
}) {
  return {
    body: payload,
    isBase64Encoded: false,
    requestContext: buildRequestContext({
      connectionId,
      eventType: 'MESSAGE',
      routeKey: route,
      request: {},
      stage,
      apiId,
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
