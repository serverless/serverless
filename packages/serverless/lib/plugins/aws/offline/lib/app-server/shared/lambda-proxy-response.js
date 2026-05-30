// Shared Lambda-proxy response formatter for REST API v1 and HTTP API v2.
//
// Translates the value a Lambda handler returns into a Hapi response that
// mirrors what API Gateway sends to clients.  Handlers can return one of
// several shapes — a string, a plain object, or the canonical
// `{ statusCode, body, headers, multiValueHeaders, isBase64Encoded }` envelope
// (plus `cookies` on HTTP API v2) — and real APIGW silently normalizes each of
// them.  We reproduce that behaviour here so local invocations match deployed
// behaviour byte-for-byte.
//
// Behavioural difference between v1 and v2:
//   - REST v1 has no top-level `cookies` field; Set-Cookie travels through
//     `headers` / `multiValueHeaders` like any other header.
//   - HTTP API v2 carries cookies on a dedicated top-level `cookies` array.
//     Pass `{ cookies: true }` to opt into that handling.

/**
 * Translate an AWS Lambda AWS_PROXY response to a Hapi response.
 *
 * Supported result shapes:
 *  - `null` / `undefined`                     → 200, empty body
 *  - `string`                                 → 200, text/plain
 *  - Plain object without `statusCode`        → 200, JSON-serialized, application/json
 *  - Shaped object `{ statusCode, body, headers?, multiValueHeaders?, cookies?, isBase64Encoded? }`
 *
 * @param {unknown} result       The value returned by the Lambda handler.
 * @param {import('@hapi/hapi').ResponseToolkit} h  Hapi response toolkit.
 * @param {object} [options]
 * @param {boolean} [options.cookies=false]  When true, also processes the
 *   `cookies` field on shaped responses (HTTP API v2 only). REST API v1
 *   responses carry Set-Cookie via headers / multiValueHeaders only.
 * @param {boolean} [options.requireStatusCode=false]  When true, an object
 *   result that omits `statusCode` is treated as a malformed response and
 *   yields a 502 envelope. ALB requires `statusCode` on every Lambda response
 *   document and returns 502 Bad Gateway when it is missing. API Gateway
 *   proxy integrations (REST v1 / HTTP API v2) instead normalize a bare object
 *   without `statusCode` into a 200 JSON response, so they leave this false.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function formatLambdaProxyResponse(
  result,
  h,
  {
    cookies = false,
    payloadV2 = false,
    defaultContentType,
    requireStatusCode = false,
  } = {},
) {
  // null / undefined → empty 200
  if (result === null || result === undefined) {
    return h.response('').code(200)
  }

  // Plain string → 200. HTTP API v2 emits application/json; REST v1 and ALB
  // keep text/plain.
  if (typeof result === 'string') {
    return h
      .response(result)
      .code(200)
      .type(payloadV2 ? 'application/json' : 'text/plain')
  }

  // Object without statusCode. API Gateway proxy integrations normalize this
  // into a 200 JSON response. ALB requires `statusCode` on the response
  // document and returns 502 Bad Gateway when it is absent, so callers that set
  // requireStatusCode get the AWS error envelope instead.
  if (typeof result === 'object' && result.statusCode === undefined) {
    if (requireStatusCode) {
      return badGatewayResponse(h)
    }
    return h.response(JSON.stringify(result)).code(200).type('application/json')
  }

  // Shaped Lambda response
  const {
    statusCode,
    body,
    headers,
    multiValueHeaders,
    cookies: responseCookies,
    isBase64Encoded,
  } = result

  // Guard: a present, non-string body means the handler returned a
  // non-stringified value. Real APIGW returns 502 in this case rather than
  // silently coercing the body — including when isBase64Encoded is true, since
  // a base64 body must still be delivered as a string.
  if (body !== undefined && body !== null && typeof body !== 'string') {
    return badGatewayResponse(h)
  }

  let responseBody = body ?? ''

  if (isBase64Encoded === true && typeof responseBody === 'string') {
    responseBody = Buffer.from(responseBody, 'base64')
  }

  const response = h.response(responseBody).code(statusCode)

  if (headers) {
    for (const [name, value] of Object.entries(headers)) {
      response.header(name, value)
    }
  }

  // multiValueHeaders carries one or more values per header name and is
  // appended after `headers` so handlers can mix the two shapes — single
  // values via `headers`, repeated values via `multiValueHeaders`.  On REST v1
  // Set-Cookie rides through this same channel; on HTTP API v2 it has its own
  // dedicated `cookies` array handled below.
  //
  // HTTP API v2 response payloads have no `multiValueHeaders` field — they
  // carry only single-value `headers` (with repeats comma-joined) plus
  // `cookies`. API Gateway silently ignores any `multiValueHeaders` a v2
  // handler returns, so we skip this channel entirely under payloadV2.
  if (multiValueHeaders && !payloadV2) {
    for (const [name, values] of Object.entries(multiValueHeaders)) {
      if (!Array.isArray(values)) continue
      for (const value of values) {
        response.header(name, value, { append: true })
      }
    }
  }

  // HTTP API v2 only: emit each entry of `cookies` as a Set-Cookie header.
  if (cookies && Array.isArray(responseCookies)) {
    for (const cookie of responseCookies) {
      response.header('set-cookie', cookie, { append: true })
    }
  }

  // Default the Content-Type (when a caller opts in via defaultContentType)
  // only if the handler set none and the body is non-empty. Real APIGW
  // applies this default without overriding a handler-set value.
  if (defaultContentType) {
    const hasContentType = [
      ...Object.keys(headers ?? {}),
      ...Object.keys(multiValueHeaders ?? {}),
    ].some((name) => name.toLowerCase() === 'content-type')
    const hasBody = responseBody !== '' && responseBody !== undefined
    if (!hasContentType && hasBody) {
      response.type(defaultContentType)
    }
  }

  return response
}

/**
 * Build the AWS 502 Bad Gateway envelope returned for a malformed Lambda
 * response (a non-string body, or — on ALB — a response document missing
 * `statusCode`).
 *
 * @param {import('@hapi/hapi').ResponseToolkit} h  Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
function badGatewayResponse(h) {
  return h
    .response(
      JSON.stringify({
        message: 'Internal server error',
      }),
    )
    .code(502)
    .type('application/json')
}
