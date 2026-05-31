/**
 * Hapi route handler factory for SNS.
 *
 * Unlike SQS, SNS speaks a single wire protocol against this emulator: the AWS
 * query protocol. The action and all parameters arrive as a form-urlencoded
 * body (`Action=Publish&TopicArn=…`) — there is no `X-Amz-Target` JSON path —
 * and responses are AWS XML.
 *
 * The handler parses the request into a protocol-agnostic `{ action, params }`,
 * runs the operation against the topic store via `runOp` (which fans a Publish
 * out through the supplied `deliver`), and serializes the result (or any
 * `SnsOpError`) back to XML. Unexpected faults become a 500 Receiver error.
 */

import { runOp, SnsOpError } from './ops.js'
import * as queryProtocol from './protocol-query.js'

const CODE_INTERNAL_ERROR = 'InternalFailure'

/**
 * Creates a Hapi route handler that dispatches SNS query-protocol requests.
 *
 * @param {{
 *   store:    ReturnType<import('./topic-store.js').createTopicStore>,
 *   registry: ReturnType<import('../../provisioner/registry.js').createRegistry>,
 *   deliver:  (topicArn: string, record: object) => Promise<void>,
 * }} options
 *
 * @returns {(request: object, h: object) => Promise<object>}
 *   A Hapi route handler `async (request, h) => response`.
 */
export function createSnsHandlers({ store, registry, deliver }) {
  return async function snsHandler(request, h) {
    let action
    try {
      const parsed = queryProtocol.parse(request)
      action = parsed.action
      const result = await runOp(action, parsed.params, {
        store,
        registry,
        deliver,
      })
      return queryProtocol.serialize(action, result, h)
    } catch (error) {
      if (error instanceof SnsOpError) {
        return queryProtocol.serializeError(error, h)
      }
      // An unexpected fault: respond with a 500 Receiver error so the SDK
      // surfaces a server error rather than a parse failure.
      return queryProtocol.serializeError(
        new SnsOpError(CODE_INTERNAL_ERROR, 500, error.message),
        h,
      )
    }
  }
}
