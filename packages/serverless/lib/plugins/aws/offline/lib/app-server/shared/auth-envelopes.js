/**
 * AWS API Gateway rejection-response envelopes shared by every auth scheme.
 *
 * Mirrors the exact shape real APIGW emits on auth failures so handlers and
 * clients see byte-identical responses to deployed behavior:
 *   - 401 Unauthorized → `{"message":"Unauthorized"}`,
 *     `x-amzn-ErrorType: UnauthorizedException`, `application/json`.
 *   - 403 Forbidden → `{"message":"Forbidden"}`,
 *     `x-amzn-ErrorType: ForbiddenException`, `application/json`.
 *
 * Both call `.takeover()` so the rejected request bypasses the route
 * handler entirely — required by Hapi's auth-scheme contract when an
 * authentication strategy short-circuits a request.
 */

/**
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function unauthorized(h) {
  return h
    .response({ message: 'Unauthorized' })
    .code(401)
    .type('application/json')
    .header('x-amzn-ErrorType', 'UnauthorizedException')
    .takeover()
}

/**
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function forbidden(h) {
  return h
    .response({ message: 'Forbidden' })
    .code(403)
    .type('application/json')
    .header('x-amzn-ErrorType', 'ForbiddenException')
    .takeover()
}
