/**
 * ALB (Application Load Balancer) route loader for the offline app server.
 *
 * Walks `serverless.service.functions[*].events[].alb`, registers one Hapi
 * route per (method, path) pair on the shared appPort. ALB routes are
 * registered FIRST in the boot wiring so they win same-method-same-path
 * collisions against later REST + HTTP API registrations (Hapi resolves
 * by registration order).
 *
 * ALB matches literal paths only — no `{id}` templating. `listenerArn` and
 * `priority` from the YAML are silently ignored at runtime (no real ALB).
 */

import { NO_BODY_METHODS, toHapiMethod } from '../shared/hapi-helpers.js'
import { logHandlerError } from '../shared/handler-logging.js'
import { buildAlbEvent } from './event-factory.js'
import { formatAlbResponse } from './response-mapper.js'

/**
 * Hardcoded ALB target-group ARN used for every offline session. Byte-for-byte
 * stable so handlers that compare against the ARN see the same value across
 * runs.
 *
 * @type {string}
 */
const TARGET_GROUP_ARN =
  'arn:aws:elasticloadbalancing:us-east-1:550213415212:targetgroup/5811b5d6aff964cd50efa8596604c4e0/b49d49c443aa999f'

/**
 * Normalize an `events[].alb` entry to a list of `{ method, path }` pairs
 * (one per declared method). Defaults to a single `*` (Hapi catch-all)
 * when `conditions.method` is empty/absent. `conditions.path` accepts
 * string or single-element array.
 *
 * @param {object} albEvent
 * @returns {Array<{ method: string, path: string }>}
 */
function normalizeAlbEvent(albEvent) {
  if (!albEvent || typeof albEvent !== 'object') return []
  const conditions = albEvent.conditions
  if (!conditions || typeof conditions !== 'object') return []

  const rawPath = conditions.path
  const path = Array.isArray(rawPath) ? rawPath[0] : rawPath
  if (typeof path !== 'string' || path.length === 0) return []

  const rawMethods = conditions.method
  const methods =
    Array.isArray(rawMethods) && rawMethods.length > 0
      ? rawMethods.map((m) => String(m).toUpperCase())
      : ['*']

  return methods.map((method) => ({ method, path }))
}

/**
 * @param {object} args
 * @param {import('@hapi/hapi').Server} args.server
 * @param {object} args.serverless
 * @param {(functionKey: string, event: object) => Promise<unknown>} args.onRequest
 * @returns {{ method: string, path: string, functionKey: string }[]}
 */
export function registerAlbRoutes({ server, serverless, onRequest }) {
  const functions = serverless?.service?.functions ?? {}
  const targetGroupArn = TARGET_GROUP_ARN
  /** @type {{ method: string, path: string, functionKey: string }[]} */
  const registered = []

  for (const [functionKey, fn] of Object.entries(functions)) {
    for (const eventEntry of fn?.events ?? []) {
      if (!Object.prototype.hasOwnProperty.call(eventEntry, 'alb')) continue

      const pairs = normalizeAlbEvent(eventEntry.alb)
      for (const { method, path } of pairs) {
        const hapiMethod = toHapiMethod(method)

        // Hapi rejects payload settings on GET/HEAD/DELETE/OPTIONS/TRACE,
        // and on the catch-all `*` (which can match any of those). Only
        // attach payload config when the method definitely carries a body.
        const allowsBody =
          hapiMethod !== '*' && !NO_BODY_METHODS.has(hapiMethod)

        server.route({
          method: hapiMethod,
          path,
          options: allowsBody
            ? {
                payload: {
                  parse: true,
                  output: 'data',
                  maxBytes: 10 * 1024 * 1024,
                },
              }
            : {},
          async handler(request, h) {
            try {
              const event = buildAlbEvent({ request, targetGroupArn })
              const result = await onRequest(functionKey, event)
              return formatAlbResponse(result, h)
            } catch (err) {
              logHandlerError(serverless, functionKey, err)
              return h
                .response(JSON.stringify({ message: 'Internal server error' }))
                .code(502)
                .type('application/json')
            }
          },
        })

        registered.push({ method, path, functionKey })
      }
    }
  }

  return registered
}
