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
   * @param {object} record - `{ messageId, message, subject?, messageAttributes }`
   * @returns {Promise<void>}
   */
  async function deliver(topicArn, record) {
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

      switch (sub.target.kind) {
        case 'lambda':
          deliverToLambda(sub, topicArn, record)
          break
        case 'sqs':
          deliverToSqs(sub, topicArn, record)
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
   * @returns {void}
   */
  function deliverToLambda(sub, topicArn, record) {
    const sns = {
      Type: 'Notification',
      MessageId: record.messageId,
      TopicArn: topicArn,
      Message: record.message,
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
   * @returns {void}
   */
  function deliverToSqs(sub, topicArn, record) {
    if (sub.rawMessageDelivery) {
      queueStore.send(sub.target.queueUrl, {
        body: record.message,
        messageAttributes: record.messageAttributes,
      })
      return
    }

    const envelope = {
      Type: 'Notification',
      MessageId: record.messageId,
      TopicArn: topicArn,
      Message: record.message,
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
