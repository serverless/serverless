/**
 * v2 Lambda authorizer REQUEST event factory for HTTP API authorizers.
 *
 * AWS HTTP API v2 only supports REQUEST-type Lambda authorizers (no TOKEN);
 * shape per https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html
 */

/**
 * @param {object} args
 * @param {object} args.request                Hapi request.
 * @param {string} args.routeArn               Synthesized v2 routeArn.
 * @param {string} args.routeKey               e.g. `GET /items/{id}`.
 * @param {string | null} args.authorizationToken  Pre-resolved identity value.
 * @param {string} args.stage
 * @param {string} args.accountId
 * @param {string} args.domainName
 * @param {string} args.requestId
 * @returns {object}
 */
export function buildV2RequestEvent({
  request,
  routeArn,
  routeKey,
  authorizationToken,
  stage,
  accountId,
  domainName,
  requestId,
}) {
  const headers = readHeadersLowercase(request)
  const query = request.query ?? {}
  const params = request.params ?? {}
  const hasQuery = Object.keys(query).length > 0
  const hasParams = Object.keys(params).length > 0

  return {
    version: '2.0',
    type: 'REQUEST',
    routeArn,
    routeKey,
    identitySource:
      typeof authorizationToken === 'string' && authorizationToken.length > 0
        ? [authorizationToken]
        : [],
    headers,
    queryStringParameters: hasQuery ? { ...query } : null,
    pathParameters: hasParams ? { ...params } : null,
    stageVariables: null,
    requestContext: {
      accountId,
      apiId: 'offline',
      domainName,
      domainPrefix: 'offline',
      http: {
        method: request.method.toUpperCase(),
        path: request.path,
        protocol: 'HTTP/1.1',
        sourceIp: request.info?.remoteAddress ?? '127.0.0.1',
        userAgent: headers['user-agent'] ?? '',
      },
      requestId,
      routeKey,
      stage,
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  }
}

/**
 * Read headers from the raw socket array (preserves casing) and lowercase
 * the keys. Falls back to `request.headers` for in-process tests.
 *
 * v2 represents headers as `{ name: stringValue }` — multi-value entries
 * are comma-joined per AWS. We preserve the rawHeaders order so duplicates
 * are joined left-to-right.
 */
function readHeadersLowercase(request) {
  const rawHeaders = request?.raw?.req?.rawHeaders
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    const out = {}
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      const name = rawHeaders[i].toLowerCase()
      const value = rawHeaders[i + 1]
      out[name] = out[name] === undefined ? value : `${out[name]},${value}`
    }
    return out
  }
  const out = {}
  for (const [k, v] of Object.entries(request?.headers ?? {})) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v
  }
  return out
}
