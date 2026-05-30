/**
 * HTTP API route loader for the offline app server.
 *
 * Walks `serverless.service.functions[*].events[].httpApi`, translates AWS
 * API Gateway path templates to Hapi path syntax, and registers Hapi route
 * handlers for each HTTP API event.
 */

import { buildHttpApiV2Event } from './event-factory.js'
import { buildHttpApiV1Event } from './event-factory-v1.js'
import {
  normalizeCorsConfig,
  buildCorsOptionsRoute,
  applyCorsResponseHeaders,
  resolveAllowOrigin,
  mergeAllowMethods,
} from '../shared/cors-options.js'
import {
  NO_BODY_METHODS,
  toHapiMethod,
  normalizeHttpEvent,
} from '../shared/hapi-helpers.js'
import { formatLambdaProxyResponse } from '../shared/lambda-proxy-response.js'
import { applyRequestIdHeaders } from '../shared/request-id-headers.js'
import { logHandlerError } from '../shared/handler-logging.js'
import { resolveAuthStrategy } from '../shared/auth-strategy-resolver.js'

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
  domainName,
  noAuth = false,
  onRequest,
  authStrategies,
}) {
  const functions = serverless.service.functions ?? {}
  /** @type {{ method: string, path: string, functionKey: string }[]} */
  const registered = []

  // Provider-wide CORS configuration. When set, one OPTIONS preflight handler
  // is synthesized per registered HTTP API path — real APIGW does the same for
  // any HTTP API with CORS enabled. Its Access-Control-Allow-Methods must list
  // every method declared on that path, so accumulate the methods per path and
  // mount the preflight routes after the loop.
  const httpApiCorsConfig = normalizeCorsConfig(
    serverless.service.provider?.httpApi?.cors,
  )
  /** @type {Map<string, Set<string>>} */
  const corsMethodsByPath = new Map()

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

      // Lambda payload format version honors the same precedence AWS and the
      // Framework compiler use: function `httpApi.payload`, then
      // `provider.httpApi.payload`, defaulting to '2.0'. A '1.0' route is
      // delivered the v1 (REST-style) proxy event and its response is
      // interpreted with v1 semantics.
      const payloadVersion =
        (typeof eventEntry.httpApi === 'object' &&
          eventEntry.httpApi.payload) ||
        serverless.service.provider?.httpApi?.payload ||
        '2.0'

      const hapiMethod = toHapiMethod(rawMethod)
      const hapiPath = toHapiPath(apigwPath)

      // Capture for the closure — `apigwPath` is used in the event factory so
      // `routeKey` reflects the original APIGW template. The bare `*` path is
      // the catch-all, which reports the `$default` route key.
      const routeMeta = {
        method: rawMethod,
        path: apigwPath,
        functionName: functionKey,
        isDefault: apigwPath === '*',
        ...(operationName !== undefined ? { operationName } : {}),
      }

      // Hapi rejects payload options on GET / HEAD routes.  For wildcard ('*')
      // we include payload options because some methods on that route can carry
      // a body; GET will simply not parse anything.
      //
      // parse:false hands the handler the raw request body as a Buffer (or null
      // when no body was sent). API Gateway delivers the body to Lambda
      // byte-for-byte, so the event factory must see the original bytes rather
      // than a JSON object Hapi re-serializes — that is what preserves webhook
      // signatures computed over the raw payload.
      const payloadOptions =
        hapiMethod === '*' || !NO_BODY_METHODS.has(hapiMethod)
          ? {
              payload: {
                parse: false,
                output: 'data',
                maxBytes: 10 * 1024 * 1024,
              },
            }
          : {}

      // Resolve the v2 auth strategy for this route (JWT or v2 Lambda).
      // Returns undefined for routes without an authorizer — the route stays
      // public.
      const authStrategy = noAuth
        ? undefined
        : resolveAuthStrategy({
            event: eventEntry.httpApi,
            privateStrategy: null, // HTTP API v2 has no private:true equivalent
            authorizerStrategies:
              authStrategies?.v2AuthorizerStrategies ?? new Map(),
          })

      // Authorization scopes are declared per route on AWS. Carry the route's
      // own scopes on the route settings so the JWT scheme enforces them for
      // this route specifically, rather than a single authorizer-wide default.
      const inlineAuthorizer =
        typeof eventEntry.httpApi === 'object'
          ? eventEntry.httpApi.authorizer
          : undefined
      const jwtScopes =
        inlineAuthorizer &&
        typeof inlineAuthorizer === 'object' &&
        Array.isArray(inlineAuthorizer.scopes)
          ? inlineAuthorizer.scopes
          : undefined

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
          ...(authStrategy ? { auth: authStrategy } : {}),
          ...(jwtScopes ? { plugins: { offline: { jwtScopes } } } : {}),
        },
        async handler(request, h) {
          try {
            // A 1.0 route is delivered the v1 (REST-style) proxy event and its
            // response is interpreted with v1 semantics: no top-level `cookies`
            // channel and no `payloadV2` string/content-type handling. Every
            // other route uses the default 2.0 path.
            const isV1 = payloadVersion === '1.0'
            const event = isV1
              ? buildHttpApiV1Event({
                  request,
                  route: routeMeta,
                  domainName,
                })
              : buildHttpApiV2Event({
                  request,
                  route: routeMeta,
                  domainName,
                })
            const result = await onRequest(functionKey, event)
            const response = formatLambdaProxyResponse(result, h, {
              cookies: !isV1,
              payloadV2: !isV1,
              defaultContentType: 'application/json',
            })
            applyRequestIdHeaders(response, 'http', {
              requestId: event.requestContext?.requestId,
            })
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
            logHandlerError(serverless, functionKey, err)
            const errResponse = h
              .response(JSON.stringify({ message: 'Internal server error' }))
              .code(502)
              .type('application/json')
            // Gateway-level CORS applies to every response, errors included.
            if (httpApiCorsConfig) {
              applyCorsResponseHeaders(
                errResponse,
                httpApiCorsConfig,
                request.headers?.origin,
              )
            }
            return errResponse
          }
        },
      })

      registered.push({ method: rawMethod, path: apigwPath, functionKey })

      if (httpApiCorsConfig) {
        const methods = corsMethodsByPath.get(hapiPath)
        if (methods) {
          methods.add(rawMethod)
        } else {
          corsMethodsByPath.set(hapiPath, new Set([rawMethod]))
        }
      }
    }
  }

  // Mount one OPTIONS preflight route per HTTP API path, with
  // Access-Control-Allow-Methods covering every method declared on the path
  // (plus OPTIONS) — matching what real API Gateway answers for a preflight.
  if (httpApiCorsConfig) {
    for (const [hapiPath, methods] of corsMethodsByPath) {
      server.route(
        buildCorsOptionsRoute({
          path: hapiPath,
          corsConfig: {
            ...httpApiCorsConfig,
            methods: mergeAllowMethods(httpApiCorsConfig.methods, [...methods]),
          },
        }),
      )
    }

    // The CORS configuration on an HTTP API is set at the gateway, so it
    // decorates gateway-generated error responses too — most visibly the 404
    // returned for a path that matches no route. Hapi surfaces those as Boom
    // errors whose headers live on `output.headers`; mirror the gateway by
    // adding the allow-origin (and credentials / exposed-headers) there so a
    // cross-origin client still receives them on a failure.
    if (typeof server.ext === 'function')
      server.ext('onPreResponse', (request, h) => {
        const response = request.response
        if (response?.isBoom) {
          const headers = response.output.headers
          headers['access-control-allow-origin'] = resolveAllowOrigin(
            httpApiCorsConfig,
            request.headers?.origin,
          )
          if (httpApiCorsConfig.allowCredentials) {
            headers['access-control-allow-credentials'] = 'true'
          }
          if (httpApiCorsConfig.exposedHeaders.length > 0) {
            headers['access-control-expose-headers'] =
              httpApiCorsConfig.exposedHeaders.join(',')
          }
        }
        return h.continue
      })
  }

  return registered
}
