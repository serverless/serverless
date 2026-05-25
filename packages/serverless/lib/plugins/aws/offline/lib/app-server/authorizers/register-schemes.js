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
 * @returns {{
 *   privateStrategy: string | null,
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
}) {
  const functions = serverless?.service?.functions ?? {}

  let anyPrivate = false
  const uniqueAuthorizers = new Map()

  for (const [, fn] of Object.entries(functions)) {
    for (const eventEntry of fn?.events ?? []) {
      const http = eventEntry?.http
      if (!http || typeof http !== 'object') continue
      if (http.private === true) anyPrivate = true
      const authorizer = normalizeAuthorizerRef(http.authorizer)
      if (authorizer && !uniqueAuthorizers.has(authorizer.name)) {
        uniqueAuthorizers.set(authorizer.name, authorizer)
      }
    }
  }

  let privateStrategy = null
  if (anyPrivate) {
    const store = buildApiKeyStore(serverless)
    if (store.generated) {
      // eslint-disable-next-line no-console
      console.log(`Key with token: '${[...store.keys][0]}'`)
    }
    server.auth.scheme('api-key', createApiKeyScheme({ store }))
    server.auth.strategy('api-key', 'api-key')
    privateStrategy = 'api-key'
  }

  const authorizerStrategies = new Map()

  for (const [name, def] of uniqueAuthorizers) {
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

  for (const [functionKey, fn] of Object.entries(functions)) {
    for (const eventEntry of fn?.events ?? []) {
      const httpApi = eventEntry?.httpApi
      if (!httpApi || typeof httpApi !== 'object') continue
      const inline = httpApi.authorizer
      if (!inline || typeof inline !== 'object') continue
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
      const hasLambdaMarker = lambdas.get(inline.name) !== undefined

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

  const v2AuthorizerStrategies = new Map()
  for (const [name, def] of v2Authorizers) {
    if (def.kind === 'jwt') {
      const schemeName = `jwt:${name}`
      server.auth.scheme(schemeName, createJwtScheme({ authorizerDef: def }))
      server.auth.strategy(schemeName, schemeName)
      v2AuthorizerStrategies.set(name, schemeName)
      continue
    }
    // Lambda REQUEST
    const lambdaFunction = lambdas.get(name)
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
    authorizerStrategies,
    v2AuthorizerStrategies,
  }
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
    }
  }
  // ARN form, JWT, etc. — out of scope for this milestone.
  return null
}
