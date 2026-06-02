/**
 * ALB (Application Load Balancer) route loader for the offline app server.
 *
 * Walks `serverless.service.functions[*].events[].alb`, registers one Hapi
 * route per (method, path) pair on the dedicated ALB server (its own
 * `albPort`, separate from the REST/HTTP-API server) — matching how the
 * community serverless-offline plugin binds ALB to its own port. Because ALB
 * has its own server, its routes never collide with REST/HTTP API routes.
 *
 * Real ALB path-pattern conditions treat a `*` segment as a wildcard, so a
 * `conditions.path` whose segments include `*` is translated to the
 * equivalent Hapi capture (see `toHapiAlbPath`); non-wildcard paths still
 * match literally. `listenerArn` and `priority` from the YAML are silently
 * ignored at runtime (no real ALB).
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
 * Normalize an `events[].alb` entry to a list of `{ method, path,
 * multiValueHeaders }` tuples (one per declared method). Defaults to a single
 * `*` (Hapi catch-all) when `conditions.method` is empty/absent.
 * `conditions.path` accepts string or single-element array. The
 * `multiValueHeaders` flag (default false) mirrors the target group's
 * `lambda.multi_value_headers.enabled` attribute and selects which header /
 * query variant the Lambda event carries.
 *
 * @param {object} albEvent
 * @returns {Array<{ method: string, path: string, multiValueHeaders: boolean }>}
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

  const multiValueHeaders = albEvent.multiValueHeaders === true

  return methods.map((method) => ({ method, path, multiValueHeaders }))
}

/**
 * Translate an ALB `conditions.path` into the equivalent Hapi route path.
 *
 * ALB path patterns treat a wildcard star that occupies a complete path
 * SEGMENT (i.e. the whole segment between two slashes) as a wildcard:
 *  - A TRAILING wildcard segment becomes a Hapi catch-all that matches the
 *    segment itself plus any deeper path: "/proxy/<star>" maps to
 *    "/proxy/{albProxy*}" (matches "/proxy", "/proxy/a", "/proxy/a/b/c"); a
 *    bare "/<star>" maps to "/{albProxy*}".
 *  - An INTERIOR wildcard segment becomes a single-segment param with an
 *    incrementing index: "/a/<star>/b" maps to "/a/{alb0}/b", and
 *    "/a/<star>/<star>/b" maps to "/a/{alb0}/{alb1}/b". Interior wildcards
 *    preceding a trailing catch-all keep incrementing: "/a/<star>/b/<star>"
 *    maps to "/a/{alb0}/b/{albProxy*}".
 *  - A path with no wildcard segment is returned unchanged.
 *
 * Only a segment that is exactly the wildcard star is treated as a wildcard.
 * A segment that merely contains a glob (e.g. "proxy<star>") is out of scope
 * and is left unchanged — no char-level translation is attempted.
 *
 * @param {string} path  The declared ALB path (e.g. `/proxy/*`).
 * @returns {string}  The Hapi route path.
 */
function toHapiAlbPath(path) {
  const segments = path.split('/')
  const lastIndex = segments.length - 1
  let interiorCount = 0

  return segments
    .map((segment, index) => {
      if (segment !== '*') return segment
      if (index === lastIndex) return '{albProxy*}'
      return `{alb${interiorCount++}}`
    })
    .join('/')
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
      for (const { method, path, multiValueHeaders } of pairs) {
        const hapiMethod = toHapiMethod(method)

        // Hapi rejects payload settings on GET/HEAD/DELETE/OPTIONS/TRACE,
        // and on the catch-all `*` (which can match any of those). Only
        // attach payload config when the method definitely carries a body.
        const allowsBody =
          hapiMethod !== '*' && !NO_BODY_METHODS.has(hapiMethod)

        server.route({
          method: hapiMethod,
          path: toHapiAlbPath(path),
          // parse:false hands the handler the raw request body as a Buffer (or
          // null when no body was sent). ALB delivers the body to Lambda
          // byte-for-byte, so the event factory must see the original bytes
          // rather than a JSON object Hapi re-serializes — that is what
          // preserves webhook signatures computed over the raw payload.
          options: allowsBody
            ? {
                payload: {
                  parse: false,
                  output: 'data',
                  maxBytes: 10 * 1024 * 1024,
                },
              }
            : {},
          async handler(request, h) {
            try {
              const event = buildAlbEvent({
                request,
                targetGroupArn,
                multiValueHeaders,
              })
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
