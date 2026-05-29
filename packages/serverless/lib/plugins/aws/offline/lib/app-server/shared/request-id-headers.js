/**
 * Attach the API Gateway request-id response headers AWS emits.
 *
 * REST API (v1) responses carry `x-amzn-RequestId` (the request id) and
 * `x-amz-apigw-id` (the extended request id). HTTP API (v2) responses carry a
 * single `apigw-requestid` (the request id). Values mirror the event's
 * `requestContext` for the proxy paths so a client correlating request and
 * response sees matching ids.
 *
 * @param {import('@hapi/hapi').ResponseObject} response
 * @param {'rest' | 'http'} apiType
 * @param {{ requestId?: string, extendedRequestId?: string }} ids
 * @returns {import('@hapi/hapi').ResponseObject} the same response (chainable)
 */
export function applyRequestIdHeaders(response, apiType, ids = {}) {
  const { requestId, extendedRequestId } = ids
  if (apiType === 'http') {
    if (requestId) response.header('apigw-requestid', requestId)
    return response
  }
  if (requestId) response.header('x-amzn-RequestId', requestId)
  if (extendedRequestId) response.header('x-amz-apigw-id', extendedRequestId)
  return response
}
