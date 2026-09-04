/**
 * Everything Compose does with service-provider tokens (`${service:...}` and
 * named `${<instance>:...}` of a compose-only type) after the compose-file
 * resolver manager's up-front pass leaves them as literals: the dispatch-time
 * pass that resolves the ones in `services.<alias>.params`, and the warning for
 * the ones written anywhere else, which no pass will reach.
 *
 * Both are built on generic manager primitives — the manager knows nothing
 * about compose params, and owns neither the locations nor the wording.
 */

import { serviceNameOf } from '../../resolvers/providers/service/service.js'

/**
 * Where a service reference is resolved, and therefore the only locations where
 * one is correctly placed. `'*'` matches any single path segment.
 *
 * `parsedParams` is the compose runner's own mirror of `services.<alias>.params`
 * (written onto the same config object while the graph is parsed), so a token
 * there is the SAME correctly placed reference seen twice — never a separate
 * misplacement.
 */
const RESOLVED_TOKEN_PATHS = [
  ['services', '*', 'params'],
  ['services', '*', 'parsedParams'],
]

const isResolvedTokenPath = (nodePath) =>
  RESOLVED_TOKEN_PATHS.some(
    (allowedPath) =>
      allowedPath.length <= nodePath.length &&
      allowedPath.every(
        (segment, index) => segment === '*' || segment === nodePath[index],
      ),
  )

/**
 * The provider names whose tokens Compose owns: every declared service-typed
 * instance plus the built-in `service` type name.
 *
 * @param {import('../../resolvers/manager.js').ResolverManager} manager
 * @returns {string[]}
 */
const serviceProviderNames = (manager) => [
  ...manager.getServiceTypedInstanceNames(),
  'service',
]

/**
 * Every service reference in the compose file, grouped by the service whose
 * block contains it:
 * `Map<alias, [{ original, providerName, resolverType, referencedAlias, deferred, paramKey }]>`.
 * `resolverType` is set only when the token carried a resolver segment
 * (`${service:a:b.Out}`) — which a service reference never has; the graph
 * build refuses it.
 * `paramKey` is the key under `services.<alias>.params` that holds the
 * reference, or `null` when it sits elsewhere in the service block.
 *
 * A reference key is `<service>.<Output>`, split at the LAST dot: a
 * CloudFormation output name never contains a dot, so everything before it is
 * the service name, exactly as declared under `services` (dots included).
 * `referencedAlias` is `null` when the key has no such split (malformed), or
 * when the service name is produced by a reference that is itself still
 * deferred (`${service:${service:r.Alias}.Host}`) — `deferred` says which.
 *
 * This is the graph-build input for deploy ordering. It comes from the resolver
 * manager's placeholder graph rather than from the configuration text, because
 * text cannot see a reference that carries a fallback or sits in fallback
 * position, and still shows the pre-resolution form of one whose inner variable
 * has since resolved. A deferred inner reference is reported as its own entry.
 *
 * @param {Object} params
 * @param {import('../../resolvers/manager.js').ResolverManager} params.manager
 * @returns {Map<string, Array<{original: string, providerName: string, resolverType: string|undefined, referencedAlias: string|null, deferred: boolean, paramKey: string|null}>>}
 */
export function serviceReferencesByAlias({ manager }) {
  const byAlias = new Map()
  for (const {
    path,
    original,
    providerName,
    resolverType,
    key,
  } of manager.getPlaceholderReferences({
    pathPrefix: ['services'],
    providerNames: serviceProviderNames(manager),
  })) {
    const alias = path[1]
    if (alias === undefined) continue
    const deferred = key.includes('${')
    const referencedAlias = deferred ? null : serviceNameOf(key)
    const paramKey = path[2] === 'params' ? (path[3] ?? null) : null
    if (!byAlias.has(alias)) byAlias.set(alias, [])
    byAlias.get(alias).push({
      original,
      providerName,
      resolverType,
      referencedAlias,
      deferred,
      paramKey,
    })
  }
  return byAlias
}

/**
 * Warn about service references the dispatch-time pass will never reach.
 *
 * That pass only revisits `services.<alias>.params`, so a reference written
 * anywhere else in the compose file stays a literal for the rest of the run —
 * and a top-level param is handed to every child service verbatim. Warn rather
 * than throw: a token passing through as a literal is how unknown provider
 * names have always behaved, so failing here could break configurations that
 * work today.
 *
 * Called once, after the compose file's variables are resolved and before the
 * renderer switches to compose output, so the warning is visible in a
 * multi-service run.
 *
 * @param {Object} params
 * @param {import('../../resolvers/manager.js').ResolverManager} params.manager -
 *   The compose-file resolver manager, after its up-front pass.
 * @param {Object} params.logger - Logger exposing `warning`.
 */
export function warnAboutUnreachableServiceReferences({ manager, logger }) {
  const unresolved = manager.getUnresolvedPlaceholders({
    providerNames: serviceProviderNames(manager),
  })
  for (const { original, path } of unresolved) {
    if (isResolvedTokenPath(path)) {
      continue
    }
    logger.warning(
      `'${original}' at '${path.join('.')}' was left unresolved. Service references are resolved per service, as each service is deployed, so they are only supported in 'services.<service>.params'. Move the reference there and read it with '\${param:...}' inside that service's configuration.`,
    )
  }
}

/**
 * Serializes the passes of one manager. A resolution pass mutates shared
 * per-pass state on the manager (`graphBeingProcessed`/`processingState`), so
 * two concurrently dispatched Compose services would clobber each other's
 * pass. Chaining keeps them one-at-a-time; the pinned-state single-flight cache
 * (owned by `composeContext.getOutputs`) still dedupes any fetch a later pass
 * would repeat.
 *
 * @type {WeakMap<Object, Promise<Record<string, unknown>>>}
 */
const passQueues = new WeakMap()

/**
 * Resolve one Compose service's service-provider params.
 *
 * Only service-typed param keys are resolved and returned; dot-form and literal
 * params are left for the compose runner's own loop (coexistence).
 *
 * @param {Object} params
 * @param {import('../../resolvers/manager.js').ResolverManager} params.manager -
 *   The compose-file resolver manager holding the parsed compose configuration.
 * @param {string} params.alias - The Compose service being dispatched.
 * @param {Object} params.composeContext - Transport wiring read by the
 *   provider: `{ runStage, aliases, command, getOutputs(alias, stage),
 *   shortCircuitValue(command) }`.
 * @returns {Promise<Record<string, unknown>>} Resolved values keyed by the
 *   service-typed param names (empty when the service declares none).
 */
export async function resolveServiceParams({ manager, alias, composeContext }) {
  // `.catch` on the PREVIOUS link only, so one failed pass does not poison the
  // passes queued behind it; each caller still receives its own rejection.
  const current = (passQueues.get(manager) ?? Promise.resolve())
    .catch(() => {})
    .then(() => runPass({ manager, alias, composeContext }))
  passQueues.set(manager, current)
  return current
}

async function runPass({ manager, alias, composeContext }) {
  const pathPrefix = ['services', alias, 'params']
  const params = manager.serviceConfigFile?.services?.[alias]?.params
  if (!params || typeof params !== 'object') {
    return {}
  }

  const providerNames = serviceProviderNames(manager)

  // Identify the service-typed param keys up front so only they are returned
  // (dot-form/literal params are untouched by this pass). The keys are read
  // from the placeholder graph, so a reference nested inside another variable
  // (`${env:${service:db.EnvName}}`) or sitting in fallback position
  // (`${opt:x, service:db.Host}`) counts for the key that holds it.
  //
  // Only unresolved placeholders are in the graph — the engine removes a node
  // once it resolves — so a key whose reference an earlier pass already
  // resolved is not reported again.
  const keys = manager.getPlaceholderKeysUsingProviders({
    pathPrefix,
    providerNames,
  })
  if (keys.length === 0) {
    return {}
  }

  // Command-mode short-circuit FIRST — before any token resolution — so the
  // state fetch is unreachable in remove/get-state, which substitute an empty
  // string. The WHOLE value is replaced, matching the dot-form loop, which also
  // replaces the whole param; a per-token rewrite would leave the enclosing
  // variable of a nested reference behind as a literal.
  //
  // print is deliberately NOT short-circuited: it resolves for real and the
  // provider falls back to the print sentinel per unresolvable reference.
  const shortCircuit = composeContext.shortCircuitValue(composeContext.command)
  if (shortCircuit !== undefined) {
    return Object.fromEntries(keys.map((key) => [key, shortCircuit]))
  }

  // Load the named service-typed instances (their `stage:` was resolved by the
  // up-front pass; a `stage:` that is itself a service reference is rejected
  // at graph build), then inject the compose context into every service-typed
  // provider instance (held on the instance, never on its config — that config
  // object is part of the user's compose configuration).
  for (const providerName of manager.getServiceTypedInstanceNames()) {
    await manager.loadAndResolveProvider({ providerName })
  }
  for (const providerName of providerNames) {
    manager
      .getProvider(providerName)
      ?.instance?.setComposeContext?.(composeContext)
  }

  // Targeted pass over exactly this service's params. Deferred nodes remain
  // unresolved in the master placeholder graph, so re-filtering resolves them.
  // The up-front selection is included so an enclosing token whose inner
  // placeholder was deferred (`${opt:${service:...}}`) is eligible too — a node
  // is only added when its provider AND its out-edge providers are all
  // selected, which the service-typed names alone would not satisfy.
  await manager.resolveUnderPath({ pathPrefix, extraProviders: providerNames })

  const resolvedParams = manager.serviceConfigFile.services[alias].params
  return Object.fromEntries(keys.map((key) => [key, resolvedParams[key]]))
}
