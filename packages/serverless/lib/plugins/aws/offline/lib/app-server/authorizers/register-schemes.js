/**
 * Single entry point for wiring all authorizers (REST + HTTP API v2) onto
 * the Hapi server. Called ONCE at boot, before route registration.
 *
 * REST (v1): walks `events[].http` and collects:
 *   - Whether any route is `private: true` → registers the api-key scheme
 *     + strategy.
 *   - Unique `authorizer.name` references → registers one Lambda
 *     authorizer strategy per name.
 *
 * HTTP API (v2): walks `events[].httpApi` and collects unique authorizer
 * references. For each:
 *   - Resolves `provider.httpApi.authorizers[name]` as the base config and
 *     overlays per-event inline fields on top (per-event wins).
 *   - JWT discriminator (`issuerUrl` present, or `type: 'jwt'`) → registers
 *     a JWT scheme under `jwt:<name>`.
 *   - Else if `type: 'token'` → throws
 *     `OFFLINE_HTTPAPI_AUTHORIZER_TOKEN_UNSUPPORTED`.
 *   - Else (Lambda REQUEST, default) → registers a v2 Lambda scheme under
 *     `lambda-authorizer:v2:<name>`. Requires a matching function in
 *     `lambdas`.
 *   - Name-only with no provider entry and no matching Lambda → warn and
 *     skip (route ends up public).
 *
 * Returns a map the route loaders use to set each route's `options.auth`
 * string.
 *
 * @param {object} args
 * @param {import('@hapi/hapi').Server} args.server
 * @param {object} args.serverless
 * @param {{ get: (name: string) => { invoke: (event: object) => Promise<unknown> } | undefined }} args.lambdas
 * @param {string} args.stage
 * @param {string} args.accountId
 * @param {string} [args.domainName]
 * @param {boolean} [args.ignoreJWTSignature=false]
 * @returns {{
 *   privateStrategy: string | null,
 *   apiKeyStore: { keys: Set<string>, generated: boolean } | null,
 *   authorizerStrategies: Map<string, string>,
 *   v2AuthorizerStrategies: Map<string, string>,
 * }}
 */
import ServerlessError from '../../../../../../serverless-error.js'
import { buildApiKeyStore } from './api-key-store.js'
import { createApiKeyScheme } from './api-key-scheme.js'
import { createJwtScheme } from './jwt-scheme.js'
import { createLambdaAuthorizerScheme } from './lambda-authorizer-scheme.js'
import { createV2LambdaAuthorizerScheme } from './v2-lambda-authorizer-scheme.js'

export function registerAuthSchemes({
  server,
  serverless,
  lambdas,
  stage,
  accountId,
  domainName,
  customAuthStrategy,
  ignoreJWTSignature = false,
}) {
  const functions = serverless?.service?.functions ?? {}

  const authorizerStrategies = new Map()
  const v2AuthorizerStrategies = new Map()

  // Custom-auth registration runs FIRST so its name takes precedence over
  // any colliding Lambda/JWT names discovered by the subsequent v1 + v2
  // scan loops (each loop checks `if (...has(name)) continue`).
  if (customAuthStrategy) {
    server.auth.scheme(
      customAuthStrategy.scheme,
      customAuthStrategy.getAuthenticateFunction,
    )
    server.auth.strategy(customAuthStrategy.name, customAuthStrategy.scheme)
    authorizerStrategies.set(customAuthStrategy.name, customAuthStrategy.name)
    v2AuthorizerStrategies.set(customAuthStrategy.name, customAuthStrategy.name)
  }

  let anyPrivate = false
  const uniqueAuthorizers = new Map()
  const iamWarned = new Set() // dedupe the aws_iam unauthenticated warning

  for (const [functionKey, fn] of Object.entries(functions)) {
    for (const eventEntry of fn?.events ?? []) {
      const http = eventEntry?.http
      if (!http || typeof http !== 'object') continue
      if (http.private === true) anyPrivate = true
      // `authorizer: aws_iam` requests SigV4 (IAM) authorization, which is not
      // emulated locally — the route runs unauthenticated. Warn once per
      // function so it is not mistaken for a Lambda authorizer named aws_iam.
      if (isIamAuthorizer(http.authorizer)) {
        if (!iamWarned.has(functionKey)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[offline] Function "${functionKey}" uses aws_iam authorization, ` +
              `which is not emulated; the route is unauthenticated locally.`,
          )
          iamWarned.add(functionKey)
        }
        continue
      }
      const authorizer = normalizeAuthorizerRef(http.authorizer)
      if (authorizer && !uniqueAuthorizers.has(authorizer.name)) {
        uniqueAuthorizers.set(authorizer.name, authorizer)
      }
    }
  }

  let privateStrategy = null
  let apiKeyStore = null
  if (anyPrivate) {
    const store = buildApiKeyStore(serverless)
    server.auth.scheme('api-key', createApiKeyScheme({ store }))
    server.auth.strategy('api-key', 'api-key')
    privateStrategy = 'api-key'
    // Surfaced so the REST route loader can enforce the api-key independently
    // for routes that combine `private` with a Lambda authorizer.
    apiKeyStore = store
  }

  for (const [name, def] of uniqueAuthorizers) {
    if (authorizerStrategies.has(name)) continue
    const lambdaFunction = lambdas.get(name)
    if (!lambdaFunction) {
      // eslint-disable-next-line no-console
      console.warn(
        `[offline] Authorizer "${name}" references an unknown function; skipping. ` +
          `Routes that declare this authorizer will fail to register.`,
      )
      continue
    }
    const schemeName = `lambda-authorizer:${name}`
    server.auth.scheme(
      schemeName,
      createLambdaAuthorizerScheme({
        authorizerDef: def,
        lambdaFunction,
        stage,
        accountId,
      }),
    )
    server.auth.strategy(schemeName, schemeName)
    authorizerStrategies.set(name, schemeName)
  }

  // ---------- HTTP API v2 scan ----------

  const providerHttpApiAuthorizers =
    serverless?.service?.provider?.httpApi?.authorizers ?? {}

  const v2Authorizers = new Map() // name → merged + normalized def
  const v2UnresolvedNames = new Set() // for the skip-and-warn path
  const v2IamWarned = new Set() // dedupe the aws_iam unauthenticated warning

  for (const [functionKey, fn] of Object.entries(functions)) {
    for (const eventEntry of fn?.events ?? []) {
      const httpApi = eventEntry?.httpApi
      if (!httpApi || typeof httpApi !== 'object') continue
      const inline = httpApi.authorizer
      if (!inline) continue

      // IAM (SigV4) authorization is not emulated; such a route runs
      // unauthenticated locally. Warn once per function so it is not mistaken
      // for working auth, then skip (no scheme registered → public route).
      const inlineType =
        typeof inline === 'string'
          ? inline.toLowerCase()
          : typeof inline.type === 'string'
            ? inline.type.toLowerCase()
            : undefined
      if (inlineType === 'aws_iam') {
        if (!v2IamWarned.has(functionKey)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[offline] Function "${functionKey}" declares an httpApi event with ` +
              `aws_iam authorization, which is not emulated; the route is ` +
              `unauthenticated locally.`,
          )
          v2IamWarned.add(functionKey)
        }
        continue
      }

      if (typeof inline !== 'object') continue
      if (typeof inline.name !== 'string') continue
      if (v2Authorizers.has(inline.name)) continue
      if (v2UnresolvedNames.has(inline.name)) continue

      // Provider-level base config; per-event inline overrides on top.
      const providerLevel = providerHttpApiAuthorizers[inline.name] ?? {}
      const merged = { ...providerLevel, ...inline }
      // `name` is metadata; strip it from the config the schemes consume.
      delete merged.name

      const explicitType =
        typeof merged.type === 'string' ? merged.type.toUpperCase() : undefined

      if (explicitType === 'TOKEN') {
        throw new ServerlessError(
          `HTTP API v2 does not support TOKEN-type Lambda authorizers. ` +
            `Function "${functionKey}" declares an httpApi event with ` +
            `authorizer.type: 'token'.`,
          'OFFLINE_HTTPAPI_AUTHORIZER_TOKEN_UNSUPPORTED',
        )
      }

      // If neither inline nor provider-level supplied a discriminator, the
      // reference is unresolvable; warn and skip (route stays public).
      const hasJwtMarker = Boolean(merged.issuerUrl) || explicitType === 'JWT'
      const lambdaFunctionName = merged.functionName ?? inline.name
      const hasLambdaMarker = lambdas.get(lambdaFunctionName) !== undefined

      if (!hasJwtMarker && !hasLambdaMarker) {
        // eslint-disable-next-line no-console
        console.warn(
          `[offline] HTTP API authorizer "${inline.name}" referenced by ` +
            `function "${functionKey}" could not be resolved (no provider-level ` +
            `definition and no inline config). Skipping; route will be public.`,
        )
        v2UnresolvedNames.add(inline.name)
        continue
      }

      v2Authorizers.set(inline.name, {
        ...merged,
        kind: hasJwtMarker ? 'jwt' : 'lambda',
      })
    }
  }

  for (const [name, def] of v2Authorizers) {
    if (v2AuthorizerStrategies.has(name)) continue
    if (def.kind === 'jwt') {
      const schemeName = `jwt:${name}`
      server.auth.scheme(
        schemeName,
        createJwtScheme({ authorizerDef: def, ignoreJWTSignature }),
      )
      server.auth.strategy(schemeName, schemeName)
      v2AuthorizerStrategies.set(name, schemeName)
      continue
    }
    // Lambda REQUEST
    const lambdaFunctionName = def.functionName ?? name
    const lambdaFunction = lambdas.get(lambdaFunctionName)
    if (!lambdaFunction) {
      // eslint-disable-next-line no-console
      console.warn(
        `[offline] HTTP API authorizer "${name}" references an unknown ` +
          `function; skipping. Routes that declare this authorizer will fail.`,
      )
      continue
    }
    const schemeName = `lambda-authorizer:v2:${name}`
    server.auth.scheme(
      schemeName,
      createV2LambdaAuthorizerScheme({
        authorizerDef: def,
        lambdaFunction,
        stage,
        accountId,
        domainName,
      }),
    )
    server.auth.strategy(schemeName, schemeName)
    v2AuthorizerStrategies.set(name, schemeName)
  }

  return {
    privateStrategy,
    apiKeyStore,
    authorizerStrategies,
    v2AuthorizerStrategies,
  }
}

function isIamAuthorizer(authorizer) {
  if (typeof authorizer === 'string') {
    return authorizer.toLowerCase() === 'aws_iam'
  }
  if (authorizer && typeof authorizer === 'object') {
    return String(authorizer.type ?? '').toLowerCase() === 'aws_iam'
  }
  return false
}

function normalizeAuthorizerRef(authorizer) {
  if (!authorizer) return null
  if (typeof authorizer === 'string') {
    return { name: authorizer, type: 'TOKEN' }
  }
  if (typeof authorizer === 'object' && typeof authorizer.name === 'string') {
    return {
      name: authorizer.name,
      type: String(authorizer.type ?? 'TOKEN').toUpperCase(),
      identitySource: authorizer.identitySource,
      identityValidationExpression: authorizer.identityValidationExpression,
      enableSimpleResponses: authorizer.enableSimpleResponses ?? false,
    }
  }
  // ARN form, JWT, etc. — out of scope for this milestone.
  return null
}
