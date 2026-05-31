/**
 * In-memory EventBridge bus / rule / target store for sls offline.
 *
 * Models the three-level hierarchy EventBridge exposes: event buses contain
 * rules, and rules fan out to targets. The store is pure state — it performs no
 * event-pattern matching and no delivery (those live in the rule engine and the
 * deliverer). Rule ARNs use the simple `rule/<name>` form (no bus infix) so
 * they match the `eventRuleArnFor` helper; rules are still scoped per bus
 * internally, so a rule named `r1` on the default bus is distinct from `r1` on
 * a named bus.
 *
 * The default bus (`default`) always exists and cannot be removed.
 */

import { arnFor, eventRuleArnFor } from '../../provisioner/arn-synth.js'

/** The implicit account-level event bus that always exists. */
const DEFAULT_BUS_NAME = 'default'

/**
 * @typedef {{
 *   id:               string,
 *   arn:              string,
 *   input:            string | null,
 *   inputPath:        string | null,
 *   inputTransformer: object | null,
 *   roleArn:          string | null,
 *   kind:             'lambda' | 'sqs' | 'sns' | 'eventbus' | 'unsupported',
 *   resolved:         object | null,
 * }} Target
 */

/**
 * @typedef {{
 *   name:               string,
 *   busName:            string,
 *   arn:                string,
 *   eventPattern:       object | null,
 *   scheduleExpression: string | null,
 *   state:              'ENABLED' | 'DISABLED',
 *   targets:            Map<string, Target>,
 * }} Rule
 */

/**
 * Creates and returns a fresh in-memory EventBridge store seeded with the
 * default bus.
 *
 * @returns {object} The store API (see method JSDoc below).
 */
export function createBusStore() {
  /** Map<busName, { name, arn }>. */
  const buses = new Map()

  /**
   * Map<busName, Map<ruleName, Rule>>. Rules are scoped per bus so identically
   * named rules on different buses stay isolated.
   */
  const rulesByBus = new Map()

  /**
   * Ensure a bus exists. Idempotent — re-ensuring returns the existing record
   * untouched. The returned object is the live, stored bus record.
   *
   * @param {string} name
   * @returns {{ name: string, arn: string }}
   */
  function ensureBus(name) {
    const existing = buses.get(name)
    if (existing) return existing

    const bus = { name, arn: arnFor('events', name) }
    buses.set(name, bus)
    if (!rulesByBus.has(name)) rulesByBus.set(name, new Map())
    return bus
  }

  /**
   * Return a bus by name, or `undefined` when it does not exist.
   *
   * @param {string} name
   * @returns {{ name: string, arn: string } | undefined}
   */
  function getBus(name) {
    return buses.get(name)
  }

  /**
   * List all buses.
   *
   * @returns {Array<{ name: string, arn: string }>}
   */
  function listBuses() {
    return [...buses.values()]
  }

  /**
   * Remove a bus and its rules. The default bus is never removed.
   *
   * @param {string} name
   * @returns {void}
   */
  function deleteBus(name) {
    if (name === DEFAULT_BUS_NAME) return
    buses.delete(name)
    rulesByBus.delete(name)
  }

  /**
   * Return the rule map for a bus, ensuring the bus exists first.
   *
   * @param {string} busName
   * @returns {Map<string, Rule>}
   */
  function rulesFor(busName) {
    ensureBus(busName)
    return rulesByBus.get(busName)
  }

  /**
   * Create or overwrite a rule on a bus. Auto-ensures the bus. Overwriting an
   * existing rule preserves its targets while replacing the pattern, schedule
   * and state.
   *
   * @param {string} busName
   * @param {string} name
   * @param {{
   *   eventPattern?: object | null,
   *   scheduleExpression?: string | null,
   *   state?: 'ENABLED' | 'DISABLED',
   * }} [config]
   * @returns {string} The rule ARN.
   */
  function putRule(busName, name, config = {}) {
    const rules = rulesFor(busName)
    const {
      eventPattern = null,
      scheduleExpression = null,
      state = 'ENABLED',
    } = config

    const existing = rules.get(name)
    /** @type {Rule} */
    const rule = {
      name,
      busName,
      arn: eventRuleArnFor(name),
      eventPattern,
      scheduleExpression,
      state,
      targets: existing ? existing.targets : new Map(),
    }
    rules.set(name, rule)
    return rule.arn
  }

  /**
   * Look up a rule on a bus.
   *
   * @param {string} busName
   * @param {string} name
   * @returns {Rule | undefined}
   */
  function findRule(busName, name) {
    return rulesByBus.get(busName)?.get(name)
  }

  /**
   * Remove a rule (and its targets) from a bus.
   *
   * @param {string} busName
   * @param {string} name
   * @returns {void}
   */
  function deleteRule(busName, name) {
    rulesByBus.get(busName)?.delete(name)
  }

  /**
   * Set a rule's state. No-op when the rule does not exist.
   *
   * @param {string} busName
   * @param {string} name
   * @param {'ENABLED' | 'DISABLED'} state
   * @returns {void}
   */
  function setRuleState(busName, name, state) {
    const rule = findRule(busName, name)
    if (rule) rule.state = state
  }

  /**
   * Enable a rule.
   *
   * @param {string} busName
   * @param {string} name
   * @returns {void}
   */
  function enableRule(busName, name) {
    setRuleState(busName, name, 'ENABLED')
  }

  /**
   * Disable a rule.
   *
   * @param {string} busName
   * @param {string} name
   * @returns {void}
   */
  function disableRule(busName, name) {
    setRuleState(busName, name, 'DISABLED')
  }

  /**
   * Describe a rule (its metadata, without the internal target map), or
   * `undefined` when it does not exist.
   *
   * @param {string} busName
   * @param {string} name
   * @returns {object | undefined}
   */
  function describeRule(busName, name) {
    const rule = findRule(busName, name)
    if (!rule) return undefined
    return {
      name: rule.name,
      busName: rule.busName,
      arn: rule.arn,
      eventPattern: rule.eventPattern,
      scheduleExpression: rule.scheduleExpression,
      state: rule.state,
    }
  }

  /**
   * List the rules on a bus, optionally filtered by a name prefix. Each entry
   * is the rule metadata as returned by `describeRule`.
   *
   * @param {string} busName
   * @param {string} [namePrefix]
   * @returns {object[]}
   */
  function listRules(busName, namePrefix) {
    const rules = rulesByBus.get(busName)
    if (!rules) return []
    const out = []
    for (const rule of rules.values()) {
      if (namePrefix && !rule.name.startsWith(namePrefix)) continue
      out.push(describeRule(busName, rule.name))
    }
    return out
  }

  /**
   * Normalise a raw `PutTargets` target into the stored shape. The `kind` and
   * `resolved` fields are placeholders filled in later by the caller (which
   * resolves the arn against the resource registry); the store only keeps the
   * raw arn, id and input configuration.
   *
   * @param {object} raw
   * @returns {Target}
   */
  function normaliseTarget(raw) {
    return {
      id: raw.Id,
      arn: raw.Arn,
      input: raw.Input ?? null,
      inputPath: raw.InputPath ?? null,
      inputTransformer: raw.InputTransformer ?? null,
      roleArn: raw.RoleArn ?? null,
      kind: 'unsupported',
      resolved: null,
    }
  }

  /**
   * Add or overwrite targets on a rule (by target Id). No-op when the rule does
   * not exist.
   *
   * @param {string} busName
   * @param {string} ruleName
   * @param {object[]} targets - raw `PutTargets` entries.
   * @returns {void}
   */
  function putTargets(busName, ruleName, targets = []) {
    const rule = findRule(busName, ruleName)
    if (!rule) return
    for (const raw of targets) {
      const target = normaliseTarget(raw)
      rule.targets.set(target.id, target)
    }
  }

  /**
   * Remove targets from a rule by id. No-op when the rule does not exist.
   *
   * @param {string} busName
   * @param {string} ruleName
   * @param {string[]} ids
   * @returns {void}
   */
  function removeTargets(busName, ruleName, ids = []) {
    const rule = findRule(busName, ruleName)
    if (!rule) return
    for (const id of ids) rule.targets.delete(id)
  }

  /**
   * List the targets on a rule. Empty when the rule is unknown or has none.
   *
   * @param {string} busName
   * @param {string} ruleName
   * @returns {Target[]}
   */
  function listTargetsByRule(busName, ruleName) {
    const rule = findRule(busName, ruleName)
    if (!rule) return []
    return [...rule.targets.values()]
  }

  ensureBus(DEFAULT_BUS_NAME)

  return {
    ensureBus,
    getBus,
    listBuses,
    deleteBus,
    putRule,
    deleteRule,
    enableRule,
    disableRule,
    describeRule,
    listRules,
    putTargets,
    removeTargets,
    listTargetsByRule,
  }
}
