/**
 * Single entry point for wiring all REST API authorizers onto the Hapi
 * server. Called ONCE at boot, before route registration.
 *
 * Walks `serverless.service.functions[*].events[].http` and collects:
 *   - Whether any route is `private: true` → registers the api-key scheme
 *     + strategy.
 *   - Unique `authorizer.name` references → registers one Lambda
 *     authorizer strategy per name.
 *
 * Returns a map the REST route loader uses to set each route's
 * `options.auth` string.
 *
 * @param {object} args
 * @param {import('@hapi/hapi').Server} args.server
 * @param {object} args.serverless
 * @param {{ get: (name: string) => { invoke: (event: object) => Promise<unknown> } | undefined }} args.lambdas
 * @param {string} args.stage
 * @param {string} args.accountId
 * @returns {{ privateStrategy: string | null, authorizerStrategies: Map<string, string> }}
 */
import { buildApiKeyStore } from './api-key-store.js'
import { createApiKeyScheme } from './api-key-scheme.js'
import { createLambdaAuthorizerScheme } from './lambda-authorizer-scheme.js'

export function registerAuthSchemes({
  server,
  serverless,
  lambdas,
  stage,
  accountId,
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

  return { privateStrategy, authorizerStrategies }
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
