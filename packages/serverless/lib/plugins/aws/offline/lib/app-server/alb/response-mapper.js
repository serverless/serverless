// ALB Lambda response mapper.
//
// Thin wrapper around the shared Lambda-proxy response formatter.  ALB has no
// top-level `cookies` field on the response (that's an HTTP API v2 concept),
// so we invoke the shared core with cookies-handling disabled — its default
// behaviour is exactly what ALB needs.
//
// ALB additionally allows handlers to return a `statusDescription` string
// ("200 OK") alongside `statusCode`.  We deliberately do not honour it: it is
// a wire-level concern that the real ALB→client HTTP/1.1 status line carries,
// Hapi reconstructs the status line from the numeric code on its own, and no
// offline consumer downstream of this mapper reads `statusDescription`.

import { formatLambdaProxyResponse } from '../shared/lambda-proxy-response.js'

/**
 * Translate an AWS Lambda ALB response to a Hapi response.
 *
 * @param {unknown} result       The value returned by the Lambda handler.
 * @param {import('@hapi/hapi').ResponseToolkit} h  Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function formatAlbResponse(result, h) {
  return formatLambdaProxyResponse(result, h)
}
