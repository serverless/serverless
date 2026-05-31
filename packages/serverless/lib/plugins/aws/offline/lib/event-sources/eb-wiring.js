/**
 * Boot-time EventBridge wiring for sls offline.
 *
 * Pure provisioning: populates the bus store with the buses, rules, and targets
 * the emulator should hold, derived from two sources:
 *
 *  1. Every EventBridge resource the provisioner lifted into the registry — an
 *     `AWS::Events::EventBus` (`kind: 'bus'`) becomes an ensured bus; an
 *     `AWS::Events::Rule` (`kind: 'rule'`) becomes a rule on its bus, carrying
 *     its `EventPattern` and `State`.
 *  2. Each function's `events: - eventBridge` that declares a `pattern`. A
 *     schedule-only entry (`events: - eventBridge` with only a `schedule`) is
 *     deferred — those rules are fired by the scheduler, not by PutEvents.
 *
 * For a function pattern the function is, by definition, local, so its target
 * resolves directly to `{ kind: 'lambda', functionKey }` without round-tripping
 * an ARN through the registry. The YAML target-input shape is normalised to the
 * AWS shape the deliverer/input-transform expect: an object `input` becomes a
 * JSON string, and the camelCase `inputTransformer` becomes PascalCase.
 *
 * Delivery is driven separately (the deliverer reads the same store), so this
 * module never touches the queue store, the topic store, or the Lambda facade.
 */

import { arnFor } from '../provisioner/arn-synth.js'
import { allEventResources } from '../provisioner/registry.js'

/** The implicit account-level event bus that always exists. */
const DEFAULT_BUS_NAME = 'default'

/**
 * Populate the bus store with buses, rules, and targets derived from the
 * registry and the service's `events: - eventBridge` declarations.
 *
 * @param {object} params
 * @param {object} params.serverless - The Serverless instance.
 * @param {ReturnType<import('../provisioner/registry.js').createRegistry>} params.registry
 * @param {ReturnType<import('../aws-api-server/eventbridge/bus-store.js').createBusStore>} params.store
 * @param {{ debug: Function, warning: Function }} params.logger
 * @returns {{ busCount: number, ruleCount: number, targetCount: number }}
 */
export function wireEventBridge({ serverless, registry, store, logger }) {
  let ruleCount = 0
  let targetCount = 0

  // 1. Ensure buses + rules declared as registry resources.
  for (const record of allEventResources(registry)) {
    if (record.kind === 'bus') {
      store.ensureBus(record.name)
      continue
    }

    if (record.kind === 'rule') {
      const properties = record.properties ?? {}
      const busName = properties.EventBusName ?? DEFAULT_BUS_NAME
      store.ensureBus(busName)
      store.putRule(busName, record.name, {
        eventPattern: parseEventPattern(properties.EventPattern),
        scheduleExpression: properties.ScheduleExpression ?? null,
        state: properties.State ?? 'ENABLED',
      })
      ruleCount += 1
    }
  }

  // 2. Rules + lambda targets derived from `events: - eventBridge` patterns.
  const functions = serverless.service.functions ?? {}
  for (const [functionKey, fn] of Object.entries(functions)) {
    const events = fn?.events ?? []
    events.forEach((event, idx) => {
      const ev = event?.eventBridge
      // A schedule-only entry is deferred — it carries no event pattern, so
      // PutEvents would never match it anyway.
      if (!ev || ev.pattern == null) return

      const busName = busNameOf(ev.eventBus)
      store.ensureBus(busName)

      const ruleName = `${functionKey}-rule-${idx}`
      store.putRule(busName, ruleName, { eventPattern: ev.pattern })
      ruleCount += 1

      store.putTargets(busName, ruleName, [
        {
          Id: functionKey,
          Arn: arnFor('lambda', functionKey),
          Input: normaliseInput(ev.input),
          InputPath: ev.inputPath ?? null,
          InputTransformer: normaliseInputTransformer(ev.inputTransformer),
        },
      ])

      // The function is local, so resolve its target directly to the
      // functionKey — no need to round-trip the synthesized ARN.
      for (const target of store.listTargetsByRule(busName, ruleName)) {
        target.kind = 'lambda'
        target.resolved = { functionKey }
      }
      targetCount += 1
    })
  }

  return { busCount: store.listBuses().length, ruleCount, targetCount }
}

/**
 * Resolve the bus name an `events: - eventBridge` entry targets. A string that
 * is an ARN (`arn:...:event-bus/<name>`) yields the trailing bus name; any
 * other string is the bus name verbatim; an absent value is the default bus. A
 * non-string (an unresolved intrinsic) also falls back to the default bus.
 *
 * @param {string|object|undefined} eventBus
 * @returns {string}
 */
function busNameOf(eventBus) {
  if (typeof eventBus !== 'string') return DEFAULT_BUS_NAME
  if (eventBus.startsWith('arn:')) {
    return eventBus.slice(eventBus.indexOf('event-bus/') + 'event-bus/'.length)
  }
  return eventBus
}

/**
 * Normalise a CloudFormation rule `EventPattern` (which may be a JSON string or
 * an object) into the object the rule engine matches against.
 *
 * @param {object|string|null|undefined} pattern
 * @returns {object|null}
 */
function parseEventPattern(pattern) {
  if (pattern == null) return null
  if (typeof pattern === 'string') {
    try {
      return JSON.parse(pattern)
    } catch {
      return null
    }
  }
  return pattern
}

/**
 * Normalise an `events: - eventBridge` `input` (an object in YAML) into the
 * constant JSON string the input-transform reads. A string is already in the
 * stored shape and passes through unchanged; an absent value stays null.
 *
 * @param {object|string|null|undefined} input
 * @returns {string|null}
 */
function normaliseInput(input) {
  if (input == null) return null
  if (typeof input === 'string') return input
  return JSON.stringify(input)
}

/**
 * Convert an `events: - eventBridge` `inputTransformer` (camelCase
 * `inputPathsMap` / `inputTemplate`) into the AWS PascalCase shape the
 * input-transform expects (`InputPathsMap` / `InputTemplate`).
 *
 * @param {{ inputPathsMap?: object, inputTemplate?: string }|null|undefined} transformer
 * @returns {{ InputPathsMap: object, InputTemplate: string }|null}
 */
function normaliseInputTransformer(transformer) {
  if (transformer == null) return null
  return {
    InputPathsMap: transformer.inputPathsMap ?? {},
    InputTemplate: transformer.inputTemplate ?? '',
  }
}
