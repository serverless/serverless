/**
 * Protocol-agnostic SNS operation set.
 *
 * `runOp(action, params, { store, registry, deliver })` executes one SNS action
 * against the in-memory topic store and returns a plain result object using AWS
 * field names (e.g. `TopicArn`, `MessageId`). On failure it throws an
 * `SnsOpError` carrying the AWS error code, HTTP status, and message — the wire
 * adapter (query / XML) turns that into the appropriate error envelope.
 *
 * This layer knows nothing about HTTP or wire formats: the protocol adapter
 * normalises its input into the `params` shape (AWS PascalCase keys) and calls
 * into here. `Publish` fans out by calling the caller-supplied `deliver`.
 */

import { randomUUID } from 'node:crypto'

import { allLambdas, allSqsQueues } from '../../provisioner/registry.js'
import { arnFor } from '../../provisioner/arn-synth.js'

/** AWS error codes used across the operation set. */
const CODE_NOT_FOUND = 'NotFound'
const CODE_INVALID_PARAMETER = 'InvalidParameter'
const CODE_INVALID_ACTION = 'InvalidAction'
const CODE_EMPTY_BATCH = 'EmptyBatchRequest'
const CODE_TOO_MANY_ENTRIES = 'TooManyEntriesInBatchRequest'

/** Maximum number of entries AWS accepts in a single PublishBatch request. */
const MAX_BATCH_ENTRIES = 10

/**
 * A tagged operation error. Carries the AWS error code, the HTTP status the
 * wire layer should respond with, and a human-readable message.
 */
export class SnsOpError extends Error {
  /**
   * @param {string} awsCode    - AWS error code (e.g. `'NotFound'`).
   * @param {number} httpStatus - HTTP status to respond with.
   * @param {string} message    - Human-readable detail.
   */
  constructor(awsCode, httpStatus, message) {
    super(message)
    this.name = 'SnsOpError'
    this.awsCode = awsCode
    this.httpStatus = httpStatus
  }
}

/**
 * Resolve and validate a topic ARN against the store. Unknown ARNs throw
 * `NotFound` (404).
 *
 * @param {string} arn
 * @param {object} ctx
 * @returns {string} the validated arn
 * @throws {SnsOpError}
 */
function resolveTopicArn(arn, { store }) {
  if (!arn) {
    throw new SnsOpError(
      CODE_INVALID_PARAMETER,
      400,
      'The request must contain the parameter TopicArn.',
    )
  }
  if (!store.getTopicByArn(arn)) {
    throw new SnsOpError(CODE_NOT_FOUND, 404, `Topic does not exist: ${arn}`)
  }
  return arn
}

/**
 * Whether a topic name names a FIFO topic (it ends with `.fifo`).
 *
 * @param {string} name
 * @returns {boolean}
 */
function isFifoName(name) {
  return String(name).endsWith('.fifo')
}

/**
 * Resolve a Subscribe endpoint to a delivery target descriptor. A `lambda`
 * endpoint is matched against the registry's lambda identities (by arn); an
 * `sqs` endpoint against the registered SQS queues (by arn). Anything else —
 * or an arn that matches nothing — becomes an `unsupported` target so the
 * subscription is still stored.
 *
 * @param {string} protocol
 * @param {string|undefined} endpoint
 * @param {object} ctx
 * @returns {import('./topic-store.js').Target}
 */
function resolveTarget(protocol, endpoint, { registry }) {
  if (protocol === 'lambda') {
    for (const lambda of allLambdas(registry)) {
      if (lambda.arn === endpoint) {
        return { kind: 'lambda', functionKey: lambda.functionKey }
      }
    }
    return { kind: 'unsupported', protocol }
  }

  if (protocol === 'sqs') {
    for (const queue of allSqsQueues(registry)) {
      if (queue.arn === endpoint) {
        return { kind: 'sqs', queueUrl: queue.url }
      }
    }
    return { kind: 'unsupported', protocol }
  }

  return { kind: 'unsupported', protocol }
}

/**
 * Parse and lightly validate a `FilterPolicy` attribute value. Accepts an
 * already-parsed object or its JSON string form. A non-object policy is a
 * sender fault (`InvalidParameter`). The full AWS FilterPolicyValidator
 * (5-key / 150-combination caps, value-type rules) is out of scope.
 *
 * @param {*} value
 * @returns {object|undefined} the parsed policy, or undefined when absent
 * @throws {SnsOpError}
 */
function parseFilterPolicy(value) {
  if (value === undefined || value === null || value === '') return undefined

  let policy = value
  if (typeof value === 'string') {
    try {
      policy = JSON.parse(value)
    } catch {
      throw new SnsOpError(
        CODE_INVALID_PARAMETER,
        400,
        'FilterPolicy: failed to parse JSON.',
      )
    }
  }

  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    throw new SnsOpError(
      CODE_INVALID_PARAMETER,
      400,
      'FilterPolicy: must be an object.',
    )
  }
  return policy
}

/**
 * Coerce an AWS boolean-string attribute (`'true'` / `'false'`) to a boolean.
 *
 * @param {*} value
 * @returns {boolean}
 */
function toBool(value) {
  return value === true || value === 'true'
}

/**
 * Map a store subscription record to the AWS list-subscription shape.
 *
 * @param {object} sub
 * @returns {object}
 */
function toListSubscription(sub) {
  return {
    SubscriptionArn: sub.arn,
    TopicArn: sub.topicArn,
    Protocol: sub.protocol,
    Endpoint: sub.endpoint ?? '',
    Owner: accountFromArn(sub.topicArn),
  }
}

/**
 * Extract the account id from an ARN (the fifth colon-delimited segment).
 *
 * @param {string} arn
 * @returns {string}
 */
function accountFromArn(arn) {
  return String(arn).split(':')[4] ?? ''
}

/**
 * Build a published-message record from a Publish-style entry. The record is
 * what `deliver` fans out to each matching subscription.
 *
 * @param {object} entry - `{ Message, Subject?, MessageAttributes?, MessageStructure?, MessageGroupId?, MessageDeduplicationId? }`
 * @returns {object}
 */
function toPublishRecord(entry) {
  return {
    messageId: randomUUID(),
    message: entry.Message,
    subject: entry.Subject,
    messageAttributes: entry.MessageAttributes ?? {},
    messageStructure: entry.MessageStructure,
    messageGroupId: entry.MessageGroupId,
    messageDeduplicationId: entry.MessageDeduplicationId,
  }
}

/**
 * Validate a single Publish-style entry against the topic. Missing `Message` is
 * a sender fault; a FIFO topic additionally requires a `MessageGroupId`.
 *
 * @param {object} entry
 * @param {boolean} fifo
 * @returns {void}
 * @throws {SnsOpError}
 */
function validatePublishEntry(entry, fifo) {
  if (entry.Message === undefined || entry.Message === null) {
    throw new SnsOpError(
      CODE_INVALID_PARAMETER,
      400,
      'The request must contain the parameter Message.',
    )
  }
  if (
    fifo &&
    (entry.MessageGroupId === undefined || entry.MessageGroupId === null)
  ) {
    throw new SnsOpError(
      CODE_INVALID_PARAMETER,
      400,
      'The request must contain the parameter MessageGroupId.',
    )
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function createTopic(params, ctx) {
  const name = params.Name
  if (!name) {
    throw new SnsOpError(
      CODE_INVALID_PARAMETER,
      400,
      'The request must contain the parameter Name.',
    )
  }

  const arn = arnFor('sns', name)
  ctx.store.ensureTopic(arn, {
    name,
    fifo: isFifoName(name),
    attributes: params.Attributes ?? {},
  })
  return { TopicArn: arn }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function deleteTopic(params, ctx) {
  ctx.store.deleteTopic(params.TopicArn)
  return {}
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function listTopics(params, ctx) {
  return {
    Topics: ctx.store.listTopics().map((topic) => ({ TopicArn: topic.arn })),
  }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function subscribe(params, ctx) {
  const topicArn = resolveTopicArn(params.TopicArn, ctx)
  const protocol = params.Protocol
  const endpoint = params.Endpoint
  const attributes = params.Attributes ?? {}

  const filterPolicy = parseFilterPolicy(attributes.FilterPolicy)
  const target = resolveTarget(protocol, endpoint, ctx)

  const arn = ctx.store.subscribe(topicArn, {
    protocol,
    endpoint,
    filterPolicy: filterPolicy ?? null,
    filterPolicyScope: attributes.FilterPolicyScope ?? 'MessageAttributes',
    rawMessageDelivery: toBool(attributes.RawMessageDelivery),
    target,
  })

  return { SubscriptionArn: arn }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function unsubscribe(params, ctx) {
  ctx.store.unsubscribe(params.SubscriptionArn)
  return {}
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function listSubscriptions(params, ctx) {
  return {
    Subscriptions: ctx.store.listSubscriptions().map(toListSubscription),
  }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function listSubscriptionsByTopic(params, ctx) {
  const topicArn = resolveTopicArn(params.TopicArn, ctx)
  return {
    Subscriptions: ctx.store
      .listSubscriptionsByTopic(topicArn)
      .map(toListSubscription),
  }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function getTopicAttributes(params, ctx) {
  const topicArn = resolveTopicArn(params.TopicArn, ctx)
  return { Attributes: ctx.store.getTopicAttributes(topicArn) }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function setTopicAttributes(params, ctx) {
  const topicArn = resolveTopicArn(params.TopicArn, ctx)
  ctx.store.setTopicAttributes(
    topicArn,
    params.AttributeName,
    params.AttributeValue,
  )
  return {}
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function getSubscriptionAttributes(params, ctx) {
  return {
    Attributes: ctx.store.getSubscriptionAttributes(params.SubscriptionArn),
  }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function setSubscriptionAttributes(params, ctx) {
  // A FilterPolicy update gets the same light structural validation as Subscribe.
  if (params.AttributeName === 'FilterPolicy') {
    parseFilterPolicy(params.AttributeValue)
  }
  ctx.store.setSubscriptionAttributes(
    params.SubscriptionArn,
    params.AttributeName,
    params.AttributeValue,
  )
  return {}
}

/**
 * No-op confirmation: the local emulator auto-confirms subscriptions, so this
 * simply echoes a subscription arn.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function confirmSubscription(params, ctx) {
  const subs = params.TopicArn
    ? ctx.store.listSubscriptionsByTopic(params.TopicArn)
    : ctx.store.listSubscriptions()
  const arn = subs[0]?.arn ?? `${params.TopicArn ?? ''}:${randomUUID()}`
  return { SubscriptionArn: arn }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {Promise<object>}
 */
async function publish(params, ctx) {
  const topicArn = resolveTopicArn(params.TopicArn ?? params.TargetArn, ctx)
  const topic = ctx.store.getTopicByArn(topicArn)

  validatePublishEntry(params, topic.fifo)

  const record = toPublishRecord(params)
  await ctx.deliver(topicArn, record)
  return { MessageId: record.messageId }
}

/**
 * @param {object} params
 * @param {object} ctx
 * @returns {Promise<object>}
 */
async function publishBatch(params, ctx) {
  const topicArn = resolveTopicArn(params.TopicArn ?? params.TargetArn, ctx)
  const topic = ctx.store.getTopicByArn(topicArn)
  const entries = params.PublishBatchRequestEntries ?? []

  if (entries.length === 0) {
    throw new SnsOpError(
      CODE_EMPTY_BATCH,
      400,
      'The batch request does not contain any entries.',
    )
  }
  if (entries.length > MAX_BATCH_ENTRIES) {
    throw new SnsOpError(
      CODE_TOO_MANY_ENTRIES,
      400,
      `The batch request contains more entries than permissible (more than ${MAX_BATCH_ENTRIES}).`,
    )
  }

  const Successful = []
  const Failed = []

  for (const entry of entries) {
    try {
      validatePublishEntry(entry, topic.fifo)
    } catch (error) {
      Failed.push({
        Id: entry.Id,
        Code: error.awsCode ?? CODE_INVALID_PARAMETER,
        Message: error.message,
        SenderFault: true,
      })
      continue
    }
    const record = toPublishRecord(entry)
    await ctx.deliver(topicArn, record)
    Successful.push({ Id: entry.Id, MessageId: record.messageId })
  }

  return { Successful, Failed }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Map of supported action name → handler. */
const HANDLERS = {
  CreateTopic: createTopic,
  DeleteTopic: deleteTopic,
  ListTopics: listTopics,
  Subscribe: subscribe,
  Unsubscribe: unsubscribe,
  ListSubscriptions: listSubscriptions,
  ListSubscriptionsByTopic: listSubscriptionsByTopic,
  GetTopicAttributes: getTopicAttributes,
  SetTopicAttributes: setTopicAttributes,
  GetSubscriptionAttributes: getSubscriptionAttributes,
  SetSubscriptionAttributes: setSubscriptionAttributes,
  ConfirmSubscription: confirmSubscription,
  Publish: publish,
  PublishBatch: publishBatch,
}

/**
 * Run one SNS operation.
 *
 * @param {string} action - The SNS action name (e.g. `'Publish'`).
 * @param {object} params - AWS PascalCase parameters.
 * @param {{ store: object, registry: object, deliver: Function }} ctx
 * @returns {Promise<object>} A plain result object using AWS field names.
 * @throws {SnsOpError} On any operation error (validation, missing topic, …).
 */
export async function runOp(action, params, ctx) {
  const handler = HANDLERS[action]
  if (!handler) {
    throw new SnsOpError(
      CODE_INVALID_ACTION,
      400,
      `The action or operation requested is invalid: ${action}`,
    )
  }
  return handler(params ?? {}, ctx)
}
