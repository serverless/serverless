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
const CODE_EMPTY_BATCH = 'AWS.SimpleQueueService.EmptyBatchRequest'
const CODE_TOO_MANY_ENTRIES =
  'AWS.SimpleQueueService.TooManyEntriesInBatchRequest'
const CODE_BATCH_IDS_NOT_DISTINCT =
  'AWS.SimpleQueueService.BatchEntryIdsNotDistinct'

/** Maximum number of entries AWS accepts in a single batch request. */
const MAX_BATCH_ENTRIES = 10

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
 * Validate the `Entries` collection of a batch request against AWS's batch
 * constraints: it must be non-empty, carry at most 10 entries, and use distinct
 * entry ids. All three faults are sender faults answered with a 400.
 *
 * @param {object[]} entries
 * @returns {void}
 * @throws {SqsOpError}
 */
function validateBatchEntries(entries) {
  if (entries.length === 0) {
    throw new SqsOpError(
      CODE_EMPTY_BATCH,
      400,
      'There should be at least one SendMessageBatchRequestEntry in the request.',
    )
  }
  if (entries.length > MAX_BATCH_ENTRIES) {
    throw new SqsOpError(
      CODE_TOO_MANY_ENTRIES,
      400,
      `Maximum number of entries per request are ${MAX_BATCH_ENTRIES}. You have sent ${entries.length}.`,
    )
  }
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.Id)) {
      throw new SqsOpError(
        CODE_BATCH_IDS_NOT_DISTINCT,
        400,
        `Id ${entry.Id} repeated.`,
      )
    }
    seen.add(entry.Id)
  }
}

/**
 * Whether a queue url names a FIFO queue (its name ends with `.fifo`).
 *
 * @param {string} url
 * @returns {boolean}
 */
function isFifoQueueUrl(url) {
  return String(url).split('/').pop().endsWith('.fifo')
}

/**
 * Validate a single send entry's FIFO-specific parameters against the queue's
 * type and configuration. Non-FIFO queues impose no requirement.
 *
 * @param {object} entry - `{ MessageBody, MessageGroupId?, MessageDeduplicationId? }`
 * @param {string} url   - The target queue url.
 * @param {object} ctx
 * @returns {void}
 * @throws {SqsOpError}
 */
function validateFifoSendEntry(entry, url, ctx) {
  if (!isFifoQueueUrl(url)) return

  if (entry.MessageGroupId === undefined || entry.MessageGroupId === null) {
    throw new SqsOpError(
      CODE_MISSING_PARAMETER,
      400,
      'The request must contain the parameter MessageGroupId.',
    )
  }

  const contentBasedDedup = ctx.store.getConfig(url)?.contentBasedDedup
  if (
    !contentBasedDedup &&
    (entry.MessageDeduplicationId === undefined ||
      entry.MessageDeduplicationId === null)
  ) {
    throw new SqsOpError(
      CODE_INVALID_PARAMETER,
      400,
      'The queue should either have ContentBasedDeduplication enabled or ' +
        'MessageDeduplicationId provided explicitly.',
    )
  }
}

/**
 * Compute the set of system-attribute names a ReceiveMessage caller requested.
 * Honors both `AttributeNames` (legacy) and `MessageSystemAttributeNames`. An
 * `All` / `.*` member selects every name; an absent/empty selection selects
 * none.
 *
 * @param {object} params
 * @returns {{ all: boolean, names: Set<string> }}
 */
function requestedSystemAttributeNames(params) {
  const requested = [
    ...(params.AttributeNames ?? []),
    ...(params.MessageSystemAttributeNames ?? []),
  ]
  const all = requested.some((name) => name === 'All' || name === '.*')
  return { all, names: new Set(requested) }
}

/**
 * Map a single message-store record to the AWS ReceiveMessage message shape,
 * applying the caller's attribute selection: system `Attributes` are returned
 * only for the names requested via `AttributeNames` /
 * `MessageSystemAttributeNames` (`All`/`.*` ⇒ all; none requested ⇒ omitted),
 * and user `MessageAttributes` only for the names requested via
 * `MessageAttributeNames` (`All` ⇒ all; none requested ⇒ omitted).
 *
 * @param {object} record - A store record (see queue-store `toRecord`).
 * @param {object} params - The ReceiveMessage params (drives attribute selection).
 * @returns {object}
 */
function toAwsMessage(record, params) {
  const message = {
    MessageId: record.messageId,
    ReceiptHandle: record.receiptHandle,
    Body: record.body,
    MD5OfBody: md5(record.body),
  }

  const messageAttributes = selectMessageAttributes(
    record.messageAttributes,
    params,
  )
  const attributesMd5 = md5OfMessageAttributes(messageAttributes)
  if (attributesMd5 !== undefined) {
    message.MD5OfMessageAttributes = attributesMd5
    message.MessageAttributes = messageAttributes
  }

  const systemAttributes = selectSystemAttributes(
    record.systemAttributes,
    params,
  )
  if (systemAttributes && Object.keys(systemAttributes).length) {
    message.Attributes = systemAttributes
  }

  return message
}

/**
 * Select the requested system attributes from a record's full system-attribute
 * map. Returns `undefined` when nothing was requested.
 *
 * @param {object} systemAttributes
 * @param {object} params
 * @returns {object|undefined}
 */
function selectSystemAttributes(systemAttributes, params) {
  if (!systemAttributes) return undefined
  const { all, names } = requestedSystemAttributeNames(params)
  if (names.size === 0) return undefined
  if (all) return systemAttributes

  const subset = {}
  for (const [key, value] of Object.entries(systemAttributes)) {
    if (names.has(key)) subset[key] = value
  }
  return subset
}

/**
 * Select the requested user message attributes from a record's full map.
 * Returns `undefined` when nothing was requested.
 *
 * @param {object} messageAttributes
 * @param {object} params
 * @returns {object|undefined}
 */
function selectMessageAttributes(messageAttributes, params) {
  const requested = params.MessageAttributeNames ?? []
  if (requested.length === 0) return undefined
  if (requested.some((name) => name === 'All' || name === '.*')) {
    return messageAttributes
  }

  const subset = {}
  for (const name of requested) {
    if (messageAttributes && name in messageAttributes) {
      subset[name] = messageAttributes[name]
    }
  }
  return subset
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
  validateFifoSendEntry(params, url, ctx)

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
  validateBatchEntries(entries)

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
    validateFifoSendEntry(entry, url, ctx)
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

  let max = 1
  if (params.MaxNumberOfMessages !== undefined) {
    max = Number(params.MaxNumberOfMessages)
    // AWS accepts 1–10 inclusive; out-of-range is rejected, never clamped.
    if (!Number.isInteger(max) || max < 1 || max > 10) {
      throw new SqsOpError(
        CODE_INVALID_PARAMETER,
        400,
        `Value ${params.MaxNumberOfMessages} for parameter MaxNumberOfMessages is invalid. Reason: Must be between 1 and 10, if provided.`,
      )
    }
  }

  const options = { max }
  if (params.VisibilityTimeout !== undefined) {
    options.visibilityTimeout = Number(params.VisibilityTimeout)
  }

  const records = ctx.store.receive(url, options)
  if (records.length === 0) return {}

  return { Messages: records.map((record) => toAwsMessage(record, params)) }
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
  validateBatchEntries(entries)

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
  validateBatchEntries(entries)

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
