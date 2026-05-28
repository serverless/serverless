// REST v1 AWS_PROXY response mapper.
//
// Thin wrapper around the shared Lambda-proxy response formatter.  REST v1 has
// no top-level `cookies` field on the response (that's an HTTP API v2 concept),
// so we invoke the shared core with cookies-handling disabled.

import { formatLambdaProxyResponse } from '../shared/lambda-proxy-response.js'

/**
 * Translate an AWS Lambda REST API v1 AWS_PROXY response to a Hapi response.
 *
 * @param {unknown} result       The value returned by the Lambda handler.
 * @param {import('@hapi/hapi').ResponseToolkit} h  Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function formatRestApiResponse(result, h) {
  return formatLambdaProxyResponse(result, h, {
    defaultContentType: 'application/json',
  })
}
