/**
 * SNS fan-out delivery for sls offline.
 *
 * Drives a published message out to every matching subscription on a topic.
 * The store is a pure model (it holds resolved `target` descriptors); this
 * module turns each target into a concrete dispatch:
 *
 *  - `lambda` → build the AWS SNS Lambda event and invoke the function
 *    (fire-and-forget, mirroring the SQS poller — a rejected invoke is logged,
 *    never surfaced to the publisher).
 *  - `sqs` → enqueue the SNS notification envelope (or the bare message when
 *    raw-message-delivery is on) into the local SQS queue store.
 *  - `unsupported` → a one-time debug note per protocol, then skip.
 *
 * Subscription filter policies are evaluated first; a non-matching subscription
 * is skipped. Delivery is synchronous fan-out on Publish (no poller / timer):
 * `deliver` returns once every invoke is enqueued and every SQS send is done.
 */

import { matchesFilterPolicy } from './filter-engine.js'

/**
 * Create a deliverer bound to a topic store, the Lambda facade lookup, and the
 * SQS queue store.
 *
 * @param {object} params
 * @param {ReturnType<import('./topic-store.js').createTopicStore>} params.store
 * @param {(functionKey: string) => { invoke(event: unknown): Promise<unknown> }} params.getLambdaFunction
 * @param {{ send: (url: string, payload: object) => unknown }} params.queueStore
 * @param {{ debug: Function, error: Function }} params.logger
 * @param {() => string} [params.now] - Injectable ISO-timestamp source (tests).
 * @returns {{ deliver: (topicArn: string, record: object) => Promise<void> }}
 */
export function createDeliverer({
  store,
  getLambdaFunction,
  queueStore,
  logger,
  now = () => new Date().toISOString(),
}) {
  // Track which unsupported protocols have already been logged so the debug
  // note fires once per protocol rather than once per skipped delivery.
  const warnedUnsupported = new Set()

  /**
   * Fan a published message out to every matching subscription on the topic.
   *
   * @param {string} topicArn
   * @param {object} record - `{ messageId, message, subject?, messageAttributes, messageStructure? }`
   * @returns {Promise<void>}
   */
  async function deliver(topicArn, record) {
    // For a `json` message structure the body is a protocol→message map, parsed
    // once here and selected per-subscription below.
    const structuredMessage =
      record.messageStructure === 'json'
        ? parseStructuredMessage(record.message)
        : null

    for (const sub of store.listSubscriptionsByTopic(topicArn)) {
      if (
        sub.filterPolicy != null &&
        !matchesFilterPolicy(sub.filterPolicy, {
          messageAttributes: record.messageAttributes,
          messageBody: record.message,
          scope: sub.filterPolicyScope,
        })
      ) {
        continue
      }

      // Resolve the message this subscriber receives. With a `json` structure,
      // pick the protocol-specific entry (falling back to `default`); when
      // neither is present, AWS requires `default` — here we skip gracefully.
      let message = record.message
      if (structuredMessage != null) {
        const selected = selectStructuredMessage(
          structuredMessage,
          sub.protocol,
        )
        if (selected === undefined) continue
        message = selected
      }

      switch (sub.target.kind) {
        case 'lambda':
          deliverToLambda(sub, topicArn, record, message)
          break
        case 'sqs':
          deliverToSqs(sub, topicArn, record, message)
          break
        default:
          if (!warnedUnsupported.has(sub.target.protocol)) {
            warnedUnsupported.add(sub.target.protocol)
            logger.debug(
              `SNS protocol "${sub.target.protocol}" is not delivered in offline; skipping.`,
            )
          }
      }
    }
  }

  /**
   * Build the AWS SNS Lambda event and invoke the target function. The invoke
   * is fire-and-forget: a rejection is logged but never propagated, so one
   * failing subscriber never blocks the others or faults the publisher.
   *
   * @param {object} sub
   * @param {string} topicArn
   * @param {object} record
   * @param {string} message - the message body resolved for this subscriber.
   * @returns {void}
   */
  function deliverToLambda(sub, topicArn, record, message) {
    const sns = {
      Type: 'Notification',
      MessageId: record.messageId,
      TopicArn: topicArn,
      Message: message,
      Timestamp: now(),
      SignatureVersion: '1',
      Signature: 'offline',
      SigningCertUrl: 'http://localhost/cert.pem',
      UnsubscribeUrl: 'http://localhost/?Action=Unsubscribe',
      MessageAttributes: toSnsEventAttributes(record.messageAttributes),
    }
    // AWS omits the Subject key entirely when the publish carried no Subject.
    if (record.subject !== undefined && record.subject !== null) {
      sns.Subject = record.subject
    }

    const event = {
      Records: [
        {
          EventSource: 'aws:sns',
          EventVersion: '1.0',
          EventSubscriptionArn: sub.arn,
          Sns: sns,
        },
      ],
    }

    Promise.resolve(
      getLambdaFunction(sub.target.functionKey).invoke(event),
    ).catch((err) => {
      logger.error(
        `SNS delivery to "${sub.target.functionKey}" failed: ${err.message}`,
      )
    })
  }

  /**
   * Enqueue the message into the target SQS queue. With raw-message-delivery the
   * bare message goes through verbatim with its attributes; otherwise the SNS
   * notification JSON envelope becomes the SQS body.
   *
   * @param {object} sub
   * @param {string} topicArn
   * @param {object} record
   * @param {string} message - the message body resolved for this subscriber.
   * @returns {void}
   */
  function deliverToSqs(sub, topicArn, record, message) {
    if (sub.rawMessageDelivery) {
      queueStore.send(sub.target.queueUrl, {
        body: message,
        messageAttributes: record.messageAttributes,
      })
      return
    }

    const envelope = {
      Type: 'Notification',
      MessageId: record.messageId,
      TopicArn: topicArn,
      Message: message,
      Timestamp: now(),
      SignatureVersion: '1',
      Signature: 'offline',
      SigningCertURL: 'http://localhost/cert.pem',
      UnsubscribeURL: 'http://localhost/?Action=Unsubscribe',
    }
    if (record.subject !== undefined && record.subject !== null) {
      envelope.Subject = record.subject
    }
    const eventAttributes = toSnsEventAttributes(record.messageAttributes)
    if (Object.keys(eventAttributes).length > 0) {
      envelope.MessageAttributes = eventAttributes
    }

    queueStore.send(sub.target.queueUrl, { body: JSON.stringify(envelope) })
  }

  return { deliver }
}

/**
 * Parse a `MessageStructure: 'json'` body into its protocol→message map. A body
 * that is not a JSON object yields an empty map, so every subscriber falls
 * through to the skip path rather than receiving the raw JSON string.
 *
 * @param {string} message
 * @returns {object}
 */
function parseStructuredMessage(message) {
  let parsed
  try {
    parsed = JSON.parse(message)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {}
  }
  return parsed
}

/**
 * Select the message a given protocol receives from a parsed `json` structure:
 * the protocol-specific entry when present, otherwise the `default` entry.
 * Returns `undefined` when neither exists (the subscriber is skipped).
 *
 * @param {object} structuredMessage
 * @param {string} protocol
 * @returns {string|undefined}
 */
function selectStructuredMessage(structuredMessage, protocol) {
  if (typeof structuredMessage[protocol] === 'string') {
    return structuredMessage[protocol]
  }
  if (typeof structuredMessage.default === 'string') {
    return structuredMessage.default
  }
  return undefined
}

/**
 * Convert the publish-time attribute map (`{ Name: { DataType, StringValue? |
 * BinaryValue? } }`) into the SNS notification / Lambda-event attribute shape
 * (`{ Name: { Type, Value } }`).
 *
 * @param {object} attributes
 * @returns {object}
 */
function toSnsEventAttributes(attributes = {}) {
  const result = {}
  for (const [name, attr] of Object.entries(attributes)) {
    result[name] = {
      Type: attr.DataType,
      Value: attr.StringValue ?? attr.BinaryValue,
    }
  }
  return result
}
