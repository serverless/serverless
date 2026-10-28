import crypto from 'crypto'
import _ from 'lodash'
import { log } from '@serverless/util'
import ServerlessError from '../../../../../../serverless-error.js'
import resolveLambdaTarget from '../../../../utils/resolve-lambda-target.js'
import { parseEventBusArn } from './bus-type.js'
import { compileFilterPattern } from './subscriber-pattern.js'

const MAX_SYNC_INVOCATION_TIMEOUT_SECONDS = 30

// Classic rule keys a Custom Event Bus subscriber has no equivalent for.
const RULE_ONLY_KEYS = ['schedule', 'input', 'inputPath', 'inputTransformer']

// Keys that only a Custom Event Bus subscriber understands.
const SUBSCRIBER_ONLY_KEYS = [
  'ordering',
  'batchSize',
  'maximumBatchingWindow',
  'async',
  'resumePosition',
  'role',
]

const isFifo = (event) =>
  typeof event.ordering === 'string' && event.ordering.toLowerCase() === 'fifo'

/**
 * Checks one `eventBridge` event on a Custom Event Bus before it is compiled
 * into a subscriber. Throws on the first setting a subscriber can't take and
 * warns when a synchronous subscriber can outlive EventBridge's invocation
 * wait.
 */
export const validateSubscriberEvent = ({
  functionKey,
  functionObj,
  event,
  providerRegion,
  useCloudFormation,
}) => {
  if (useCloudFormation === false) {
    throw new ServerlessError(
      `Function "${functionKey}": a Custom Event Bus subscriber is deployed only with native CloudFormation. Remove "provider.eventBridge.useCloudFormation: false".`,
      'EVENTBRIDGE_SUBSCRIBER_REQUIRES_CLOUDFORMATION',
    )
  }

  const unsupportedKey = RULE_ONLY_KEYS.find((key) => event[key] !== undefined)
  if (unsupportedKey) {
    throw new ServerlessError(
      `Function "${functionKey}": "${unsupportedKey}" applies to Classic rules only and has no equivalent on a Custom Event Bus. ${
        unsupportedKey === 'schedule'
          ? 'Use a "schedule" event for a scheduled invocation.'
          : 'Reshape the event in your handler.'
      }`,
      'EVENTBRIDGE_SUBSCRIBER_UNSUPPORTED_PROPERTY',
    )
  }

  const { timeout } = functionObj
  if (isFifo(event)) {
    if (event.async === true) {
      throw new ServerlessError(
        `Function "${functionKey}": a FIFO subscriber delivers in order only when it waits for the function. Remove "async: true" or set "ordering: unordered".`,
        'EVENTBRIDGE_SUBSCRIBER_FIFO_ASYNC',
      )
    }
    if (timeout > MAX_SYNC_INVOCATION_TIMEOUT_SECONDS) {
      throw new ServerlessError(
        `Function "${functionKey}" has a ${timeout}s timeout, but EventBridge waits at most 30s for an ordered subscriber and then retries while the first invocation is still running, which breaks the order. Set the function timeout to 30s or less.`,
        'EVENTBRIDGE_SUBSCRIBER_FIFO_TIMEOUT',
      )
    }
  }

  // Only a literal ARN names its Region; CloudFormation validates the rest.
  const busArn = parseEventBusArn(event.eventBus)
  if (busArn && busArn.region !== providerRegion) {
    throw new ServerlessError(
      `Function "${functionKey}": the event bus is in ${busArn.region}, but this service deploys to ${providerRegion}. A subscriber must be in its bus's Region.`,
      'EVENTBRIDGE_SUBSCRIBER_REGION_MISMATCH',
    )
  }

  if (
    !isFifo(event) &&
    event.async !== true &&
    timeout > MAX_SYNC_INVOCATION_TIMEOUT_SECONDS
  ) {
    log.warning(
      `Function "${functionKey}" has a ${timeout}s timeout, but EventBridge waits at most 30s for a synchronous subscriber and retries after that, so one event can run concurrently more than once. Set the function timeout to 30s or less, or set "async: true".`,
    )
  }
}

const describeEventBus = (eventBus) => {
  if (typeof eventBus === 'string') return eventBus
  if (eventBus === undefined) return 'default'
  return JSON.stringify(eventBus)
}

/**
 * Checks one `eventBridge` event on a Classic event bus before it is
 * compiled into a rule.
 */
export const validateRuleEvent = ({ functionKey, event, patternKeys }) => {
  const subscriberKey = SUBSCRIBER_ONLY_KEYS.find(
    (key) => event[key] !== undefined,
  )
  if (subscriberKey) {
    throw new ServerlessError(
      `Function "${functionKey}": "${subscriberKey}" applies to Custom Event Bus subscribers only, and the Framework treats "${describeEventBus(event.eventBus)}" as a Classic event bus.`,
      'EVENTBRIDGE_RULE_UNSUPPORTED_PROPERTY',
    )
  }

  if (event.pattern === undefined && event.schedule === undefined) {
    throw new ServerlessError(
      `Function "${functionKey}": an eventBridge event on a Classic event bus needs "pattern" or "schedule".`,
      'EVENTBRIDGE_RULE_PATTERN_OR_SCHEDULE_REQUIRED',
    )
  }

  // The schema accepts any Ref as a possible Custom Event Bus, so a Ref that
  // turns out to be Classic gets the rule checks the schema would have applied.
  if (!_.isPlainObject(event.eventBus) || event.eventBus.Ref === undefined)
    return
  if (typeof event.name === 'string' && event.name.length > 64) {
    throw new ServerlessError(
      `Function "${functionKey}": the eventBridge rule name "${event.name}" is ${event.name.length} characters long; a Classic rule name takes up to 64.`,
      'EVENTBRIDGE_RULE_NAME_TOO_LONG',
    )
  }
  if (patternKeys && _.isPlainObject(event.pattern)) {
    const unknownKey = Object.keys(event.pattern).find(
      (key) => !patternKeys.includes(key),
    )
    if (unknownKey) {
      log.warning(
        `Function "${functionKey}": the eventBridge pattern key "${unknownKey}" is not a field of a Classic event, so the rule matches no events. Check its spelling.`,
      )
    }
  }
}

const sortKeysDeep = (value) => {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])]),
    )
  }
  return value
}

// The hash covers only the properties that force a subscriber replacement,
// so editing anything else keeps the logical ID and the subscriber name.
export const computeSubscriberHash = ({ eventBus, target, type }) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(sortKeysDeep({ eventBus, target, type })))
    .digest('hex')
    .slice(0, 8)

export const buildSubscriber = ({
  naming,
  functionName,
  functionObj,
  event,
  index,
  deliveryRoleLogicalId,
}) => {
  const type = event.ordering ? event.ordering.toUpperCase() : 'UNORDERED'
  const target = resolveLambdaTarget(functionName, functionObj)
  const hash = computeSubscriberHash({ eventBus: event.eventBus, target, type })

  const logicalId = event.name
    ? naming.getEventBridgeSubscriberLogicalIdFromName(event.name)
    : naming.getEventBridgeSubscriberLogicalId(functionName, index, hash)
  // CloudFormation caps logical IDs at 255 characters; a long custom name can exceed it.
  if (logicalId.length > 255) {
    throw new ServerlessError(
      `Function "${functionName}": the eventBridge subscriber name "${event.name}" makes the CloudFormation logical ID ${logicalId.length} characters long, over the limit of 255. Use a shorter name.`,
      'EVENTBRIDGE_SUBSCRIBER_NAME_TOO_LONG',
    )
  }
  const name =
    event.name ||
    naming.getEventBridgeSubscriberName(functionObj.name, index, hash)

  const properties = {
    EventBusArn: event.eventBus,
    Name: name,
  }
  if (event.description !== undefined) {
    properties.Description = event.description
  }
  if (event.pattern !== undefined) {
    properties.FilterConfiguration = {
      Filters: [
        { Scope: 'DATA', Pattern: compileFilterPattern(event.pattern) },
      ],
    }
  }
  properties.Type = type

  if (
    event.batchSize !== undefined ||
    event.maximumBatchingWindow !== undefined
  ) {
    properties.BatchConfiguration = {}
    if (event.batchSize !== undefined) {
      properties.BatchConfiguration.MaxBatchSize = event.batchSize
    }
    if (event.maximumBatchingWindow !== undefined) {
      properties.BatchConfiguration.MaxBatchWindowInSeconds =
        event.maximumBatchingWindow
    }
  }

  const retryPolicy = {}
  if (event.retryPolicy?.maximumRetryAttempts !== undefined) {
    retryPolicy.MaxRetryAttempts = event.retryPolicy.maximumRetryAttempts
  }
  if (event.retryPolicy?.maximumEventAge !== undefined) {
    retryPolicy.MaxEventAgeInSeconds = event.retryPolicy.maximumEventAge
  }
  if (Object.keys(retryPolicy).length) properties.RetryPolicy = retryPolicy

  if (event.deadLetterQueueArn !== undefined) {
    properties.OnFailureConfiguration = { Arn: event.deadLetterQueueArn }
  }
  // Always explicit, as Classic rules set ENABLED: resumePosition applies only when an update sets STOPPED back to RUNNING.
  properties.State = event.enabled === false ? 'STOPPED' : 'RUNNING'
  if (event.resumePosition !== undefined) {
    properties.ResumePosition = event.resumePosition.toUpperCase()
  }

  properties.InvokeConfiguration = {
    TargetArn: target,
    RoleArn: event.role ?? { 'Fn::GetAtt': [deliveryRoleLogicalId, 'Arn'] },
    LambdaParameters: event.async
      ? { InvocationType: 'EVENT' }
      : {
          InvocationType: 'REQUEST_RESPONSE',
          InvocationTimeoutSeconds: String(
            Math.min(functionObj.timeout, MAX_SYNC_INVOCATION_TIMEOUT_SECONDS),
          ),
        },
  }

  const resource = { Type: 'AWS::EventsV2::Subscriber', Properties: properties }
  if (functionObj.targetAlias?.logicalId) {
    resource.DependsOn = functionObj.targetAlias.logicalId
  }

  return { logicalId, resource, usesGeneratedRole: !event.role }
}
