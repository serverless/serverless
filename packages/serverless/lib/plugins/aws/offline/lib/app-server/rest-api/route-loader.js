/**
 * REST API route loader for the offline app server.
 *
 * Walks `serverless.service.functions[*].events[].http`, classifies each entry
 * by integration type, and — for the Lambda-proxy (AWS_PROXY) flavour, which
 * is the default and overwhelmingly common case — registers a Hapi route that
 * converts the incoming request into the APIGW REST API v1 event shape and
 * forwards it to the supplied `onRequest` callback.  REST URLs deployed to AWS
 * carry a stage segment in front of the user-declared path; we reproduce that
 * mount so requests made locally hit the same URL clients use against the real
 * gateway.  AWS (non-proxy) integration is detected and fast-fails at register
 * time so users hit a documented boundary instead of a silent 500 mid-request.
 */

import { buildRestApiEvent } from './event-factory.js'
import { formatRestApiResponse } from './response-mapper.js'
import { detectIntegration } from './integration-detector.js'
import { translateRestPath, buildMountedPath } from './path-translator.js'
import { buildNonProxyEvent } from './non-proxy/event-factory.js'
import { mapNonProxyResponse } from './non-proxy/response-mapper.js'
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
import { logHandlerError } from '../shared/handler-logging.js'
import { resolveAuthStrategy } from '../shared/auth-strategy-resolver.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize the Framework YAML `http.response` block into the response map
 * the non-proxy mapper consumes.
 *
 * Framework's YAML uses two shapes:
 *
 *   response:
 *     template:            # → default response's responseTemplates
 *       'application/json': '...'
 *     headers:             # → default response's responseParameters
 *       X-Custom: "'value'"
 *     statusCodes:         # → keyed (non-default) responses
 *       '404':
 *         pattern: 'Not found.*'
 *         template:
 *           'application/json': '...'
 *         headers:
 *           X-Foo: 'integration.response.body.foo'
 *
 * Output shape consumed by `mapNonProxyResponse`:
 *
 *   { default: { statusCode: 200, responseTemplates, responseParameters },
 *     '404':   { statusCode: 404, selectionPattern, responseTemplates,
 *                responseParameters } }
 *
 * Header right-hand-sides pass through verbatim — the mapper handles the
 * `'literal'`, `integration.response.body[.PATH]`, and bare-value forms.
 *
 * @param {object | undefined} responseConfig
 * @returns {Record<string, object>}
 */
function normalizeResponses(responseConfig) {
  if (!responseConfig) return { default: { statusCode: 200 } }

  const headersToParameters = (headers) =>
    Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        `method.response.header.${name}`,
        value,
      ]),
    )

  // Framework's schema accepts two shapes for `template`:
  //   - string                                → default content-type template
  //   - { 'application/json': '...', ... }    → content-type-keyed map
  // The mapper consumes the map shape exclusively, so coerce the string
  // form into `{ 'application/json': <template> }` (the implicit default
  // content type used everywhere else in the REST surface).
  const coerceTemplate = (template) =>
    typeof template === 'string' ? { 'application/json': template } : template

  const out = {
    default: {
      statusCode: 200,
      ...(responseConfig.template
        ? { responseTemplates: coerceTemplate(responseConfig.template) }
        : {}),
      ...(responseConfig.headers
        ? { responseParameters: headersToParameters(responseConfig.headers) }
        : {}),
    },
  }

  for (const [code, entry] of Object.entries(
    responseConfig.statusCodes ?? {},
  )) {
    const numericCode = Number.parseInt(code, 10)
    out[code] = {
      statusCode: numericCode,
      ...(entry.pattern ? { selectionPattern: entry.pattern } : {}),
      ...(entry.template
        ? { responseTemplates: coerceTemplate(entry.template) }
        : {}),
      ...(entry.headers
        ? { responseParameters: headersToParameters(entry.headers) }
        : {}),
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register REST API routes on a Hapi server instance.
 *
 * Walks `serverless.service.functions`, finds every `http` event, validates
 * the integration type (only AWS_PROXY is currently served — AWS non-proxy is
 * rejected here with a clear error), translates the APIGW path to Hapi syntax,
 * applies the stage / prefix mount, and registers a Hapi route per event.  The
 * handler builds an APIGW REST API v1 Lambda-proxy event and forwards it to
 * `onRequest`.
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
 * @param {string} [opts.prefix]
 *   Extra path segment to apply after the stage (matches the `--prefix` flag).
 * @param {boolean} [opts.noPrependStageInUrl=false]
 *   When `true`, the `/<stage>/` segment is omitted from the mounted URL.
 *   Matches the Framework CLI flag name.
 * @param {(functionKey: string, event: object) => Promise<unknown>} opts.onRequest
 *   Async callback invoked for every incoming HTTP request. Receives the
 *   function key and the APIGW REST v1 event; returns the Lambda response
 *   shape (string / object / `{ statusCode, body, ... }`).
 *
 * @returns {{ method: string, path: string, mountedPath: string, apigwMountedPath: string, functionKey: string }[]}
 *   The list of routes that were registered (in declaration order). Consumed
 *   by the boot-diagnostics summary that prints the route table.
 *
 * @throws {ServerlessError} OFFLINE_UNSUPPORTED_INTEGRATION
 *   When the integration type is neither AWS_PROXY nor AWS.
 */
export function registerRestApiRoutes({
  server,
  serverless,
  stage,
  prefix,
  noPrependStageInUrl = false,
  onRequest,
  authStrategies,
}) {
  const functions = serverless.service.functions ?? {}
  /** @type {{ method: string, path: string, mountedPath: string, apigwMountedPath: string, functionKey: string }[]} */
  const registered = []
  // Two routes sharing a path (e.g. GET /users + POST /users) need only one
  // OPTIONS preflight handler — track which mounted paths already have one.
  const corsMounted = new Set()

  for (const [functionKey, fn] of Object.entries(functions)) {
    const events = fn.events ?? []

    for (const eventEntry of events) {
      if (!Object.prototype.hasOwnProperty.call(eventEntry, 'http')) continue

      const httpEvent = eventEntry.http
      const integration = detectIntegration(httpEvent)

      // Non-proxy (AWS / lambda) routes carry per-route request templates and
      // response definitions; pre-extract them so the handler closure captures
      // a stable shape. AWS_PROXY routes ignore both.
      const requestTemplates =
        integration === 'AWS' && typeof httpEvent === 'object'
          ? (httpEvent.request?.template ?? null)
          : null
      const responses =
        integration === 'AWS' && typeof httpEvent === 'object'
          ? normalizeResponses(httpEvent.response)
          : null

      const { method: rawMethod, path: apigwPath } =
        normalizeHttpEvent(httpEvent)

      const hapiMethod = toHapiMethod(rawMethod)
      const hapiPath = translateRestPath(apigwPath)
      const mountOpts = {
        includeStage: !noPrependStageInUrl,
        prefix,
      }
      const mountedPath = buildMountedPath(hapiPath, stage, mountOpts)
      // Same stage/prefix decoration, but on the APIGW-style path so the
      // boot summary can show users URLs that match their `serverless.yml`
      // declarations (e.g. `{proxy+}` rather than the Hapi-translated
      // `{proxy*}`).
      const apigwMountedPath = buildMountedPath(apigwPath, stage, mountOpts)

      // Capture for the closure — `apigwPath` is the original APIGW template
      // (with `{id}` etc. intact) so the event factory can surface it as
      // `event.resource` / `requestContext.resourcePath`.
      const routeMeta = {
        method: rawMethod,
        apigwPath,
        functionName: functionKey,
      }

      // Hapi rejects payload options on GET / HEAD / DELETE / OPTIONS / TRACE.
      // For wildcard ('*') we still attach payload options because some
      // methods that match the wildcard route can carry a body; for body-less
      // methods routed through a wildcard, Hapi simply skips payload parsing.
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

      // CORS preflight — only the long-form event object can declare it;
      // short-form strings ("GET /users") have no place for the cors field.
      // Resolved up here so the request handler closure can also use it to
      // decorate non-OPTIONS responses with the right CORS response headers.
      const corsConfig =
        typeof eventEntry.http === 'object'
          ? normalizeCorsConfig(eventEntry.http.cors)
          : null

      // Resolve the Hapi auth strategy for this route, if any. Returns
      // undefined for public routes — Hapi leaves `options.auth` unset.
      const authStrategy = resolveAuthStrategy({
        event: eventEntry.http,
        privateStrategy: authStrategies?.privateStrategy ?? null,
        authorizerStrategies: authStrategies?.authorizerStrategies ?? new Map(),
      })

      server.route({
        method: hapiMethod,
        path: mountedPath,
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
          ...(authStrategy ? { auth: authStrategy } : {}),
        },
        async handler(request, h) {
          if (integration === 'AWS') {
            // Non-proxy: render request template → invoke → map response.
            let event
            try {
              event = buildNonProxyEvent({
                request,
                stage,
                resourcePath: apigwPath,
                requestTemplates,
              })
            } catch (err) {
              logHandlerError(serverless, functionKey, err)
              return h
                .response(JSON.stringify({ message: 'Internal server error' }))
                .code(502)
                .type('application/json')
            }

            let result
            let invokeError = null
            try {
              result = await onRequest(functionKey, event)
            } catch (err) {
              invokeError = err
            }
            const response = mapNonProxyResponse({
              result,
              err: invokeError,
              responses,
              request,
              stage,
              resourcePath: apigwPath,
              h,
            })
            if (corsConfig) {
              applyCorsResponseHeaders(
                response,
                corsConfig,
                request.headers?.origin,
              )
            }
            return response
          }

          // AWS_PROXY (default): build event, invoke, pass through Lambda
          // response shape.
          try {
            const event = buildRestApiEvent({
              request,
              route: routeMeta,
              stage,
            })
            const result = await onRequest(functionKey, event)
            const response = formatRestApiResponse(result, h)
            // Real APIGW adds Access-Control-Allow-Origin (and friends) to
            // every successful response from a CORS-enabled endpoint, not
            // just to the OPTIONS preflight. Without it the browser blocks
            // the response even though the server returned a 200.
            if (corsConfig) {
              applyCorsResponseHeaders(
                response,
                corsConfig,
                request.headers?.origin,
              )
            }
            return response
          } catch (err) {
            logHandlerError(serverless, functionKey, err)
            return h
              .response(JSON.stringify({ message: 'Internal server error' }))
              .code(502)
              .type('application/json')
          }
        },
      })

      registered.push({
        method: rawMethod,
        path: apigwPath,
        mountedPath,
        apigwMountedPath,
        functionKey,
      })

      if (corsConfig && !corsMounted.has(mountedPath)) {
        server.route(buildCorsOptionsRoute({ path: mountedPath, corsConfig }))
        corsMounted.add(mountedPath)
      }
    }
  }

  return registered
}
