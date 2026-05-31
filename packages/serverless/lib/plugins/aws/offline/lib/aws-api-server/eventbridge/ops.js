/**
 * Protocol-agnostic EventBridge operation set.
 *
 * `runOp(action, params, { store, registry, deliver })` executes one
 * EventBridge action against the in-memory bus store and returns a plain result
 * object using AWS field names (`RuleArn`, `EventBusArn`, `Entries`, …). On
 * failure it throws an `EbOpError` carrying the AWS error code, HTTP status, and
 * message — the wire adapter turns that into the JSON error envelope.
 *
 * This layer knows nothing about HTTP or wire formats. `deliver(busName, event)`
 * is injected so PutEvents can fan an event out to matching rules/targets
 * without ops depending on the deliverer.
 */

import { randomUUID } from 'node:crypto'

import {
  allLambdas,
  allSqsQueues,
  allSnsTopics,
} from '../../provisioner/registry.js'
import { matchesEventPattern } from './rule-engine.js'

/** AWS error codes used across the operation set. */
const CODE_RESOURCE_NOT_FOUND = 'ResourceNotFoundException'
const CODE_VALIDATION = 'ValidationException'
const CODE_INVALID_EVENT_PATTERN = 'InvalidEventPatternException'

/** The implicit account-level event bus. */
const DEFAULT_BUS_NAME = 'default'

/** Fixed local-offline identity used when building events. */
const ACCOUNT_ID = '000000000000'
const REGION = 'us-east-1'

/**
 * A tagged operation error. Carries the AWS error code, the HTTP status the
 * wire layer should respond with, and a human-readable message.
 */
export class EbOpError extends Error {
  /**
   * @param {string} awsCode    - AWS error code (e.g. `'ResourceNotFoundException'`).
   * @param {number} httpStatus - HTTP status to respond with.
   * @param {string} message    - Human-readable detail.
   */
  constructor(awsCode, httpStatus, message) {
    super(message)
    this.name = 'EbOpError'
    this.awsCode = awsCode
    this.httpStatus = httpStatus
  }
}

/**
 * Execute one EventBridge action.
 *
 * @param {string} action - The EventBridge action name (e.g. `'PutEvents'`).
 * @param {object} params - AWS PascalCase parameters from the request body.
 * @param {{
 *   store:    object,
 *   registry: object,
 *   deliver:  (busName: string, event: object) => Promise<void>,
 * }} ctx
 * @returns {object | Promise<object>} The result object (PutEvents is async).
 */
export function runOp(action, params, ctx) {
  const handler = OPS[action]
  if (!handler) {
    throw new EbOpError(
      CODE_VALIDATION,
      400,
      `Unsupported EventBridge action: ${action}`,
    )
  }
  return handler(params ?? {}, ctx)
}

// ---------------------------------------------------------------------------
// PutEvents
// ---------------------------------------------------------------------------

/**
 * Fan a batch of entries out to the deliverer, building a full EventBridge
 * event per entry. A malformed `Detail` fails just that entry.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {Promise<object>}
 */
async function putEvents(params, { deliver }) {
  const entries = params.Entries ?? []
  const resultEntries = []
  let failedEntryCount = 0

  for (const entry of entries) {
    let detail
    try {
      detail = JSON.parse(entry.Detail ?? '{}')
    } catch {
      failedEntryCount += 1
      resultEntries.push({
        ErrorCode: 'MalformedDetail',
        ErrorMessage: 'Detail is not valid JSON.',
      })
      continue
    }

    const busName = entry.EventBusName ?? DEFAULT_BUS_NAME
    const id = randomUUID()
    const event = {
      version: '0',
      id,
      'detail-type': entry.DetailType,
      source: entry.Source,
      account: ACCOUNT_ID,
      time: entry.Time ?? new Date().toISOString(),
      region: REGION,
      resources: entry.Resources ?? [],
      detail,
      'event-bus-name': busName,
    }

    await deliver(busName, event)
    resultEntries.push({ EventId: id })
  }

  return { FailedEntryCount: failedEntryCount, Entries: resultEntries }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Resolve the bus name from params, defaulting to the account bus.
 *
 * @param {object} params
 * @returns {string}
 */
function busNameOf(params) {
  return params.EventBusName ?? DEFAULT_BUS_NAME
}

/**
 * Validate an `EventPattern` JSON string, throwing
 * `InvalidEventPatternException` when it does not parse.
 *
 * @param {string|undefined|null} pattern
 * @returns {void}
 */
function assertValidPattern(pattern) {
  if (pattern === undefined || pattern === null) return
  try {
    JSON.parse(pattern)
  } catch {
    throw new EbOpError(
      CODE_INVALID_EVENT_PATTERN,
      400,
      'Event pattern is not valid JSON.',
    )
  }
}

/**
 * Create or replace a rule.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function putRule(params, { store }) {
  if (!params.Name) {
    throw new EbOpError(CODE_VALIDATION, 400, 'Rule Name is required.')
  }
  assertValidPattern(params.EventPattern)

  const ruleArn = store.putRule(busNameOf(params), params.Name, {
    eventPattern: params.EventPattern ?? null,
    scheduleExpression: params.ScheduleExpression ?? null,
    state: params.State ?? 'ENABLED',
  })
  return { RuleArn: ruleArn }
}

/**
 * Look up a rule, throwing `ResourceNotFoundException` when absent.
 *
 * @param {object} store
 * @param {string} busName
 * @param {string} name
 * @returns {object}
 */
function requireRule(store, busName, name) {
  const rule = store.describeRule(busName, name)
  if (!rule) {
    throw new EbOpError(
      CODE_RESOURCE_NOT_FOUND,
      404,
      `Rule ${name} does not exist on bus ${busName}.`,
    )
  }
  return rule
}

/**
 * Describe a rule.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function describeRule(params, { store }) {
  const busName = busNameOf(params)
  const rule = requireRule(store, busName, params.Name)
  return {
    Name: rule.name,
    Arn: rule.arn,
    EventPattern: rule.eventPattern,
    ScheduleExpression: rule.scheduleExpression,
    State: rule.state,
    EventBusName: rule.busName,
  }
}

/**
 * List rules on a bus, optionally by name prefix.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function listRules(params, { store }) {
  const busName = busNameOf(params)
  const rules = store.listRules(busName, params.NamePrefix)
  return {
    Rules: rules.map((rule) => ({
      Name: rule.name,
      Arn: rule.arn,
      EventPattern: rule.eventPattern,
      ScheduleExpression: rule.scheduleExpression,
      State: rule.state,
      EventBusName: rule.busName,
    })),
  }
}

/**
 * Delete a rule.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function deleteRule(params, { store }) {
  store.deleteRule(busNameOf(params), params.Name)
  return {}
}

/**
 * Enable a rule.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function enableRule(params, { store }) {
  store.enableRule(busNameOf(params), params.Name)
  return {}
}

/**
 * Disable a rule.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function disableRule(params, { store }) {
  store.disableRule(busNameOf(params), params.Name)
  return {}
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/**
 * Resolve a target ARN to its delivery kind and a resolved descriptor, using
 * the resource registry. Unknown ARNs resolve to `unsupported`.
 *
 * @param {string} arn
 * @param {object} registry
 * @returns {{ kind: string, resolved: object | null }}
 */
function resolveTargetArn(arn, registry) {
  if (typeof arn !== 'string') return { kind: 'unsupported', resolved: null }

  if (arn.includes(':lambda:')) {
    for (const fn of allLambdas(registry)) {
      if (fn.arn === arn) {
        return {
          kind: 'lambda',
          resolved: { functionKey: fn.functionKey, arn: fn.arn },
        }
      }
    }
  }

  if (arn.includes(':sqs:')) {
    for (const queue of allSqsQueues(registry)) {
      if (queue.arn === arn) {
        return {
          kind: 'sqs',
          resolved: { queueUrl: queue.url, arn: queue.arn },
        }
      }
    }
  }

  if (arn.includes(':sns:')) {
    for (const topic of allSnsTopics(registry)) {
      if (topic.arn === arn) {
        return { kind: 'sns', resolved: { topicArn: topic.arn } }
      }
    }
  }

  if (arn.includes(':events:') && arn.includes(':event-bus/')) {
    const busName = arn.slice(arn.indexOf('event-bus/') + 'event-bus/'.length)
    return { kind: 'eventbus', resolved: { busName } }
  }

  return { kind: 'unsupported', resolved: null }
}

/**
 * Add targets to a rule, resolving each ARN against the registry.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function putTargets(params, { store, registry }) {
  const busName = busNameOf(params)
  requireRule(store, busName, params.Rule)

  const targets = params.Targets ?? []
  store.putTargets(busName, params.Rule, targets)

  // Fill in the resolved kind/descriptor the store left as placeholders.
  for (const target of store.listTargetsByRule(busName, params.Rule)) {
    const { kind, resolved } = resolveTargetArn(target.arn, registry)
    target.kind = kind
    target.resolved = resolved
  }

  return { FailedEntryCount: 0, FailedEntries: [] }
}

/**
 * Remove targets from a rule by id.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function removeTargets(params, { store }) {
  const busName = busNameOf(params)
  requireRule(store, busName, params.Rule)
  store.removeTargets(busName, params.Rule, params.Ids ?? [])
  return { FailedEntryCount: 0, FailedEntries: [] }
}

/**
 * List the targets on a rule, in AWS field-name shape.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function listTargetsByRule(params, { store }) {
  const busName = busNameOf(params)
  requireRule(store, busName, params.Rule)
  return {
    Targets: store.listTargetsByRule(busName, params.Rule).map((target) => ({
      Id: target.id,
      Arn: target.arn,
      Input: target.input,
      InputPath: target.inputPath,
      InputTransformer: target.inputTransformer,
    })),
  }
}

// ---------------------------------------------------------------------------
// Buses
// ---------------------------------------------------------------------------

/**
 * Create an event bus.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function createEventBus(params, { store }) {
  if (!params.Name) {
    throw new EbOpError(CODE_VALIDATION, 400, 'Event bus Name is required.')
  }
  const bus = store.ensureBus(params.Name)
  return { EventBusArn: bus.arn }
}

/**
 * Delete an event bus.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function deleteEventBus(params, { store }) {
  store.deleteBus(params.Name)
  return {}
}

/**
 * List all event buses.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function listEventBuses(_params, { store }) {
  return {
    EventBuses: store.listBuses().map((bus) => ({
      Name: bus.name,
      Arn: bus.arn,
    })),
  }
}

// ---------------------------------------------------------------------------
// TestEventPattern
// ---------------------------------------------------------------------------

/**
 * Test whether an event matches an event pattern.
 *
 * @param {object} params
 * @param {object} ctx
 * @returns {object}
 */
function testEventPattern(params) {
  let pattern
  let event
  try {
    pattern = JSON.parse(params.EventPattern)
  } catch {
    throw new EbOpError(
      CODE_INVALID_EVENT_PATTERN,
      400,
      'Event pattern is not valid JSON.',
    )
  }
  try {
    event = JSON.parse(params.Event)
  } catch {
    throw new EbOpError(CODE_VALIDATION, 400, 'Event is not valid JSON.')
  }
  return { Result: matchesEventPattern(pattern, event) }
}

/** Action name → handler. */
const OPS = {
  PutEvents: putEvents,
  PutRule: putRule,
  DeleteRule: deleteRule,
  EnableRule: enableRule,
  DisableRule: disableRule,
  DescribeRule: describeRule,
  ListRules: listRules,
  PutTargets: putTargets,
  RemoveTargets: removeTargets,
  ListTargetsByRule: listTargetsByRule,
  CreateEventBus: createEventBus,
  DeleteEventBus: deleteEventBus,
  ListEventBuses: listEventBuses,
  TestEventPattern: testEventPattern,
}
