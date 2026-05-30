/**
 * Hapi route handler factory for SQS, dispatching across both AWS wire
 * protocols.
 *
 * SQS speaks two protocols on the same endpoint:
 *   - JSON-RPC (AWS JSON 1.0): used by the AWS SDK v3. The action arrives in the
 *     `X-Amz-Target` header; the body is JSON; responses are JSON.
 *   - Query protocol: used by the AWS CLI and older SDKs. The action and all
 *     parameters arrive as a form-urlencoded body; responses are XML.
 *
 * The handler picks the adapter (presence of `X-Amz-Target` ⇒ JSON, else
 * query), parses the request into a protocol-agnostic `{ action, params }`,
 * runs the operation against the queue store via `runOp`, and serializes the
 * result (or any `SqsOpError`) back through the same adapter. Unexpected errors
 * become a 500 in the active protocol's error shape.
 */

import { runOp, SqsOpError } from './ops.js'
import * as jsonProtocol from './protocol-json.js'
import * as queryProtocol from './protocol-query.js'

const CODE_INTERNAL_ERROR = 'InternalFailure'

/**
 * Choose the wire adapter for a request. SDK v3 sends `X-Amz-Target`; the CLI /
 * older SDKs send a form-urlencoded body without it.
 *
 * @param {object} request - Hapi request.
 * @returns {typeof import('./protocol-json.js')} The adapter module.
 */
function selectAdapter(request) {
  const target =
    request.headers?.['x-amz-target'] ?? request.headers?.['X-Amz-Target']
  return target ? jsonProtocol : queryProtocol
}

/**
 * Serialize a result through the chosen adapter. The query adapter needs the
 * action name (to name the XML envelope); the JSON adapter does not.
 *
 * @param {object} adapter - The selected protocol adapter.
 * @param {string} action  - The SQS action name.
 * @param {object} result  - The plain result object from `runOp`.
 * @param {object} h        - Hapi response toolkit.
 * @returns {object} Hapi response.
 */
function serializeResult(adapter, action, result, h) {
  return adapter === queryProtocol
    ? adapter.serialize(action, result, h)
    : adapter.serialize(result, h)
}

/**
 * Creates a Hapi route handler that dispatches SQS requests across both wire
 * protocols.
 *
 * @param {{
 *   store:    ReturnType<import('./queue-store.js').createQueueStore>,
 *   registry: ReturnType<import('../../provisioner/registry.js').createRegistry>,
 * }} options
 *
 * @returns {(request: object, h: object) => Promise<object>}
 *   A Hapi route handler `async (request, h) => response`.
 */
export function createSqsHandlers({ store, registry }) {
  return async function sqsHandler(request, h) {
    const adapter = selectAdapter(request)

    let action
    try {
      const parsed = adapter.parse(request)
      action = parsed.action
      const result = runOp(action, parsed.params, { store, registry })
      return serializeResult(adapter, action, result, h)
    } catch (error) {
      if (error instanceof SqsOpError) {
        return adapter.serializeError(error, h)
      }
      // An unexpected fault: respond in the active protocol's error shape with
      // a 500 so the SDK surfaces a server error rather than a parse failure.
      return adapter.serializeError(
        new SqsOpError(CODE_INTERNAL_ERROR, 500, error.message),
        h,
      )
    }
  }
}
