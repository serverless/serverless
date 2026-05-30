/**
 * Protocol-agnostic SQS operation set.
 *
 * `runOp(action, params, { store, registry })` executes one SQS action against
 * the in-memory queue store and returns a plain result object using AWS field
 * names (e.g. `MessageId`, `MD5OfMessageBody`). On failure it throws an
 * `SqsOpError` carrying the AWS error code, HTTP status, and message — the wire
 * adapters (JSON / query) turn that into the appropriate error envelope.
 *
 * This layer knows nothing about HTTP or wire formats: both protocol adapters
 * normalise their input into the same `params` shape (AWS PascalCase keys) and
 * call into here.
 */

import { allSqsQueues } from '../../provisioner/registry.js'
import { queueUrlFor } from '../../provisioner/arn-synth.js'
import { md5, md5OfMessageAttributes } from './md5.js'

/** AWS error codes used across the operation set. */
const CODE_NON_EXISTENT_QUEUE = 'AWS.SimpleQueueService.NonExistentQueue'
const CODE_INVALID_PARAMETER = 'AWS.SimpleQueueService.InvalidParameterValue'
const CODE_UNKNOWN_OPERATION = 'AWS.SimpleQueueService.UnknownOperation'
const CODE_MISSING_PARAMETER = 'AWS.SimpleQueueService.MissingParameter'

/**
 * A tagged operation error. Carries the AWS error code, the HTTP status the
 * wire layer should respond with, and a human-readable message.
 */
export class SqsOpError extends Error {
  /**
   * @param {string} awsCode    - AWS error code (e.g. `'AWS.SimpleQueueService.NonExistentQueue'`).
   * @param {number} httpStatus - HTTP status to respond with.
   * @param {string} message    - Human-readable detail.
   */
  constructor(awsCode, httpStatus, message) {
    super(message)
    this.name = 'SqsOpError'
    this.awsCode = awsCode
    this.httpStatus = httpStatus
  }
}

/**
 * Throw a `NonExistentQueue` error.
 *
 * @param {string} url
 * @returns {never}
 */
function throwNonExistentQueue(url) {
  throw new SqsOpError(
    CODE_NON_EXISTENT_QUEUE,
    400,
    `The specified queue does not exist: ${url}`,
  )
}

/**
 * Resolve and validate a queue URL. The URL is valid when it is registered in
 * the resource registry OR already present in the store (covers runtime
 * `CreateQueue`). Unknown URLs throw `NonExistentQueue`.
 *
 * @param {string} url
 * @param {object} ctx
 * @returns {string} the validated url
 */
function resolveQueueUrl(url, { store, registry }) {
  if (!url) {
    throw new SqsOpError(
      CODE_MISSING_PARAMETER,
      400,
      'The request must contain the parameter QueueUrl.',
    )
  }

  for (const queue of allSqsQueues(registry)) {
    if (queue.url === url) return url
  }

  // Fall back to the store: queues created at runtime live there but not in
  // the registry. `size` returns 0 for a never-seen url and a real count for a
  // known one, but cannot distinguish empty-known from unknown. `listQueues`
  // enumerates the store's keys, so use it as the existence check.
  if (store.listQueues().includes(url)) return url

  return throwNonExistentQueue(url)
}

/**
 * Map a single message-store record to the AWS ReceiveMessage message shape.
 *
 * @param {object} record - A store record (see queue-store `toRecord`).
 * @returns {object}
 */
function toAwsMessage(record) {
  const message = {
    MessageId: record.messageId,
    ReceiptHandle: record.receiptHandle,
    Body: record.body,
    MD5OfBody: md5(record.body),
  }

  const attributesMd5 = md5OfMessageAttributes(record.messageAttributes)
  if (attributesMd5 !== undefined) {
    message.MD5OfMessageAttributes = attributesMd5
    message.MessageAttributes = record.messageAttributes
  }

  if (record.systemAttributes && Object.keys(record.systemAttributes).length) {
    message.Attributes = record.systemAttributes
  }

  return message
}

/**
 * Build the per-message send payload accepted by `store.send`.
 *
 * @param {object} entry - `{ MessageBody, MessageAttributes?, DelaySeconds?, MessageGroupId?, MessageDeduplicationId? }`
 * @returns {object}
 */
function toSendOptions(entry) {
  const options = {
    body: entry.MessageBody,
    messageAttributes: entry.MessageAttributes ?? {},
  }
  if (entry.DelaySeconds !== undefined) {
    options.delaySeconds = Number(entry.DelaySeconds)
  }
  if (entry.MessageGroupId !== undefined) {
    options.groupId = entry.MessageGroupId
  }
  if (entry.MessageDeduplicationId !== undefined) {
    options.dedupId = entry.MessageDeduplicationId
  }
  return options
}

/**
 * Build the AWS SendMessage acknowledgement for an enqueued message.
 *
 * @param {object} entry - The send entry (carries MessageBody / MessageAttributes).
 * @param {{ messageId: string, sequenceNumber?: string }} sent - store.send result.
 * @returns {object}
 */
function toSendResult(entry, sent) {
  const result = {
    MD5OfMessageBody: md5(entry.MessageBody),
    MessageId: sent.messageId,
  }
  const attributesMd5 = md5OfMessageAttributes(entry.MessageAttributes)
  if (attributesMd5 !== undefined) {
    result.MD5OfMessageAttributes = attributesMd5
  }
  if (sent.sequenceNumber !== undefined) {
    result.SequenceNumber = sent.sequenceNumber
  }
  return result
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function sendMessage(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  if (params.MessageBody === undefined || params.MessageBody === null) {
    throw new SqsOpError(
      CODE_INVALID_PARAMETER,
      400,
      'The request must contain the parameter MessageBody.',
    )
  }

  const sent = ctx.store.send(url, toSendOptions(params))
  return toSendResult(params, sent)
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function sendMessageBatch(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  const entries = params.Entries ?? []

  const Successful = []
  const Failed = []

  for (const entry of entries) {
    if (entry.MessageBody === undefined || entry.MessageBody === null) {
      Failed.push({
        Id: entry.Id,
        SenderFault: true,
        Code: 'MissingParameter',
        Message: 'The request must contain the parameter MessageBody.',
      })
      continue
    }
    const sent = ctx.store.send(url, toSendOptions(entry))
    Successful.push({ Id: entry.Id, ...toSendResult(entry, sent) })
  }

  return { Successful, Failed }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function receiveMessage(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  const requested = params.MaxNumberOfMessages ?? 1
  const max = Math.min(Math.max(1, Number(requested)), 10)

  const options = { max }
  if (params.VisibilityTimeout !== undefined) {
    options.visibilityTimeout = Number(params.VisibilityTimeout)
  }

  const records = ctx.store.receive(url, options)
  if (records.length === 0) return {}

  return { Messages: records.map(toAwsMessage) }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function deleteMessage(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  ctx.store.deleteMessage(url, params.ReceiptHandle)
  return {}
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function deleteMessageBatch(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  const entries = params.Entries ?? []

  const Successful = []
  const Failed = []

  for (const entry of entries) {
    if (!entry.ReceiptHandle) {
      Failed.push({
        Id: entry.Id,
        SenderFault: true,
        Code: 'MissingParameter',
        Message: 'The request must contain the parameter ReceiptHandle.',
      })
      continue
    }
    ctx.store.deleteMessage(url, entry.ReceiptHandle)
    Successful.push({ Id: entry.Id })
  }

  return { Successful, Failed }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function changeMessageVisibility(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  ctx.store.changeMessageVisibility(
    url,
    params.ReceiptHandle,
    Number(params.VisibilityTimeout ?? 0),
  )
  return {}
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function changeMessageVisibilityBatch(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  const entries = params.Entries ?? []

  const Successful = []
  const Failed = []

  for (const entry of entries) {
    if (!entry.ReceiptHandle) {
      Failed.push({
        Id: entry.Id,
        SenderFault: true,
        Code: 'MissingParameter',
        Message: 'The request must contain the parameter ReceiptHandle.',
      })
      continue
    }
    ctx.store.changeMessageVisibility(
      url,
      entry.ReceiptHandle,
      Number(entry.VisibilityTimeout ?? 0),
    )
    Successful.push({ Id: entry.Id })
  }

  return { Successful, Failed }
}

/**
 * Map the AWS attribute-name set (`Attributes` map) onto the store's config
 * field names.
 *
 * @param {object} attributes - AWS PascalCase attribute map.
 * @returns {object} store config patch
 */
function toStoreAttributes(attributes = {}) {
  const patch = {}
  if (attributes.VisibilityTimeout !== undefined) {
    patch.visibilityTimeout = Number(attributes.VisibilityTimeout)
  }
  if (attributes.DelaySeconds !== undefined) {
    patch.delaySeconds = Number(attributes.DelaySeconds)
  }
  if (attributes.MessageRetentionPeriod !== undefined) {
    patch.messageRetentionPeriod = Number(attributes.MessageRetentionPeriod)
  }
  if (attributes.ReceiveMessageWaitTimeSeconds !== undefined) {
    patch.receiveWaitTime = Number(attributes.ReceiveMessageWaitTimeSeconds)
  }
  if (attributes.ContentBasedDeduplication !== undefined) {
    patch.contentBasedDedup =
      String(attributes.ContentBasedDeduplication).toLowerCase() === 'true'
  }
  return patch
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function getQueueAttributes(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  const names = params.AttributeNames
  return { Attributes: ctx.store.getQueueAttributes(url, names) }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function setQueueAttributes(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  ctx.store.setQueueAttributes(url, toStoreAttributes(params.Attributes))
  return {}
}

/**
 * Resolve a queue url by name from the registry first, then the store.
 *
 * @param {string} name
 * @param {object} ctx
 * @returns {string | undefined}
 */
function findUrlByName(name, { store, registry }) {
  for (const queue of allSqsQueues(registry)) {
    if (queue.name === name) return queue.url
  }
  return store.getQueueUrl(name)
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function getQueueUrl(params, ctx) {
  const url = findUrlByName(params.QueueName, ctx)
  if (!url) {
    throw new SqsOpError(
      CODE_NON_EXISTENT_QUEUE,
      400,
      `The specified queue does not exist: ${params.QueueName}`,
    )
  }
  return { QueueUrl: url }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function createQueue(params, ctx) {
  const name = params.QueueName
  if (!name) {
    throw new SqsOpError(
      CODE_MISSING_PARAMETER,
      400,
      'The request must contain the parameter QueueName.',
    )
  }

  // Idempotent: an existing queue of the same name returns its url unchanged.
  const existing = findUrlByName(name, ctx)
  if (existing) return { QueueUrl: existing }

  const url = queueUrlFor(name)
  ctx.store.ensureQueue(url, toStoreAttributes(params.Attributes))
  return { QueueUrl: url }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function deleteQueue(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  ctx.store.deleteQueue(url)
  return {}
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function listQueues(params, ctx) {
  // AWS filters by queue-name prefix. The store keys are urls whose final
  // segment is the queue name, so translate the prefix to a url filter.
  const urls = ctx.store.listQueues()
  const prefix = params.QueueNamePrefix
  const filtered = prefix
    ? urls.filter((url) => url.split('/').pop().startsWith(prefix))
    : urls
  return { QueueUrls: filtered }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function purgeQueue(params, ctx) {
  const url = resolveQueueUrl(params.QueueUrl, ctx)
  ctx.store.purgeQueue(url)
  return {}
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Map of supported action name → handler. */
const HANDLERS = {
  SendMessage: sendMessage,
  SendMessageBatch: sendMessageBatch,
  ReceiveMessage: receiveMessage,
  DeleteMessage: deleteMessage,
  DeleteMessageBatch: deleteMessageBatch,
  ChangeMessageVisibility: changeMessageVisibility,
  ChangeMessageVisibilityBatch: changeMessageVisibilityBatch,
  GetQueueAttributes: getQueueAttributes,
  SetQueueAttributes: setQueueAttributes,
  GetQueueUrl: getQueueUrl,
  CreateQueue: createQueue,
  DeleteQueue: deleteQueue,
  ListQueues: listQueues,
  PurgeQueue: purgeQueue,
}

/**
 * Run one SQS operation.
 *
 * @param {string} action - The SQS action name (e.g. `'SendMessage'`).
 * @param {object} params - AWS PascalCase parameters.
 * @param {{ store: object, registry: object }} ctx
 * @returns {object} A plain result object using AWS field names.
 * @throws {SqsOpError} On any operation error (validation, missing queue, …).
 */
export function runOp(action, params, ctx) {
  const handler = HANDLERS[action]
  if (!handler) {
    throw new SqsOpError(
      CODE_UNKNOWN_OPERATION,
      400,
      `The action or operation requested is invalid: ${action}`,
    )
  }
  return handler(params ?? {}, ctx)
}
