/**
 * JSON-RPC (AWS JSON 1.0) wire adapter for the local SQS emulator.
 *
 * This is the protocol the AWS SDK v3 clients use: the action arrives in the
 * `X-Amz-Target` header as `AmazonSQS.<Action>`, parameters arrive as a JSON
 * body, and the response is plain JSON with content type
 * `application/x-amz-json-1.0`.
 *
 * The adapter is intentionally tiny: it translates between the wire and the
 * protocol-agnostic `{ action, params }` / result-object contract that
 * `ops.runOp` speaks. It has no knowledge of any specific action.
 */

const CONTENT_TYPE = 'application/x-amz-json-1.0'

/**
 * Coerce a Hapi request payload (already-parsed object, raw string, or Buffer)
 * into a plain params object. Hapi may hand us any of these depending on the
 * server's payload-parsing configuration, so handle all three.
 *
 * @param {object|string|Buffer|undefined} payload
 * @returns {object}
 */
function payloadToObject(payload) {
  if (payload === undefined || payload === null || payload === '') return {}
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    const text = payload.toString().trim()
    if (text.length === 0) return {}
    return JSON.parse(text)
  }
  return payload
}

/**
 * Parse a JSON-RPC SQS request into `{ action, params }`.
 *
 * @param {{ headers: object, payload?: object|string|Buffer }} request
 * @returns {{ action: string, params: object }}
 */
export function parse(request) {
  const target =
    request.headers?.['x-amz-target'] ?? request.headers?.['X-Amz-Target'] ?? ''
  const action = String(target).split('.').pop()
  return { action, params: payloadToObject(request.payload) }
}

/**
 * Serialize an operation result into a 200 JSON response.
 *
 * @param {object} result - The plain result object from `runOp`.
 * @param {object} h      - Hapi response toolkit.
 * @returns {object} Hapi response.
 */
export function serialize(result, h) {
  return h.response(result).code(200).type(CONTENT_TYPE)
}

/**
 * Serialize an `SqsOpError` into the AWS JSON error envelope.
 *
 * @param {{ awsCode: string, httpStatus: number, message: string }} opError
 * @param {object} h - Hapi response toolkit.
 * @returns {object} Hapi response.
 */
export function serializeError(opError, h) {
  return h
    .response({ __type: opError.awsCode, Message: opError.message })
    .code(opError.httpStatus)
    .type(CONTENT_TYPE)
}
