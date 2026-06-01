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

import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildRestApiEvent } from './event-factory.js'
import { formatRestApiResponse } from './response-mapper.js'
import { applyRequestIdHeaders } from '../shared/request-id-headers.js'
import { detectIntegration } from './integration-detector.js'
import { translateRestPath, buildMountedPath } from './path-translator.js'
import {
  buildNonProxyEvent,
  UNSUPPORTED_MEDIA_TYPE_CODE,
} from './non-proxy/event-factory.js'
import { mapNonProxyResponse } from './non-proxy/response-mapper.js'
import { getHandlerBaseDir } from '../../handler-base-dir.js'
import {
  normalizeCorsConfig,
  buildCorsOptionsRoute,
  applyCorsResponseHeaders,
  mergeAllowMethods,
} from '../shared/cors-options.js'
import {
  NO_BODY_METHODS,
  toHapiMethod,
  normalizeHttpEvent,
} from '../shared/hapi-helpers.js'
import { logHandlerError } from '../shared/handler-logging.js'
import { resolveAuthStrategy } from '../shared/auth-strategy-resolver.js'
import { forbidden } from '../shared/auth-envelopes.js'

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

  // An integration response's content type comes from its configured
  // `headers['Content-Type']` value — a velocity literal usually authored
  // quoted in YAML (e.g. `"'text/xml'"`). Strip a single layer of wrapping
  // single quotes and surrounding whitespace; default to application/json
  // when absent or blank. This content type selects `responseTemplates[type]`
  // and becomes the reply's Content-Type.
  const resolveResponseContentType = (headers) => {
    if (headers && typeof headers === 'object') {
      for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() !== 'content-type') continue
        if (typeof value !== 'string') break
        const trimmed = value.trim()
        const unquoted = /^'.*'$/.test(trimmed)
          ? trimmed.slice(1, -1).trim()
          : trimmed
        if (unquoted !== '') return unquoted
        break
      }
    }
    return 'application/json'
  }

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
      responseContentType: resolveResponseContentType(responseConfig.headers),
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
      responseContentType: resolveResponseContentType(entry.headers),
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

/**
 * Resolve a function's handler module path (without the exported-method suffix)
 * to an absolute path against the handler base dir. Used to locate the
 * `<handler>.req.vm` / `<handler>.res.vm` sidecar mapping templates.
 *
 * e.g. handler `'src/foo.handler'` with base dir `<dir>` → `<dir>/src/foo`.
 *
 * @param {unknown} handler
 * @param {string} baseDir
 * @returns {string | null}
 */
function resolveHandlerStem(handler, baseDir) {
  if (typeof handler !== 'string' || handler.length === 0) return null
  const lastDot = handler.lastIndexOf('.')
  const modulePath = lastDot > 0 ? handler.slice(0, lastDot) : handler
  return resolve(baseDir, modulePath)
}

function splitHeaderList(value) {
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function applyCorsOverrides(
  corsConfig,
  {
    corsAllowHeaders,
    corsAllowOrigin,
    corsDisallowCredentials,
    corsExposedHeaders,
  },
) {
  if (!corsConfig) return null
  return {
    ...corsConfig,
    ...(corsAllowHeaders !== undefined
      ? { headers: splitHeaderList(corsAllowHeaders) }
      : {}),
    ...(corsAllowOrigin !== undefined ? { origins: [corsAllowOrigin] } : {}),
    ...(corsDisallowCredentials !== undefined
      ? { allowCredentials: corsDisallowCredentials !== true }
      : {}),
    ...(corsExposedHeaders !== undefined
      ? { exposedHeaders: splitHeaderList(corsExposedHeaders) }
      : {}),
  }
}

function secureCookieValue(value) {
  return /(?:^|;)\s*secure\s*(?:;|$)/i.test(value) ? value : `${value}; Secure`
}

function applySecureCookieHeaders(response) {
  const setCookie = response.headers?.['set-cookie']
  if (!setCookie) return response
  response.headers['set-cookie'] = Array.isArray(setCookie)
    ? setCookie.map(secureCookieValue)
    : secureCookieValue(setCookie)
  return response
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
  noAuth = false,
  corsAllowHeaders,
  corsAllowOrigin,
  corsDisallowCredentials,
  corsExposedHeaders,
  disableCookieValidation = false,
  enforceSecureCookies = false,
  onRequest,
  authStrategies,
}) {
  const functions = serverless.service.functions ?? {}
  // API-key store for `private: true` routes. Read once; used by the handler
  // gate that enforces the api-key for routes combining `private` with a
  // Lambda authorizer (the authorizer runs as the route's Hapi auth strategy,
  // so the key must be checked separately).
  const apiKeyStore = authStrategies?.apiKeyStore ?? null
  /** @type {{ method: string, path: string, mountedPath: string, apigwMountedPath: string, functionKey: string }[]} */
  const registered = []
  // Two routes sharing a path (e.g. GET /users + POST /users) need only one
  // OPTIONS preflight handler, but its Access-Control-Allow-Methods must list
  // every method declared on that path. Accumulate each cors-enabled route's
  // method per mounted path; the first route's config wins for the rest of the
  // preflight shape. One OPTIONS route is mounted per path after the loop.
  /** @type {Map<string, { corsConfig: object, methods: Set<string> }>} */
  const corsByPath = new Map()

  for (const [functionKey, fn] of Object.entries(functions)) {
    const events = fn.events ?? []

    for (const eventEntry of events) {
      if (!Object.prototype.hasOwnProperty.call(eventEntry, 'http')) continue

      const httpEvent = eventEntry.http
      const integration = detectIntegration(httpEvent)

      // Non-proxy (AWS / lambda) routes carry per-route request templates and
      // response definitions; pre-extract them so the handler closure captures
      // a stable shape. AWS_PROXY routes ignore both.
      //
      // An explicitly configured template always wins. Otherwise, a
      // `<handler>.req.vm` / `<handler>.res.vm` sidecar file (resolved against
      // the handler base dir) supplies the request / default-response template.
      // When neither is present the request template is left null so the event
      // factory falls back to API Gateway's built-in passthrough template, and
      // the default response template is left unset (identity, no change).
      let requestTemplates = null
      let responses = null
      // Integration response content handling. When set to
      // `CONVERT_TO_BINARY`, the response mapper base64-decodes the rendered
      // body into raw binary, matching API Gateway.
      let contentHandling
      if (integration === 'AWS' && typeof httpEvent === 'object') {
        requestTemplates = httpEvent.request?.template ?? null
        responses = normalizeResponses(httpEvent.response)
        contentHandling = httpEvent.response?.contentHandling

        const handlerStem = resolveHandlerStem(
          fn.handler,
          getHandlerBaseDir(serverless),
        )
        if (handlerStem) {
          if (!httpEvent.request?.template) {
            const reqSidecar = `${handlerStem}.req.vm`
            if (existsSync(reqSidecar)) {
              requestTemplates = {
                'application/json': readFileSync(reqSidecar, 'utf8'),
              }
            }
          }
          if (!httpEvent.response?.template) {
            const resSidecar = `${handlerStem}.res.vm`
            if (existsSync(resSidecar)) {
              responses = {
                ...responses,
                default: {
                  ...responses.default,
                  responseTemplates: {
                    ...(responses.default.responseTemplates ?? {}),
                    'application/json': readFileSync(resSidecar, 'utf8'),
                  },
                },
              }
            }
          }
        }
      }

      const { method: rawMethod, path: rawApigwPath } =
        normalizeHttpEvent(httpEvent)
      // AWS normalizes the resource path to a leading slash regardless of how
      // it is written in serverless.yml (`items` and `/items` both deploy as
      // `/items`).
      const apigwPath =
        rawApigwPath === '*' || rawApigwPath.startsWith('/')
          ? rawApigwPath
          : `/${rawApigwPath}`

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
      //
      // Non-proxy (AWS) integrations render a velocity request template against
      // the parsed body, so they keep parse:true and receive the parsed object.
      // Proxy (AWS_PROXY) integrations use parse:false so the handler sees the
      // raw request body as a Buffer — API Gateway delivers the body to Lambda
      // byte-for-byte, preserving webhook signatures computed over the raw bytes.
      const payloadOptions =
        hapiMethod === '*' || !NO_BODY_METHODS.has(hapiMethod)
          ? {
              payload: {
                parse: integration === 'AWS',
                output: 'data',
                maxBytes: 10 * 1024 * 1024,
              },
            }
          : {}

      // CORS preflight — only the long-form event object can declare it;
      // short-form strings ("GET /users") have no place for the cors field.
      // Resolved up here so the request handler closure can also use it to
      // decorate non-OPTIONS responses with the right CORS response headers.
      const corsConfig = applyCorsOverrides(
        typeof eventEntry.http === 'object'
          ? normalizeCorsConfig(eventEntry.http.cors)
          : null,
        {
          corsAllowHeaders,
          corsAllowOrigin,
          corsDisallowCredentials,
          corsExposedHeaders,
        },
      )

      // Resolve the Hapi auth strategy for this route, if any. Returns
      // undefined for public routes — Hapi leaves `options.auth` unset.
      const authStrategy = noAuth
        ? undefined
        : resolveAuthStrategy({
            event: eventEntry.http,
            privateStrategy: authStrategies?.privateStrategy ?? null,
            authorizerStrategies:
              authStrategies?.authorizerStrategies ?? new Map(),
          })

      // Whether this route is `private: true`. A private route requires a
      // valid api-key regardless of which strategy resolves to run (e.g. an
      // authorizer takes the Hapi-auth slot when both are declared).
      const isPrivate =
        typeof httpEvent === 'object' && httpEvent.private === true

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
            parse: !disableCookieValidation,
            failAction: 'ignore',
          },
          ...(authStrategy ? { auth: authStrategy } : {}),
        },
        async handler(request, h) {
          // Enforce the api-key for `private: true` routes independently of the
          // resolved Hapi auth strategy. The key may arrive on the request
          // (`x-api-key`) or be supplied by a Lambda authorizer that returned a
          // matching `usageIdentifierKey`. Either satisfies the requirement.
          if (!noAuth && isPrivate && apiKeyStore) {
            const headerKey = request.headers['x-api-key']
            const authorizerKey = request.auth?.credentials?.usageIdentifierKey
            const ok =
              (typeof headerKey === 'string' &&
                apiKeyStore.keys.has(headerKey)) ||
              (typeof authorizerKey === 'string' &&
                apiKeyStore.keys.has(authorizerKey))
            if (!ok) return forbidden(h)
          }

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
              // No request template matches the request's content type. The
              // AWS (Lambda) integration's default passthrough behavior is
              // NEVER, so API Gateway rejects the request with 415 and never
              // invokes the integration.
              if (err?.code === UNSUPPORTED_MEDIA_TYPE_CODE) {
                return h
                  .response(
                    JSON.stringify({ message: 'Unsupported Media Type' }),
                  )
                  .code(415)
                  .type('application/json')
              }
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
              contentHandling,
              h,
            })
            // Non-proxy events carry no requestContext.requestId we can mirror,
            // so synthesize the gateway request ids for the response headers.
            applyRequestIdHeaders(response, 'rest', {
              requestId: crypto.randomUUID(),
              extendedRequestId: crypto.randomUUID(),
            })
            if (enforceSecureCookies) {
              applySecureCookieHeaders(response)
            }
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
              prefix,
              noPrependStageInUrl,
              noAuth,
            })
            const result = await onRequest(functionKey, event)
            const response = formatRestApiResponse(result, h)
            applyRequestIdHeaders(response, 'rest', {
              requestId: event.requestContext?.requestId,
              extendedRequestId: event.requestContext?.extendedRequestId,
            })
            if (enforceSecureCookies) {
              applySecureCookieHeaders(response)
            }
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

      if (corsConfig) {
        const entry = corsByPath.get(mountedPath)
        if (entry) {
          entry.methods.add(rawMethod)
        } else {
          corsByPath.set(mountedPath, {
            corsConfig,
            methods: new Set([rawMethod]),
          })
        }
      }
    }
  }

  // Mount one OPTIONS preflight route per cors-enabled path, with
  // Access-Control-Allow-Methods covering every method declared on the path
  // (plus OPTIONS) — matching what real API Gateway answers for a preflight.
  for (const [mountedPath, { corsConfig, methods }] of corsByPath) {
    server.route(
      buildCorsOptionsRoute({
        path: mountedPath,
        corsConfig: {
          ...corsConfig,
          methods: mergeAllowMethods(corsConfig.methods, [...methods]),
        },
        // REST API answers a CORS preflight from a MOCK integration with 200.
        statusCode: 200,
      }),
    )
  }

  return registered
}
