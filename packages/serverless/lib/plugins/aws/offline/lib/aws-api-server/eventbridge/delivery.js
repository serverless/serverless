/**
 * EventBridge PutEvents fan-out for sls offline.
 *
 * `deliver(busName, event)` walks every ENABLED rule on the bus whose
 * `eventPattern` matches the event (via the rule engine) and dispatches each of
 * the rule's targets. A target's input is reshaped first (input-transform.js),
 * then routed by its resolved `kind`:
 *
 *   - `lambda`   → invoke the function (async; a rejection is logged, never
 *     surfaced to the publisher — fire-and-forget, mirroring the SNS/SQS sources).
 *   - `sqs`      → send the (stringified) payload to the local queue store.
 *   - `sns`      → publish the (stringified) payload to the local topic store.
 *   - `eventbus` → re-deliver to the target bus, guarded by a recursion-depth
 *     limit so a self- or mutually-referential cross-bus chain cannot loop
 *     forever.
 *   - `unsupported` → a one-time debug note per delivery run, then skip.
 *
 * Schedule-only rules (a rule with no `eventPattern`, only a
 * `scheduleExpression`) are NOT fired by PutEvents — they are driven by the
 * scheduler, not by event matching. Each target is dispatched independently
 * inside its own try/catch, so one failing target never blocks its siblings.
 */

import { matchesEventPattern } from './rule-engine.js'
import { applyInputTransform } from './input-transform.js'

/** Default cross-bus recursion ceiling. */
const DEFAULT_MAX_DEPTH = 3

/**
 * Create an EventBridge deliverer bound to the bus store, the Lambda facade
 * lookup, the SQS queue store, and the SNS publish seam.
 *
 * @param {object} params
 * @param {ReturnType<import('./bus-store.js').createBusStore>} params.store
 * @param {(functionKey: string) => { invoke: Function }} params.getLambdaFunction
 * @param {{ send: (url: string, payload: object) => unknown }} params.queueStore
 * @param {(topicArn: string, message: string) => unknown} params.snsPublish
 * @param {{ debug: Function, error: Function }} params.logger
 * @param {number} [params.maxDepth] - Cross-bus recursion ceiling (default 3).
 * @returns {{ deliver: (busName: string, event: object, depth?: number) => Promise<void> }}
 */
export function createEbDeliverer({
  store,
  getLambdaFunction,
  queueStore,
  snsPublish,
  logger,
  maxDepth = DEFAULT_MAX_DEPTH,
}) {
  /**
   * Fan an event out to every matching, enabled rule on a bus.
   *
   * @param {string} busName
   * @param {object} event
   * @param {number} [depth] - Current cross-bus recursion depth.
   * @returns {Promise<void>}
   */
  async function deliver(busName, event, depth = 0) {
    // One-time debug note per delivery run for unsupported target kinds.
    const warnedUnsupported = new Set()

    for (const ruleMeta of store.listRules(busName)) {
      if (ruleMeta.state !== 'ENABLED') continue

      // Schedule-only rules (no event pattern) are not fired by PutEvents.
      if (ruleMeta.eventPattern == null) continue
      if (!matchesEventPattern(ruleMeta.eventPattern, event)) continue

      for (const target of store.listTargetsByRule(busName, ruleMeta.name)) {
        try {
          await dispatchTarget(target, event, depth, warnedUnsupported, {
            ruleArn: ruleMeta.arn,
            ruleName: ruleMeta.name,
          })
        } catch (err) {
          logger.error(
            `EventBridge delivery to target "${target.id}" on rule ` +
              `"${ruleMeta.name}" failed: ${err.message}`,
          )
        }
      }
    }
  }

  /**
   * Reshape the event for a single target and route it to its sink.
   *
   * @param {import('./bus-store.js').Target} target
   * @param {object} event
   * @param {number} depth
   * @param {Set<string>} warnedUnsupported
   * @param {{ ruleArn?: string, ruleName?: string }} ruleContext - The
   *   delivering rule's metadata, fed to the InputTransformer reserved vars.
   * @returns {Promise<void>}
   */
  async function dispatchTarget(
    target,
    event,
    depth,
    warnedUnsupported,
    ruleContext,
  ) {
    const payload = applyInputTransform(
      event,
      {
        input: target.input,
        inputPath: target.inputPath,
        inputTransformer: target.inputTransformer,
      },
      ruleContext,
    )

    switch (target.kind) {
      case 'lambda':
        // Fire-and-forget: a rejected invoke is logged, never surfaced to the
        // publisher, so one slow/failing target cannot block the response.
        Promise.resolve(
          getLambdaFunction(target.resolved.functionKey).invoke(payload, {
            async: true,
          }),
        ).catch((err) => {
          logger.error(
            `EventBridge lambda target "${target.resolved.functionKey}" ` +
              `failed: ${err.message}`,
          )
        })
        return

      case 'sqs':
        queueStore.send(target.resolved.queueUrl, {
          body: stringifyPayload(payload),
          messageAttributes: {},
        })
        return

      case 'sns':
        snsPublish(target.resolved.topicArn, stringifyPayload(payload))
        return

      case 'eventbus':
        if (depth >= maxDepth) {
          logger.debug(
            `EventBridge cross-bus delivery to "${target.resolved.busName}" ` +
              `exceeded the max depth of ${maxDepth}; skipping to avoid a loop.`,
          )
          return
        }
        await deliver(target.resolved.busName, event, depth + 1)
        return

      default:
        if (!warnedUnsupported.has(target.kind)) {
          warnedUnsupported.add(target.kind)
          logger.debug(
            `EventBridge target kind "${target.kind}" is not delivered in ` +
              'offline; skipping.',
          )
        }
    }
  }

  return { deliver }
}

/**
 * A string payload is delivered verbatim; anything else is serialized to JSON
 * for the byte-oriented SQS/SNS sinks.
 *
 * @param {unknown} payload
 * @returns {string}
 */
function stringifyPayload(payload) {
  return typeof payload === 'string' ? payload : JSON.stringify(payload)
}
