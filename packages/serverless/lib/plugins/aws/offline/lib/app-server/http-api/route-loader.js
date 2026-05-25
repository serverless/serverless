/**
 * HTTP API route loader for the offline app server.
 *
 * Walks `serverless.service.functions[*].events[].httpApi`, translates AWS
 * API Gateway path templates to Hapi path syntax, and registers Hapi route
 * handlers for each HTTP API event.
 */

import { buildHttpApiV2Event } from './event-factory.js'
import {
  normalizeCorsConfig,
  buildCorsOptionsRoute,
  applyCorsResponseHeaders,
} from '../shared/cors-options.js'
import {
  NO_BODY_METHODS,
  toHapiMethod,
  normalizeHttpEvent,
} from '../shared/hapi-helpers.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Translate an APIGW path template to a Hapi path template.
 *
 * APIGW greedy proxy `{proxy+}` maps to Hapi catch-all `{proxy*}`.
 * All other `{param}` placeholders are identical in both syntaxes.
 *
 * @param {string} apigwPath  The original APIGW path (e.g. `/api/{proxy+}`).
 * @returns {string}  The Hapi path (e.g. `/api/{proxy*}`).
 */
function toHapiPath(apigwPath) {
  // Bare '*' is the APIGW catch-all path shorthand; translate to Hapi's form.
  if (apigwPath === '*') return '/{any*}'
  // Use {proxy*} (Hapi accepts the name) so the matched value lands at request.params.proxy, matching the APIGW event.pathParameters.proxy contract.
  return apigwPath.replace(/\{proxy\+\}/g, '{proxy*}')
}

/**
 * Translate an AWS Lambda HTTP API v2 response to a Hapi response object.
 *
 * Supported result shapes:
 *  - `null` / `undefined`                     → 200, empty body
 *  - `string`                                 → 200, text/plain
 *  - Plain object without `statusCode`        → 200, JSON-serialized, application/json
 *  - Shaped object `{ statusCode, body, headers?, multiValueHeaders?, cookies?, isBase64Encoded? }`
 *
 * @param {unknown} result       The value returned by the Lambda handler.
 * @param {import('@hapi/hapi').ResponseToolkit} h  Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
function formatLambdaResponseAsHapi(result, h) {
  // null / undefined → empty 200
  if (result === null || result === undefined) {
    return h.response('').code(200)
  }

  // Plain string → 200 text/plain
  if (typeof result === 'string') {
    return h.response(result).code(200).type('text/plain')
  }

  // Object without statusCode → 200 application/json
  if (typeof result === 'object' && result.statusCode === undefined) {
    return h.response(JSON.stringify(result)).code(200).type('application/json')
  }

  // Shaped Lambda response
  const {
    statusCode,
    body,
    headers,
    multiValueHeaders,
    cookies,
    isBase64Encoded,
  } = result

  // Guard: if body is present and not a string and not base64 binary, the
  // handler returned a non-stringified object. Real APIGW returns 502 in this
  // case rather than silently coercing the body.
  if (
    body !== undefined &&
    body !== null &&
    typeof body !== 'string' &&
    isBase64Encoded !== true
  ) {
    return h
      .response(
        JSON.stringify({
          message: 'Internal server error',
        }),
      )
      .code(502)
      .type('application/json')
  }

  let responseBody = body ?? ''

  if (isBase64Encoded === true && typeof responseBody === 'string') {
    responseBody = Buffer.from(responseBody, 'base64')
  }

  const response = h.response(responseBody).code(statusCode)

  if (headers) {
    for (const [name, value] of Object.entries(headers)) {
      response.header(name, value)
    }
  }

  // multiValueHeaders carries one or more values per header name and is
  // appended after `headers` so handlers can mix the two shapes — single
  // values via `headers`, repeated values via `multiValueHeaders`.
  if (multiValueHeaders) {
    for (const [name, values] of Object.entries(multiValueHeaders)) {
      if (!Array.isArray(values)) continue
      for (const value of values) {
        response.header(name, value, { append: true })
      }
    }
  }

  if (Array.isArray(cookies)) {
    for (const cookie of cookies) {
      response.header('set-cookie', cookie, { append: true })
    }
  }

  return response
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register HTTP API routes on a Hapi server instance.
 *
 * Walks `serverless.service.functions`, finds all `httpApi` events, translates
 * APIGW paths to Hapi paths, and registers a Hapi route handler for each one.
 * The handler builds an APIGW HTTP API v2.0 event via `buildHttpApiV2Event`
 * and forwards it to `onRequest`.
 *
 * Route registration must happen before `server.start()`.
 *
 * @param {object} opts
 * @param {import('@hapi/hapi').Server} opts.server
 *   A Hapi server instance (started or unstarted).
 * @param {object} opts.serverless
 *   Framework's serverless instance. `service.functions` is walked.
 * @param {string} opts.stage
 *   API Gateway stage name (e.g. `'dev'`).
 * @param {string} opts.domainName
 *   Host and port string (e.g. `'localhost:3000'`).
 * @param {(functionKey: string, event: object) => Promise<unknown>} opts.onRequest
 *   Async callback invoked for every incoming HTTP request. Receives the
 *   function key and the APIGW v2.0 event; returns the Lambda response shape.
 *
 * @returns {{ method: string, path: string, functionKey: string }[]}
 *   The list of routes that were registered (in declaration order). Consumed
 *   by the boot-diagnostics summary that prints the route table.
 */
export function registerHttpApiRoutes({
  server,
  serverless,
  stage,
  domainName,
  onRequest,
}) {
  const functions = serverless.service.functions ?? {}
  /** @type {{ method: string, path: string, functionKey: string }[]} */
  const registered = []

  // Provider-wide CORS configuration (closes audit #16). When set, one
  // OPTIONS preflight handler is synthesized per registered HTTP API path
  // — real APIGW does the same for any HTTP API with CORS enabled.
  const httpApiCorsConfig = normalizeCorsConfig(
    serverless.service.provider?.httpApi?.cors,
  )
  const corsMounted = new Set()

  for (const [functionKey, fn] of Object.entries(functions)) {
    const events = fn.events ?? []

    for (const eventEntry of events) {
      if (!Object.prototype.hasOwnProperty.call(eventEntry, 'httpApi')) continue

      const { method: rawMethod, path: apigwPath } = normalizeHttpEvent(
        eventEntry.httpApi,
      )
      const operationName =
        typeof eventEntry.httpApi === 'object'
          ? eventEntry.httpApi.operationName
          : undefined

      const hapiMethod = toHapiMethod(rawMethod)
      const hapiPath = toHapiPath(apigwPath)

      // Capture for the closure — `apigwPath` is used in the event factory so
      // `routeKey` reflects the original APIGW template.
      const routeMeta = {
        method: rawMethod,
        path: apigwPath,
        functionName: functionKey,
        ...(operationName !== undefined ? { operationName } : {}),
      }

      // Hapi rejects payload options on GET / HEAD routes.  For wildcard ('*')
      // we include payload options because some methods on that route can carry
      // a body; GET will simply not parse anything.
      const payloadOptions =
        hapiMethod === '*' || !NO_BODY_METHODS.has(hapiMethod)
          ? {
              payload: {
                parse: true,
                output: 'data',
                maxBytes: 10 * 1024 * 1024,
              },
            }
          : {}

      server.route({
        method: hapiMethod,
        path: hapiPath,
        options: {
          ...payloadOptions,
          // Parse cookies into `request.state` for the event factory, but do
          // not reject the request when a cookie value is malformed —
          // real-world clients send all sorts of cookie strings and dev mode
          // should observe what production observes, not surface a 400.
          state: {
            parse: true,
            failAction: 'ignore',
          },
        },
        async handler(request, h) {
          try {
            const event = buildHttpApiV2Event({
              request,
              route: routeMeta,
              stage,
              domainName,
            })
            const result = await onRequest(functionKey, event)
            const response = formatLambdaResponseAsHapi(result, h)
            // Real APIGW adds Access-Control-Allow-Origin (and friends) to
            // every successful response from a CORS-enabled HTTP API, not
            // just to the OPTIONS preflight. Without it the browser blocks
            // the response even though the server returned a 200.
            if (httpApiCorsConfig) {
              applyCorsResponseHeaders(
                response,
                httpApiCorsConfig,
                request.headers?.origin,
              )
            }
            return response
          } catch (err) {
            if (typeof serverless.serverlessLog === 'function') {
              serverless.serverlessLog(
                `Error in ${functionKey}: ${err.message}`,
              )
            } else {
              console.error(`[offline] Error in ${functionKey}:`, err)
            }
            return h
              .response(JSON.stringify({ message: 'Internal server error' }))
              .code(502)
              .type('application/json')
          }
        },
      })

      registered.push({ method: rawMethod, path: apigwPath, functionKey })

      if (httpApiCorsConfig && !corsMounted.has(hapiPath)) {
        server.route(
          buildCorsOptionsRoute({
            path: hapiPath,
            corsConfig: httpApiCorsConfig,
          }),
        )
        corsMounted.add(hapiPath)
      }
    }
  }

  return registered
}
