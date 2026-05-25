/**
 * Lambda authorizer event factories — TOKEN and REQUEST shapes that the
 * authorizer Lambda receives. Mirrors AWS API Gateway's invocation payload.
 *
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-input.html
 */

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
 * Build a REQUEST authorizer event. Shape is similar to the Lambda-proxy
 * event but with `type: 'REQUEST'` and `identitySource: [<resolved>]`.
 *
 * @param {object} args
 * @param {object} args.request
 * @param {string} args.methodArn
 * @param {string | null} args.authorizationToken  Pre-resolved identity value.
 * @returns {object}
 */
export function buildRequestEvent({ request, methodArn, authorizationToken }) {
  const { headers, multiValueHeaders } = readHeaders(request)
  const query = request.query ?? {}
  const params = request.params ?? {}

  const hasQuery = Object.keys(query).length > 0
  const hasParams = Object.keys(params).length > 0

  return {
    type: 'REQUEST',
    methodArn,
    identitySource:
      typeof authorizationToken === 'string' && authorizationToken.length > 0
        ? [authorizationToken]
        : [],
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
