/**
 * Lambda authorizer event factories — TOKEN and REQUEST shapes that the
 * authorizer Lambda receives. Mirrors AWS API Gateway's invocation payload.
 *
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-input.html
 */

import crypto from 'node:crypto'
import { buildRestIdentity } from '../shared/rest-identity.js'
import {
  PLACEHOLDER_API_ID,
  PLACEHOLDER_RESOURCE_ID,
  PLACEHOLDER_PROTOCOL,
} from '../shared/rest-request-context.js'

/**
 * @param {object} args
 * @param {object} [args.request]
 * @param {string} args.methodArn
 * @param {string} args.authorizationToken
 * @returns {{ type: 'TOKEN', authorizationToken: string, methodArn: string }}
 */
export function buildTokenEvent({ methodArn, authorizationToken }) {
  return {
    type: 'TOKEN',
    authorizationToken,
    methodArn,
  }
}

/**
 * Build a REQUEST authorizer event. Mirrors the REST API (v1) Lambda-proxy
 * event shape — minus the body fields — with `type: 'REQUEST'` and the
 * authorizer-specific `methodArn`. Real API Gateway REQUEST events carry no
 * `identitySource` (that is an HTTP API v2 field) and their `requestContext`
 * has no `authorizer` block, since the authorizer is the code running here.
 *
 * @param {object} args
 * @param {object} args.request            Hapi request.
 * @param {string} args.methodArn          Synthesized method ARN.
 * @param {string} args.resourcePath       APIGW resource template (e.g. `/users/{id}`).
 * @param {string} args.path               Top-level `event.path`, stage-stripped (e.g. `/users/42`).
 * @param {string} args.requestContextPath Full wire path including the stage prefix (e.g. `/dev/users/42`); becomes `requestContext.path`.
 * @param {string} args.httpMethod         Uppercased HTTP method.
 * @param {string} args.stage              API Gateway stage name.
 * @param {string} args.accountId          12-digit AWS account ID.
 * @returns {object}
 */
export function buildRequestEvent({
  request,
  methodArn,
  resourcePath,
  path,
  requestContextPath,
  httpMethod,
  stage,
  accountId,
}) {
  const { headers, multiValueHeaders } = readHeaders(request)
  const query = request.query ?? {}
  const params = request.params ?? {}

  const hasQuery = Object.keys(query).length > 0
  const hasParams = Object.keys(params).length > 0

  const sourceIp = request.info?.remoteAddress ?? '127.0.0.1'
  const userAgent = request.headers?.['user-agent'] ?? ''

  return {
    type: 'REQUEST',
    methodArn,
    resource: resourcePath,
    path,
    httpMethod,
    headers,
    multiValueHeaders,
    queryStringParameters: hasQuery ? { ...query } : null,
    multiValueQueryStringParameters: hasQuery
      ? Object.fromEntries(
          Object.entries(query).map(([k, v]) => [
            k,
            Array.isArray(v) ? v : [v],
          ]),
        )
      : null,
    pathParameters: hasParams ? { ...params } : null,
    stageVariables: null,
    requestContext: {
      accountId,
      apiId: PLACEHOLDER_API_ID,
      httpMethod,
      identity: buildRestIdentity({ sourceIp, userAgent }),
      path: requestContextPath,
      protocol: PLACEHOLDER_PROTOCOL,
      requestId: crypto.randomUUID(),
      resourceId: PLACEHOLDER_RESOURCE_ID,
      resourcePath,
      stage,
    },
  }
}

/**
 * Read headers from `request.raw.req.rawHeaders` (preserves casing). Falls
 * back to `request.headers` (Hapi-lowercased) when the raw socket array
 * is missing — typical for in-process unit tests.
 */
function readHeaders(request) {
  const rawHeaders = request?.raw?.req?.rawHeaders
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    const headers = {}
    const multiValueHeaders = {}
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      const name = rawHeaders[i]
      const value = rawHeaders[i + 1]
      headers[name] = value
      if (multiValueHeaders[name]) multiValueHeaders[name].push(value)
      else multiValueHeaders[name] = [value]
    }
    return { headers, multiValueHeaders }
  }
  const headers = { ...(request?.headers ?? {}) }
  const multiValueHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    multiValueHeaders[name] = Array.isArray(value) ? value : [value]
  }
  return { headers, multiValueHeaders }
}
