/**
 * Boot-time SNS wiring for sls offline.
 *
 * Pure provisioning: derives the set of topics and subscriptions the emulator
 * should hold from three sources, then populates the topic store. Delivery is
 * driven separately (the deliverer reads the same store), so this module never
 * touches the SQS queue store or the Lambda facade — it only resolves the
 * `target` descriptor each subscription carries, using the registry.
 *
 * Sources, in order:
 *  1. Every provisioned `AWS::SNS::Topic` in the registry → `ensureTopic`.
 *  2. Each function's `events: - sns` (string name/ARN or object) → a `lambda`
 *     subscription, ensuring the referenced topic exists.
 *  3. Each `AWS::SNS::Subscription` in the compiled template whose `TopicArn`
 *     and `Endpoint` resolved to literal strings → a subscription with the
 *     target resolved from the endpoint ARN. A subscription that still carries
 *     an unresolved intrinsic is skipped with a warning.
 */

import { arnFor } from '../provisioner/arn-synth.js'
import {
  allSnsTopics,
  allLambdas,
  allSqsQueues,
} from '../provisioner/registry.js'

/**
 * Populate the topic store with topics and subscriptions derived from the
 * service definition + registry.
 *
 * @param {object} params
 * @param {object} params.serverless - The Serverless instance.
 * @param {ReturnType<import('../provisioner/registry.js').createRegistry>} params.registry
 * @param {ReturnType<import('../aws-api-server/sns/topic-store.js').createTopicStore>} params.store
 * @param {{ warning: Function }} params.logger
 * @returns {{ topicCount: number, subscriptionCount: number }}
 */
export function wireSns({ serverless, registry, store, logger }) {
  // 1. Ensure every provisioned topic exists in the store.
  for (const topic of allSnsTopics(registry)) {
    store.ensureTopic(topic.arn, {
      name: topic.name,
      fifo: isFifoName(topic.name),
    })
  }

  let subscriptionCount = 0

  // 2. Lambda subscriptions derived from `events: - sns`.
  const functions = serverless.service.functions ?? {}
  for (const [functionKey, fn] of Object.entries(functions)) {
    for (const event of fn?.events ?? []) {
      if (!event || event.sns === undefined) continue

      const topicArn = ensureTopicForEvent(event.sns, store)
      if (!topicArn) continue

      const { filterPolicy, filterPolicyScope } =
        typeof event.sns === 'object' ? event.sns : {}

      store.subscribe(topicArn, {
        protocol: 'lambda',
        endpoint: arnFor('lambda', functionKey),
        filterPolicy,
        filterPolicyScope,
        target: { kind: 'lambda', functionKey },
      })
      subscriptionCount += 1
    }
  }

  // 3. Subscriptions declared as `AWS::SNS::Subscription` resources.
  const resources =
    serverless.service.provider?.compiledCloudFormationTemplate?.Resources ?? {}
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (resource?.Type !== 'AWS::SNS::Subscription') continue

    const properties = resource.Properties ?? {}
    const { TopicArn, Endpoint, Protocol } = properties

    // A literal subscription needs both endpoints resolved to plain strings.
    // An intrinsic that survived compilation (a `Ref`/`Fn::GetAtt` object)
    // cannot be wired offline — skip it with a warning rather than guessing.
    if (typeof TopicArn !== 'string' || typeof Endpoint !== 'string') {
      logger.warning(
        `SNS subscription "${logicalId}" has an unresolved TopicArn or Endpoint; ` +
          'skipping (offline cannot resolve CloudFormation intrinsics for it).',
      )
      continue
    }

    store.ensureTopic(TopicArn, { fifo: isFifoName(TopicArn) })
    store.subscribe(TopicArn, {
      protocol: Protocol,
      endpoint: Endpoint,
      filterPolicy: properties.FilterPolicy,
      rawMessageDelivery: toBool(properties.RawMessageDelivery),
      target: resolveTarget(Protocol, Endpoint, registry),
    })
    subscriptionCount += 1
  }

  return { topicCount: store.listTopics().length, subscriptionCount }
}

/**
 * Resolve (and ensure) the topic ARN an `events: - sns` entry refers to. A
 * string starting `arn:` is used as-is; any other string is a topic name; an
 * object carries `arn` or `topicName`. Returns the topic ARN, or `undefined`
 * when the entry names no topic (e.g. an object with only an intrinsic `arn`).
 *
 * @param {string|object} sns
 * @param {ReturnType<import('../aws-api-server/sns/topic-store.js').createTopicStore>} store
 * @returns {string|undefined}
 */
function ensureTopicForEvent(sns, store) {
  if (typeof sns === 'string') {
    if (sns.startsWith('arn:')) {
      store.ensureTopic(sns, { fifo: isFifoName(sns) })
      return sns
    }
    const arn = arnFor('sns', sns)
    store.ensureTopic(arn, { name: sns, fifo: isFifoName(sns) })
    return arn
  }

  if (sns && typeof sns === 'object') {
    if (typeof sns.arn === 'string') {
      store.ensureTopic(sns.arn, { fifo: isFifoName(sns.arn) })
      return sns.arn
    }
    if (typeof sns.topicName === 'string') {
      const arn = arnFor('sns', sns.topicName)
      store.ensureTopic(arn, {
        name: sns.topicName,
        fifo: isFifoName(sns.topicName),
      })
      return arn
    }
  }

  return undefined
}

/**
 * Resolve a subscription endpoint ARN to a delivery target descriptor — the
 * same resolution the SNS `Subscribe` op uses. A `lambda` endpoint matches a
 * registered Lambda by ARN; an `sqs` endpoint matches a registered queue by
 * ARN. Anything else (or an ARN that matches nothing) is `unsupported` so the
 * subscription is still stored.
 *
 * @param {string} protocol
 * @param {string} endpoint
 * @param {ReturnType<import('../provisioner/registry.js').createRegistry>} registry
 * @returns {import('../aws-api-server/sns/topic-store.js').Target}
 */
function resolveTarget(protocol, endpoint, registry) {
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
 * A topic or ARN whose name ends in `.fifo` is a FIFO topic.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isFifoName(value) {
  return String(value).endsWith('.fifo')
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
