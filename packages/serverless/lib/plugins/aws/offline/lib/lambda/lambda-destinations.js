/**
 * Lambda asynchronous-invocation destination routing for sls offline.
 *
 * Real AWS Lambda, when a function is invoked asynchronously and the function
 * has an `onSuccess` / `onFailure` destination configured, builds an
 * "asynchronous invocation result" record after the invocation settles and
 * delivers it to the configured destination (an SQS queue, SNS topic, another
 * Lambda, or an EventBridge bus). This module reproduces that behaviour for the
 * local emulator.
 *
 * `createDestinationRouter` returns a `route(...)` that, given the settled
 * outcome of one async invocation, picks the matching destination
 * (`onFailure` when an error is present, otherwise `onSuccess`), resolves its
 * ARN to a local sink via the resource registry, and sends the destination
 * record. Each send is fire-and-forget: a rejected sink is logged but never
 * surfaced to the caller, mirroring how the synchronous event sources treat a
 * failing downstream.
 */

import { randomUUID } from 'node:crypto'
import {
  allSqsQueues,
  allSnsTopics,
  allLambdas,
} from '../provisioner/registry.js'

/**
 * Resolve a destination ARN to its sink kind and a resolved descriptor, using
 * the resource registry. Mirrors the EventBridge target resolution: a lambda /
 * sqs / sns ARN must match a provisioned record; an `events` `event-bus/` ARN
 * resolves to its bus name structurally. Anything else is `unsupported`.
 *
 * @param {string} arn
 * @param {object} registry
 * @returns {{ kind: string, resolved: object | null }}
 */
function resolveDestinationArn(arn, registry) {
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
 * Normalise a destination value to its ARN string. Accepts a bare ARN string
 * or an `{ arn }` object (the two shapes the provisioner may leave behind).
 *
 * @param {string | { arn?: string } | undefined | null} destination
 * @returns {string | null}
 */
function destinationArn(destination) {
  if (typeof destination === 'string') return destination
  if (destination && typeof destination.arn === 'string') return destination.arn
  return null
}

/**
 * Create a destination router bound to the resource registry and the four
 * sinks. The router holds no per-invocation state; it is created once at boot
 * and shared across every async invocation.
 *
 * @param {object} params
 * @param {object} params.registry - The local resource registry.
 * @param {(functionKey: string) => { invoke: Function }} params.getLambdaFunction
 * @param {(queueUrl: string, message: object) => unknown} params.queueSend
 * @param {(topicArn: string, body: string) => unknown} params.snsPublish
 * @param {(busName: string, event: object) => unknown} params.ebPutEvents
 * @param {{ debug: Function, error: Function }} params.logger
 * @param {() => string} [params.now] - Injectable ISO-timestamp source (tests).
 * @param {() => string} [params.uuid] - Injectable request-id source (tests).
 * @returns {{ route: (outcome: object) => Promise<void> }}
 */
export function createDestinationRouter({
  registry,
  getLambdaFunction,
  queueSend,
  snsPublish,
  ebPutEvents,
  logger,
  now = () => new Date().toISOString(),
  uuid = () => randomUUID(),
}) {
  /**
   * Build the AWS asynchronous-invocation result record.
   *
   * @param {object} params
   * @param {string} params.functionArn
   * @param {unknown} params.event
   * @param {unknown} params.result
   * @param {Error | undefined} params.error
   * @returns {{ record: object, condition: string }}
   */
  function buildRecord({ functionArn, event, result, error }) {
    const condition = error ? 'RetriesExhausted' : 'Success'
    const record = {
      version: '1.0',
      timestamp: now(),
      requestContext: {
        requestId: uuid(),
        functionArn,
        condition,
        approximateInvokeCount: 1,
      },
      requestPayload: event,
      responseContext: {
        statusCode: 200,
        executedVersion: '$LATEST',
        functionError: error ? 'Unhandled' : undefined,
      },
      responsePayload: error
        ? { errorType: error.name, errorMessage: error.message }
        : (result ?? null),
    }
    return { record, condition }
  }

  /**
   * Route the settled outcome of one async invocation to its destination.
   *
   * @param {object} outcome
   * @param {string} outcome.functionName - The deployed function name (logging).
   * @param {string} outcome.functionArn  - The deployed function ARN.
   * @param {{ onSuccess?: unknown, onFailure?: unknown } | undefined} outcome.destinations
   * @param {unknown} outcome.event   - The invocation event (requestPayload).
   * @param {unknown} [outcome.result] - The handler result (success only).
   * @param {Error} [outcome.error]    - The invocation error (failure only).
   * @returns {Promise<void>}
   */
  async function route({
    functionName,
    functionArn,
    destinations,
    event,
    result,
    error,
  }) {
    if (!destinations) return

    const destination = error ? destinations.onFailure : destinations.onSuccess
    const arn = destinationArn(destination)
    if (!arn) return

    const { record, condition } = buildRecord({
      functionArn,
      event,
      result,
      error,
    })

    const { kind, resolved } = resolveDestinationArn(arn, registry)
    const body = JSON.stringify(record)

    switch (kind) {
      case 'sqs':
        await Promise.resolve(queueSend(resolved.queueUrl, { body })).catch(
          logger.error,
        )
        return

      case 'sns':
        await Promise.resolve(snsPublish(resolved.topicArn, body)).catch(
          logger.error,
        )
        return

      case 'eventbus':
        await Promise.resolve(
          ebPutEvents(resolved.busName, {
            source: 'lambda',
            'detail-type': `Lambda Function Invocation Result - ${condition}`,
            detail: record,
          }),
        ).catch(logger.error)
        return

      case 'lambda':
        await Promise.resolve(
          getLambdaFunction(resolved.functionKey).invoke(record, {
            async: true,
          }),
        ).catch(logger.error)
        return

      default:
        logger.debug(
          `Lambda destination "${arn}" for function "${functionName}" is not a ` +
            'provisioned sink in offline; skipping.',
        )
    }
  }

  return { route }
}
