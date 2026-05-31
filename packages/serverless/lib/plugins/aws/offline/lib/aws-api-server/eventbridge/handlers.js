/**
 * Hapi route handler factory for the local EventBridge emulator.
 *
 * EventBridge speaks the AWS JSON 1.1 wire protocol: the action arrives in the
 * `X-Amz-Target` header as `AWSEvents.<Action>`, parameters arrive as a JSON
 * body, and responses are JSON with content type `application/x-amz-json-1.1`.
 *
 * The handler parses the request into `{ action, params }`, runs the operation
 * against the bus store via `runOp`, and serializes the result. An `EbOpError`
 * becomes the AWS `{ __type, message }` error envelope with its HTTP status;
 * any unexpected fault becomes a 500 in the same envelope shape so the SDK
 * surfaces a server error rather than a parse failure.
 */

import { runOp, EbOpError } from './ops.js'

const CONTENT_TYPE = 'application/x-amz-json-1.1'
const CODE_INTERNAL_ERROR = 'InternalFailure'

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
 * Extract the action name from the `X-Amz-Target` header (`AWSEvents.<Action>`).
 *
 * @param {object} request - Hapi request.
 * @returns {string}
 */
function actionOf(request) {
  const target =
    request.headers?.['x-amz-target'] ?? request.headers?.['X-Amz-Target'] ?? ''
  return String(target).split('.').pop()
}

/**
 * Creates a Hapi route handler that dispatches EventBridge JSON-RPC requests.
 *
 * @param {{
 *   store:    ReturnType<import('./bus-store.js').createBusStore>,
 *   registry: ReturnType<import('../../provisioner/registry.js').createRegistry>,
 *   deliver:  (busName: string, event: object) => Promise<void>,
 * }} options
 *
 * @returns {(request: object, h: object) => Promise<object>}
 *   A Hapi route handler `async (request, h) => response`.
 */
export function createEventBridgeHandlers({ store, registry, deliver }) {
  return async function eventBridgeHandler(request, h) {
    try {
      const action = actionOf(request)
      const params = payloadToObject(request.payload)
      const result = await runOp(action, params, { store, registry, deliver })
      return h.response(result).code(200).type(CONTENT_TYPE)
    } catch (error) {
      if (error instanceof EbOpError) {
        return h
          .response({ __type: error.awsCode, message: error.message })
          .code(error.httpStatus)
          .type(CONTENT_TYPE)
      }
      // An unexpected fault: respond with a 500 in the AWS error envelope.
      return h
        .response({ __type: CODE_INTERNAL_ERROR, message: error.message })
        .code(500)
        .type(CONTENT_TYPE)
    }
  }
}
