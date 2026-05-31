/**
 * In-memory SNS topic and subscription store for sls offline.
 *
 * A pure store: it models topics and their subscriptions, but performs no
 * delivery — fan-out is driven by the caller (Publish → deliver). Targets are
 * resolved descriptors the caller supplies, so the store stays decoupled from
 * the Lambda registry and the SQS queue store.
 */

import { randomUUID } from 'node:crypto'

/**
 * @typedef {{
 *   arn:         string,
 *   name:        string,
 *   fifo:        boolean,
 *   displayName: string | undefined,
 *   attributes:  object,
 * }} Topic
 */

/**
 * @typedef {{ kind: 'lambda', functionKey: string }
 *   | { kind: 'sqs', queueUrl: string }
 *   | { kind: 'unsupported', protocol: string }} Target
 */

/**
 * @typedef {{
 *   arn:               string,
 *   topicArn:          string,
 *   protocol:          string,
 *   endpoint:          string | undefined,
 *   filterPolicy:      object | null,
 *   filterPolicyScope: string,
 *   rawMessageDelivery: boolean,
 *   target:            Target,
 * }} Subscription
 */

/**
 * Creates and returns a fresh, empty in-memory SNS store.
 *
 * @returns {object} The store API (see method JSDoc below).
 */
export function createTopicStore() {
  /** @type {Map<string, Topic>} keyed by topic ARN. */
  const topics = new Map()
  /** @type {Map<string, Subscription>} keyed by subscription ARN. */
  const subscriptions = new Map()

  /**
   * Ensure a topic exists for `arn`. Idempotent — re-ensuring keeps the
   * existing record untouched (first create wins) and returns it.
   *
   * @param {string} arn
   * @param {{
   *   name?: string,
   *   fifo?: boolean,
   *   attributes?: object,
   *   displayName?: string,
   * }} [options]
   * @returns {Topic}
   */
  function ensureTopic(arn, options = {}) {
    const existing = topics.get(arn)
    if (existing) return existing

    const { name, fifo = false, attributes = {}, displayName } = options
    /** @type {Topic} */
    const topic = {
      arn,
      name: name ?? nameFromArn(arn),
      fifo,
      displayName,
      attributes: { ...attributes },
    }
    topics.set(arn, topic)
    return topic
  }

  /**
   * Look up a topic by its ARN.
   *
   * @param {string} arn
   * @returns {Topic | undefined}
   */
  function getTopicByArn(arn) {
    return topics.get(arn)
  }

  /**
   * Look up a topic by its name.
   *
   * @param {string} name
   * @returns {Topic | undefined}
   */
  function getTopicByName(name) {
    for (const topic of topics.values()) {
      if (topic.name === name) return topic
    }
    return undefined
  }

  /**
   * List every topic record.
   *
   * @returns {Topic[]}
   */
  function listTopics() {
    return [...topics.values()]
  }

  /**
   * Remove a topic and every subscription attached to it.
   *
   * @param {string} arn
   * @returns {void}
   */
  function deleteTopic(arn) {
    topics.delete(arn)
    for (const [subArn, sub] of subscriptions) {
      if (sub.topicArn === arn) subscriptions.delete(subArn)
    }
  }

  /**
   * Compute the AWS-shaped topic attribute map.
   *
   * @param {string} arn
   * @returns {object}
   */
  function getTopicAttributes(arn) {
    const topic = topics.get(arn)
    if (!topic) return {}
    const subCount = listSubscriptionsByTopic(arn).length
    return {
      ...topic.attributes,
      TopicArn: topic.arn,
      DisplayName: topic.displayName ?? '',
      SubscriptionsConfirmed: String(subCount),
      SubscriptionsPending: '0',
      SubscriptionsDeleted: '0',
      FifoTopic: topic.fifo ? 'true' : 'false',
    }
  }

  /**
   * Set a single topic attribute. `DisplayName` updates the dedicated field;
   * any other name is stored in the topic's attribute bag.
   *
   * @param {string} arn
   * @param {string} name
   * @param {*} value
   * @returns {void}
   */
  function setTopicAttributes(arn, name, value) {
    const topic = topics.get(arn)
    if (!topic) return
    if (name === 'DisplayName') {
      topic.displayName = value
      return
    }
    topic.attributes[name] = value
  }

  /**
   * Create a subscription on a topic. The caller resolves and supplies the
   * `target` descriptor. Returns the synthesised subscription ARN
   * (`${topicArn}:${uuid}`).
   *
   * @param {string} topicArn
   * @param {{
   *   protocol: string,
   *   endpoint?: string,
   *   filterPolicy?: object | null,
   *   filterPolicyScope?: string,
   *   rawMessageDelivery?: boolean,
   *   target: Target,
   * }} options
   * @returns {string} the subscription ARN.
   */
  function subscribe(topicArn, options) {
    const {
      protocol,
      endpoint,
      filterPolicy = null,
      filterPolicyScope,
      rawMessageDelivery = false,
      target,
    } = options

    const arn = `${topicArn}:${randomUUID()}`
    /** @type {Subscription} */
    const subscription = {
      arn,
      topicArn,
      protocol,
      endpoint,
      filterPolicy,
      filterPolicyScope: filterPolicyScope ?? 'MessageAttributes',
      rawMessageDelivery,
      target,
    }
    subscriptions.set(arn, subscription)
    return arn
  }

  /**
   * Remove a subscription. Unknown ARNs are tolerated (no-op).
   *
   * @param {string} arn
   * @returns {void}
   */
  function unsubscribe(arn) {
    subscriptions.delete(arn)
  }

  /**
   * Look up a subscription by its ARN.
   *
   * @param {string} arn
   * @returns {Subscription | undefined}
   */
  function getSubscription(arn) {
    return subscriptions.get(arn)
  }

  /**
   * List every subscription across all topics.
   *
   * @returns {Subscription[]}
   */
  function listSubscriptions() {
    return [...subscriptions.values()]
  }

  /**
   * List the subscriptions attached to a single topic.
   *
   * @param {string} topicArn
   * @returns {Subscription[]}
   */
  function listSubscriptionsByTopic(topicArn) {
    return [...subscriptions.values()].filter(
      (sub) => sub.topicArn === topicArn,
    )
  }

  /**
   * Compute the AWS-shaped subscription attribute map. `FilterPolicy` is
   * serialised back to a JSON string (its wire form).
   *
   * @param {string} arn
   * @returns {object}
   */
  function getSubscriptionAttributes(arn) {
    const sub = subscriptions.get(arn)
    if (!sub) return {}
    const attrs = {
      SubscriptionArn: sub.arn,
      TopicArn: sub.topicArn,
      Protocol: sub.protocol,
      Endpoint: sub.endpoint ?? '',
      Owner: accountFromArn(sub.topicArn),
      RawMessageDelivery: sub.rawMessageDelivery ? 'true' : 'false',
      ConfirmationWasAuthenticated: 'true',
      PendingConfirmation: 'false',
    }
    if (sub.filterPolicy != null) {
      attrs.FilterPolicy = JSON.stringify(sub.filterPolicy)
      attrs.FilterPolicyScope = sub.filterPolicyScope
    }
    return attrs
  }

  /**
   * Set a single subscription attribute. `FilterPolicy` is parsed from its JSON
   * string form (an empty string clears it); `RawMessageDelivery` is coerced to
   * a boolean; `FilterPolicyScope` is stored verbatim.
   *
   * @param {string} arn
   * @param {string} name
   * @param {*} value
   * @returns {void}
   */
  function setSubscriptionAttributes(arn, name, value) {
    const sub = subscriptions.get(arn)
    if (!sub) return

    if (name === 'FilterPolicy') {
      sub.filterPolicy =
        value === '' || value == null ? null : parseMaybeJson(value)
      return
    }
    if (name === 'FilterPolicyScope') {
      sub.filterPolicyScope = value
      return
    }
    if (name === 'RawMessageDelivery') {
      sub.rawMessageDelivery = value === true || value === 'true'
    }
  }

  return {
    ensureTopic,
    getTopicByArn,
    getTopicByName,
    listTopics,
    deleteTopic,
    getTopicAttributes,
    setTopicAttributes,
    subscribe,
    unsubscribe,
    getSubscription,
    listSubscriptions,
    listSubscriptionsByTopic,
    getSubscriptionAttributes,
    setSubscriptionAttributes,
  }
}

/**
 * Derive a topic name from its ARN (the segment after the final `:`).
 *
 * @param {string} arn
 * @returns {string}
 */
function nameFromArn(arn) {
  const parts = String(arn).split(':')
  return parts[parts.length - 1]
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
 * Parse a value that may already be an object or may be a JSON string. A
 * non-JSON string is returned as-is.
 *
 * @param {*} value
 * @returns {*}
 */
function parseMaybeJson(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
