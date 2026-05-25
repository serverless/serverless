// REST v1 AWS_PROXY response mapper.
//
// Translates the value a Lambda handler returns into a Hapi response that
// mirrors what API Gateway REST APIs (v1) send to clients.  Handlers can
// return one of several shapes — a string, a plain object, or the canonical
// `{ statusCode, body, headers, multiValueHeaders, isBase64Encoded }` envelope
// — and real APIGW silently normalizes each of them.  We reproduce that
// behaviour here so local invocations match deployed behaviour byte-for-byte.
//
// Note: REST v1 has no top-level `cookies` field on the response (that's an
// HTTP API v2 concept).  Set-Cookie travels through `headers` /
// `multiValueHeaders` like any other header.

/**
 * Translate an AWS Lambda REST API v1 AWS_PROXY response to a Hapi response.
 *
 * Supported result shapes:
 *  - `null` / `undefined`                     → 200, empty body
 *  - `string`                                 → 200, text/plain
 *  - Plain object without `statusCode`        → 200, JSON-serialized, application/json
 *  - Shaped object `{ statusCode, body, headers?, multiValueHeaders?, isBase64Encoded? }`
 *
 * @param {unknown} result       The value returned by the Lambda handler.
 * @param {import('@hapi/hapi').ResponseToolkit} h  Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function formatRestApiResponse(result, h) {
  // null / undefined → empty 200
  if (result === null || result === undefined) {
    return h.response('').code(200)
  }

  // Plain string → 200 text/plain
  if (typeof result === 'string') {
    return h.response(result).code(200).type('text/plain')
  }

  // Object without statusCode → 200 application/json
  if (typeof result === 'object' && result.statusCode === undefined) {
    return h.response(JSON.stringify(result)).code(200).type('application/json')
  }

  // Shaped Lambda response
  const { statusCode, body, headers, multiValueHeaders, isBase64Encoded } =
    result

  // Guard: if body is present and not a string and not base64 binary, the
  // handler returned a non-stringified object. Real APIGW returns 502 in this
  // case rather than silently coercing the body.
  if (
    body !== undefined &&
    body !== null &&
    typeof body !== 'string' &&
    isBase64Encoded !== true
  ) {
    return h
      .response(
        JSON.stringify({
          message: 'Internal server error',
        }),
      )
      .code(502)
      .type('application/json')
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
  // values via `headers`, repeated values via `multiValueHeaders`.  Set-Cookie
  // rides through this same channel on REST v1 (no separate cookies field).
  if (multiValueHeaders) {
    for (const [name, values] of Object.entries(multiValueHeaders)) {
      if (!Array.isArray(values)) continue
      for (const value of values) {
        response.header(name, value, { append: true })
      }
    }
  }

  return response
}
