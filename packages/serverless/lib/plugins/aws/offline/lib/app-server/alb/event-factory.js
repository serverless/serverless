/**
 * ALB (Application Load Balancer) Lambda-target event factory for offline.
 *
 * Transforms an incoming Hapi request into the JSON payload that AWS Lambda
 * receives when a function is invoked via an ALB target group. The shape
 * differs from APIGW:
 *  - `requestContext.elb.targetGroupArn` instead of `requestContext.apiId`.
 *  - No `pathParameters` (ALB matches literal paths; no template support).
 *  - `body` is always present (empty string for no body).
 *  - Both single-value AND multi-value header / query variants are emitted
 *    (real AWS emits only one set based on the target group's
 *    `multi_value_headers.enabled` flag; we accept this documented
 *    simplification).
 *
 * @see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html
 */

/**
 * @param {object} args
 * @param {object} args.request           Hapi request.
 * @param {string} args.targetGroupArn    Synthesized ALB target-group ARN.
 * @returns {object}                       ALB Lambda-target event JSON.
 */
export function buildAlbEvent({ request, targetGroupArn }) {
  const httpMethod = request.method.toUpperCase()
  const { headers, multiValueHeaders } = readHeaders(request)
  const { queryStringParameters, multiValueQueryStringParameters } =
    readQuery(request)
  const { body, isBase64Encoded } = readBody(request)

  return {
    body,
    headers,
    httpMethod,
    isBase64Encoded,
    multiValueHeaders,
    multiValueQueryStringParameters,
    path: request.path,
    queryStringParameters,
    requestContext: {
      elb: { targetGroupArn },
    },
  }
}

/**
 * Read headers from Node's raw socket array (preserves duplicates) and
 * collapse to both single-value (last-write-wins per key, lowercased) and
 * multi-value (array of all values, lowercased keys) shapes.
 */
function readHeaders(request) {
  const rawHeaders = request?.raw?.req?.rawHeaders
  if (Array.isArray(rawHeaders) && rawHeaders.length > 0) {
    const single = {}
    const multi = {}
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      const name = rawHeaders[i].toLowerCase()
      const value = rawHeaders[i + 1]
      single[name] = value
      if (multi[name]) multi[name].push(value)
      else multi[name] = [value]
    }
    return { headers: single, multiValueHeaders: multi }
  }
  // Fallback for in-process tests without raw socket.
  const single = {}
  const multi = {}
  for (const [k, v] of Object.entries(request?.headers ?? {})) {
    const name = k.toLowerCase()
    if (Array.isArray(v)) {
      single[name] = v.join(',')
      multi[name] = [...v]
    } else {
      single[name] = v
      multi[name] = [v]
    }
  }
  return { headers: single, multiValueHeaders: multi }
}

/**
 * Read query parameters from `request.url.searchParams` (a WHATWG URL). Both
 * the single-value (last-write-wins per key) and multi-value (array of all
 * values) maps are produced. Returns `null` for both fields when no query
 * is present (matches real ALB).
 */
function readQuery(request) {
  const url = request?.url
  if (!url || !url.search) {
    return {
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
    }
  }
  const single = {}
  const multi = {}
  for (const [k, v] of url.searchParams.entries()) {
    single[k] = v
    if (multi[k]) multi[k].push(v)
    else multi[k] = [v]
  }
  return {
    queryStringParameters: single,
    multiValueQueryStringParameters: multi,
  }
}

/**
 * Read the request body. Always returns a string body (empty when absent).
 * Buffer payloads → base64-encoded with `isBase64Encoded: true`. Strings
 * pass through; objects are JSON-stringified.
 */
function readBody(request) {
  const payload = request?.payload
  if (payload === undefined || payload === null) {
    return { body: '', isBase64Encoded: false }
  }
  if (Buffer.isBuffer(payload)) {
    return { body: payload.toString('base64'), isBase64Encoded: true }
  }
  if (typeof payload === 'string') {
    return { body: payload, isBase64Encoded: false }
  }
  return { body: JSON.stringify(payload), isBase64Encoded: false }
}
