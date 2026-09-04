import graphlib from '@dagrejs/graphlib'
import traverse from 'traverse'
import { getHumanFriendlyTime } from '../../../utils/index.js'
import { route } from '../../router.js'
import path from 'path'
import {
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
  style,
} from '@serverless/util'
import { resolveConfigAndGetState } from './state.js'
import {
  resolveServiceParams,
  serviceReferencesByAlias,
} from './service-params.js'
import _ from 'lodash'

const { Graph, alg } = graphlib

const composeParamRegex = /(?<=\$\{)[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+(?=\})/

/**
 * The only commands whose returned state may be persisted to the state store.
 * deploy/info gather real stack outputs (via the aws:info flow); remove's `{}`
 * is an intentional clear. Every other command — package, print, logs, invoke,
 * dev, deploy function, and anything added later — is read-only by
 * construction: its returned state is discarded and `localState` falls back to
 * the store when the service has dependents, so a fabricated empty state can
 * never wipe deployed outputs.
 */
const STATE_WRITER_COMMANDS = ['deploy', 'info', 'remove']

/**
 * @typedef {Object} State
 * @property {Record<string, any>} localState
 * @property {Function} putServiceState
 * @property {Function} getServiceState
 */

/**
 * Takes a parsed serverless-compose configuration and parses
 * the service into an object of serviceName (The compose serviceName not neccessarily the framework serviceName)
 * The other thing it does is parse out the `component` field defined and if it isn't defined it would be set to `serverless-framework`
 * As we add support to other components in Compose we will need to extend this method to detect different service types
 *
 * @typedef {Object} ComponentInput
 * @property {string} path - The relative or absolute path to the service
 * @property {Record<string, any>} params - The optional params defined in the service config
 * @property {string} component - The parsed compose component to use
 * @property {Record<string, any>} parsedParams - The parsed params from the service config that remove the brackets
 *
 * @typedef {Object} AllComponentsDefinition
 * @property {string} path - The path on the graph or rather the componet (ex. `serverless-framework`)
 * @property {ComponentInput} inputs - The inputs to the service to be used in the graph
 * @property {string[]} dependencies - The dependencies of the service
 *
 * @typedef {Record<string, AllComponentsDefinition>} AllComponents
 *
 * @param {Record<string, any>} configuration - The parsed serverless-compose configuration
 * @returns {Promise<AllComponents>} - The parsed service object
 */
const getAllComponents = async (configuration) => {
  const allComponents = {}

  for (const [key, val] of Object.entries(configuration.services)) {
    if (!val.component) {
      val.component = 'serverless-framework'
    }

    if (val.params) {
      if (!_.isPlainObject(val.params)) {
        throw new ServerlessError(
          `The params for the service "${key}" must be an object`,
          ServerlessErrorCodes.compose.COMPOSE_CONFIGURATION_INVALID,
        )
      }
      const parsedParams = {}
      for (const [key, value] of Object.entries(val.params)) {
        const matches = value.match(composeParamRegex)

        parsedParams[key] = Array.isArray(matches) ? matches[0] : value
      }
      val.parsedParams = parsedParams
    }

    allComponents[key] = {
      path: 'serverless-framework',
      inputs: val,
    }
  }
  return allComponents
}

/**
 * Takes the already parsed object of compose components and ensures that
 * all dependencies are correctly set for services.
 *
 * Two kinds of reference create a deploy-ordering edge:
 *  - Dot form `${alias.Key}` — found by the text scan below, byte-identical to
 *    its original behavior incl. the unknown-service typo error. Colon tokens
 *    (`${param:...}`, `${env:...}`, `${service:...}`, …) are never graph
 *    references for the scan: it has no view of the variable grammar (a
 *    fallback list, a nested variable), so it must not guess at them.
 *  - Service references — the built-in `${service:alias.Key}` and named
 *    `${<instance>:alias.Key}` of a service-typed resolver instance — supplied
 *    in `serviceReferences` from the resolver manager's placeholder graph, which
 *    sees every reference the variable grammar allows. An unknown alias is a
 *    typo and fails here, before any service runs. A reference adds an edge only
 *    when its effective stage equals the run stage: the built-in is same-stage
 *    by definition; a named instance uses its pinned `stage:`, or the run stage
 *    when it pins none. A pinned cross-stage reference is read-only — it reads
 *    already-deployed state and must NOT create ordering.
 *
 * @param {AllComponents} allComponents
 * @param {Object} [context]
 * @param {string} [context.runStage] - The stage of the current run.
 * @param {Record<string, string|undefined>} [context.instanceStages] - Map of
 *   declared service-typed instance name to its effective (pinned) stage. A
 *   present key with an `undefined` value means the instance pins no stage and
 *   therefore falls back to the run stage.
 * @param {Map<string, Array<{original: string, providerName: string, referencedAlias: string|null}>>} [context.serviceReferences]
 *   Service references per consuming alias (see `serviceReferencesByAlias`).
 *   `referencedAlias` is `null` when the alias is produced by a still-deferred
 *   inner reference — it cannot be named yet, so it adds no edge (the inner
 *   reference is its own entry).
 * @return {AllComponents}
 */
const setDependencies = (
  allComponents,
  { runStage, instanceStages = {}, serviceReferences = new Map() } = {},
) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g

  for (const alias of Object.keys(allComponents)) {
    const dependencies = traverse(allComponents[alias].inputs).reduce(
      (accum, value) => {
        const matches = typeof value === 'string' ? value.match(regex) : null
        if (matches) {
          for (const match of matches) {
            const inner = match.substring(2, match.length - 1)
            if (inner.includes(':')) {
              continue
            }
            const referencedComponent = inner.split('.')[0]

            if (!allComponents[referencedComponent]) {
              throw new ServerlessError(
                `The service "${referencedComponent}" does not exist. It is referenced by "${alias}" in expression "${match}".`,
                ServerlessErrorCodes.compose
                  .COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
                { stack: false },
              )
            }

            accum.add(referencedComponent)
          }
        }

        return accum
      },
      new Set(),
    )

    for (const {
      original,
      providerName,
      resolverType,
      referencedAlias,
      deferred,
      paramKey,
    } of serviceReferences.get(alias) ?? []) {
      // A service reference is `${<name>:<service>.<Output>}` — no resolver
      // segment. One arrives only when the service name contains ':', which
      // the variable grammar splits on before any provider sees the token
      // (`${service:orders:v2.Host}` → resolver `orders`, key `v2.Host`). The
      // grammar's delimiters cannot appear in a referenced service name; say
      // so instead of reporting an unknown service.
      if (resolverType) {
        throw new ServerlessError(
          `'${original}' in service "${alias}" has a resolver segment '${resolverType}', which a service reference does not take. A referenced service name cannot contain ':', ',', '}' or quotes — rename the service, or reference it without those characters.`,
          ServerlessErrorCodes.compose.COMPOSE_CONFIGURATION_INVALID,
          { stack: false },
        )
      }
      // The dot form replaces a param's WHOLE value with one output; a service
      // reference resolves in place. In one value they cannot both be honored
      // (the result would be a half-resolved literal), so the mix is a
      // configuration error, caught before any service runs.
      const rawValue =
        paramKey === null
          ? undefined
          : allComponents[alias].inputs.params?.[paramKey]
      const dotFormMatch =
        typeof rawValue === 'string' ? rawValue.match(composeParamRegex) : null
      if (dotFormMatch) {
        throw new ServerlessError(
          `Parameter '${paramKey}' of service "${alias}" mixes the '\${${dotFormMatch[0]}}' form with a service reference. Write every reference in the value as '\${service:<service>.<Output>}' (here: '\${service:${dotFormMatch[0]}}').`,
          ServerlessErrorCodes.compose.COMPOSE_CONFIGURATION_INVALID,
          { stack: false },
        )
      }
      // A service name that is still a variable when the deploy order is
      // decided — another service reference, or a variable that did not
      // resolve up front — could never be ordered; refuse it rather than
      // silently skip the edge.
      if (deferred) {
        throw new ServerlessError(
          `The service name in '${original}' (service "${alias}") is itself a variable that could not be resolved before the services were ordered (for example another service reference). Write the service name literally, or take it from a variable that resolves up front, such as '\${param:...}'.`,
          ServerlessErrorCodes.compose.COMPOSE_CONFIGURATION_INVALID,
          { stack: false },
        )
      }
      if (referencedAlias === null) {
        throw new ServerlessError(
          `'${original}' in service "${alias}" is not a service reference of the shape '<service>.<Output>' (for example 'orders-db.QueueUrl').`,
          ServerlessErrorCodes.compose.COMPOSE_CONFIGURATION_INVALID,
          { stack: false },
        )
      }
      if (!allComponents[referencedAlias]) {
        const availableServices = Object.keys(allComponents)
        const availableList =
          availableServices.length > 0 ? availableServices.join(', ') : '(none)'
        throw new ServerlessError(
          `The service "${referencedAlias}" does not exist. It is referenced by "${alias}" in expression "${original}". Available services: ${availableList}.`,
          ServerlessErrorCodes.compose
            .COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
          { stack: false },
        )
      }
      const effectiveStage =
        providerName === 'service'
          ? runStage
          : (instanceStages[providerName] ?? runStage)
      if (effectiveStage === runStage) {
        dependencies.add(referencedAlias)
      }
    }

    if (typeof allComponents[alias].inputs.dependsOn === 'string') {
      const explicitDependency = allComponents[alias].inputs.dependsOn
      if (!allComponents[explicitDependency]) {
        throw new ServerlessError(
          `The service "${explicitDependency}" referenced in "dependsOn" of "${alias}" does not exist`,
          ServerlessErrorCodes.compose
            .COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
          { stack: false },
        )
      }
      dependencies.add(explicitDependency)
    } else {
      const explicitDependencies = allComponents[alias].inputs.dependsOn || []
      for (const explicitDependency of explicitDependencies) {
        if (!allComponents[explicitDependency]) {
          throw new ServerlessError(
            `The service "${explicitDependency}" referenced in "dependsOn" of "${alias}" does not exist`,
            ServerlessErrorCodes.compose
              .COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
            { stack: false },
          )
        }
        dependencies.add(explicitDependency)
      }
    }

    allComponents[alias].dependencies = Array.from(dependencies)
  }

  return allComponents
}

/**
 * Takes the parsed set of Compose components to deploy, with their dependencies set.
 * Then it creates a dependency graph and validates there are no circular dependencies.
 * This graph is what the Compose class uses to determine the order in which to run services.
 *
 * @param {AllComponents} allComponents
 * @return {import('@dagrejs/graphlib').Graph}
 */
const createGraph = (allComponents) => {
  const graph = new Graph()

  for (const alias of Object.keys(allComponents)) {
    graph.setNode(alias, allComponents[alias])
  }

  for (const alias of Object.keys(allComponents)) {
    const { dependencies } = allComponents[alias]
    if (dependencies.length > 0) {
      for (const dependency of dependencies) {
        graph.setEdge(alias, dependency)
      }
    }
  }

  validateGraph(graph)

  return graph
}

/**
 * Takes a graph and validates that there are no circular dependencies.
 * If a circular dependency is found, an error is thrown with messaging
 * to inform users which services depend on each other.
 *
 * @param {import('@dagrejs/graphlib').Graph} graph
 */
const validateGraph = (graph) => {
  const isAcyclic = alg.isAcyclic(graph)
  if (!isAcyclic) {
    const cycles = alg.findCycles(graph)
    const msg = ['Your template has circular dependencies:']
    cycles.forEach((cycle, index) => {
      let fromAToB = cycle.join(' --> ')
      fromAToB = `${(index += 1)}. ${fromAToB}`
      const fromBToA = cycle.reverse().join(' <-- ')
      const padLength = fromAToB.length + 4
      msg.push(fromAToB.padStart(padLength))
      msg.push(fromBToA.padStart(padLength))
    }, cycles)
    throw new ServerlessError(
      msg.join('\n'),
      ServerlessErrorCodes.compose.COMPOSE_GRAPH_CIRCULAR_DEPENDENCY,
      { stack: false },
    )
  }
}

/**
 *
 * @param {{ servicePath: string, configuration: Record<string, any>, versions: Record<string, any>, resolverManager?: import('../../resolvers/manager.js').ResolverManager, runStage?: string, instanceStages?: Record<string, string|undefined> }}
 * @returns {Promise<Compose>}
 */
const parseComposeGraph = async ({
  servicePath,
  configuration,
  versions,
  resolverManager,
  runStage,
  instanceStages,
}) => {
  const allComponents = await getAllComponents(configuration)

  // Service references come from the manager's placeholder graph; without a
  // manager (test harnesses) only dot-form references create edges, just as the
  // dispatch-time service pass is skipped without one.
  // A named instance's `stage:` must be known here: it decides whether a
  // reference orders the deploy. The up-front pass resolves every ordinary
  // variable in it; only a service reference survives, and that cannot be
  // honored (the ordering it should influence is being decided right now).
  for (const [instanceName, stage] of Object.entries(instanceStages ?? {})) {
    if (typeof stage === 'string' && stage.includes('${')) {
      throw new ServerlessError(
        `The 'stage' of resolver '${instanceName}' is '${stage}', which could not be resolved before the services were ordered. Use a fixed stage name or a variable that resolves up front, such as '\${param:...}' or '\${opt:...}' — not a service reference.`,
        ServerlessErrorCodes.compose.COMPOSE_CONFIGURATION_INVALID,
        { stack: false },
      )
    }
  }

  const serviceReferences = resolverManager
    ? serviceReferencesByAlias({ manager: resolverManager })
    : new Map()

  const componentsWithDependencies = setDependencies(allComponents, {
    runStage,
    instanceStages,
    serviceReferences,
  })

  const graph = createGraph(componentsWithDependencies)

  // Which param keys of each service hold a service reference, decided once
  // here. Read later by the pinned cross-stage lookup, which must not depend
  // on whether that service's own dispatch pass has already run (and pruned
  // its nodes from the live placeholder graph).
  const serviceReferenceKeysByAlias = new Map(
    [...serviceReferences].map(([alias, references]) => [
      alias,
      new Set(
        references
          .map(({ paramKey }) => paramKey)
          .filter((paramKey) => paramKey !== null),
      ),
    ]),
  )

  return new Compose({
    components: componentsWithDependencies,
    graph,
    versions,
    servicePath,
    resolverManager,
    runStage,
    serviceReferenceKeysByAlias,
  })
}

class Compose {
  /**
   * @typdef {Object} ComposeParams
   * @property {Record<string, any>} components
   * @property {import('@dagrejs/graphlib').Graph} graph
   * @property {Record<string, any>} versions
   * @property {string} servicePath
   * @property {import('../../resolvers/manager.js').ResolverManager} [resolverManager]
   * @property {string} [runStage] - The stage of this run, as resolved by the
   *   compose-file resolver manager. The same value that selects
   *   `stages.<stage>` params, and the one the deploy-edge scan used.
   */
  constructor({
    components,
    graph,
    versions,
    servicePath,
    resolverManager,
    runStage,
    serviceReferenceKeysByAlias = new Map(),
  }) {
    this.components = components
    /** @type {Map<string, Set<string>>} alias → param keys holding a service reference */
    this.serviceReferenceKeysByAlias = serviceReferenceKeysByAlias
    this.graph = graph
    this.logger = log.get('core:compose')
    this.versions = versions
    this.servicePath = servicePath
    // The compose-file resolver manager. Used at dispatch time to resolve each
    // service's deferred `${service:...}`/`${shared:...}` params (see
    // ./service-params.js). Single-flight cache for pinned cross-stage
    // get-state fetches, keyed `${alias}::${effectiveStage}` so it never
    // collides with the run-stage localState entry.
    this.resolverManager = resolverManager
    this.runStage = runStage
    this.pinnedStateCache = new Map()
    /* @typedef {Set<string>} */
    this.successfulRuns = new Set()
    /* @typedef {Record<string, Error[]>} */
    this.failedRuns = {}
    /* @typedef {Set<string>} */
    this.notRun = new Set(Object.keys(this.components))
    this.startTime = new Date()
  }

  /**
   * Executes the Compose graph. It traverses the graph
   * at nodes with no dependencies. Then at each iteration
   * it will attempt to execute any nodes that now have
   * dependencies resolved.
   *
   * **NOTE:** This method will throw an error at the first failure.
   * However right now that does not mean we currently rollback already deployed services. We should,
   * but Compose currently does not function that way.
   * @param {{command: string[], reverse?: boolean, composeOrgName?: string, options?: Record<string, unknown>}}
   */
  async executeComponentsGraph({
    command,
    reverse,
    composeOrgName,
    options,
    resolverProviders,
    params,
    runnerFunction = route,
    state,
    isMultipleComponents = true,
  }) {
    if (command[0] === 'remove') {
      reverse = true
    }
    const nodes = reverse ? this.graph.sources() : this.graph.sinks()

    if (nodes.length === 0) {
      return
    }

    /** @type {Promise<void>[]} */
    const runPromises = []

    // Get the default main progress
    const progressMain = progress.get('main')

    const nodesToRun = new Set([...nodes])

    let progressMessagePrefix = 'Loading'

    if (command[0] === 'deploy') {
      progressMessagePrefix = 'Deploying'
    }

    if (command[0] === 'remove') {
      progressMessagePrefix = 'Removing'
    }

    if (command[0] !== 'get-state' && isMultipleComponents) {
      progressMain.notice(
        `${progressMessagePrefix} ${style.aside(`(${[...nodesToRun].join(', ')})`)}`,
        { isComposeMessage: true },
      )
    }

    // Dispatch-time wiring for service-provider graph references
    // (`${service:...}`/`${shared:...}`). Shared across all nodes at this graph
    // level so the pinned single-flight cache dedupes fetches project-wide.
    const runStage = this.runStage
    const aliases = Object.keys(this.components)
    // Reuse the same filtered options for the pinned cross-stage get-state as
    // the real per-service run (c/config select the compose file, not a service).
    const { c: _c, config: _config, ...filteredOptionsForDeps } = options
    // remove/get-state → '' (checked in the dispatch pass BEFORE any token
    // resolution, so the fetch below is unreachable in those modes).
    //
    // print is NOT short-circuited: it resolves for real, and the provider falls
    // back to the NOT_AVAILABLE_IN_PRINT_COMMAND sentinel when a reference
    // cannot resolve — the same semantics as the dot form below, which reads the
    // last deployed state.
    const shortCircuitValue = (cmd) => {
      if (cmd?.[0] === 'remove' || cmd?.[0] === 'get-state') {
        return ''
      }
      return undefined
    }
    // Where a dependency's outputs come from at resolution time:
    //  - same-stage (effectiveStage === runStage): this run's localState,
    //    populated by the dependency's own deploy/get-state (zero fetches).
    //  - pinned (effectiveStage !== runStage): a lazy get-state at the pinned
    //    stage, memoized per (alias, effectiveStage) as the in-flight PROMISE so
    //    concurrent consumers share one fetch and never collide with localState.
    const getOutputs = async (depAlias, effectiveStage) => {
      if (effectiveStage === runStage) {
        return state?.localState?.[depAlias]?.outputs
      }
      const cacheKey = `${depAlias}::${effectiveStage}`
      if (!this.pinnedStateCache.has(cacheKey)) {
        this.pinnedStateCache.set(
          cacheKey,
          (async () => {
            const depComponent = this.components[depAlias]
            const pinned = await resolveConfigAndGetState({
              command: ['get-state'],
              options: { ...filteredOptionsForDeps, stage: effectiveStage },
              compose: {
                workingDir: path.join(
                  this.servicePath,
                  depComponent.inputs.path,
                ),
                // The pinned dependency resolves its OWN serverless.yml, which
                // may consume `${param:...}` supplied by the compose file — so
                // it needs the same params a normal dispatch of it would get,
                // not an empty set (which makes them unresolvable and aborts
                // the run).
                params: this.resolvePinnedDependencyParams({
                  depAlias,
                  params,
                  state,
                }),
                serviceParams: depComponent.inputs.parsedParams || {},
                resolverProviders,
                isWithinCompose: true,
                orgName: composeOrgName,
                serviceName: depAlias,
              },
              state,
            })
            return pinned?.state ?? null
          })(),
        )
      }
      const pinnedState = await this.pinnedStateCache.get(cacheKey)
      return pinnedState?.outputs
    }

    for (const alias of nodes) {
      const data = this.graph.node(alias)

      runPromises.push(
        (async () => {
          try {
            const serviceParams = { ...params }

            // Resolve this service's deferred service-provider params
            // (`${service:...}`/`${shared:...}`) BEFORE the dot-form loop.
            // Only service-typed keys are returned;
            // they are merged over serviceParams after the (byte-identical)
            // dot-form loop so the two resolution paths coexist.
            let resolvedServiceParams = {}
            if (this.resolverManager) {
              resolvedServiceParams = await resolveServiceParams({
                manager: this.resolverManager,
                alias,
                composeContext: {
                  runStage,
                  aliases,
                  command,
                  getOutputs,
                  shortCircuitValue,
                },
              })
            }

            if (data.inputs.parsedParams) {
              for (const [key, value] of Object.entries(
                data.inputs.parsedParams,
              )) {
                // A key the service pass resolved is done: its value is the
                // pass's result (which may no longer be a string — an unquoted
                // literal fallback parses to a number or boolean), and the
                // dot-form loop below must not re-read it.
                if (Object.hasOwn(resolvedServiceParams, key)) {
                  serviceParams[key] = resolvedServiceParams[key]
                  continue
                }
                const isParamReference =
                  data.inputs.params[key].match(composeParamRegex)

                if (isParamReference) {
                  const splitKey = value.split('.')
                  const depService = splitKey[0]
                  const outputKey = splitKey[1]
                  const stateValue =
                    state?.localState?.[depService]?.outputs?.[outputKey]
                  // Use an explicit undefined check: a resolved output can be an
                  // empty string, which must pass through rather than be treated
                  // as missing.
                  if (stateValue === undefined) {
                    if (command[0] === 'print') {
                      serviceParams[key] = 'NOT_AVAILABLE_IN_PRINT_COMMAND'
                    } else if (
                      command[0] === 'remove' ||
                      command[0] === 'get-state'
                    ) {
                      // get-state is the read pass that WARMS the state params
                      // are resolved from — a missing dependency state here is
                      // expected (not deployed yet), never a failure. Throwing
                      // would poison the run report and exit code of an
                      // otherwise-successful run; the real command's own pass
                      // still fails loudly below if the param stays unresolved.
                      serviceParams[key] = ''
                    } else if (state?.localState?.[depService]) {
                      // The dependency's state IS present, but the referenced output
                      // key is missing — almost always a typo in the output name.
                      // Do NOT advise (re)deploying an already-deployed service (I2).
                      const availableOutputs = Object.keys(
                        state.localState[depService].outputs || {},
                      )
                      const availableList =
                        availableOutputs.length > 0
                          ? availableOutputs.join(', ')
                          : '(none)'
                      throw new ServerlessError(
                        `Could not resolve the parameter '${key}': service '${depService}' has no output '${outputKey}'. Available outputs: ${availableList}. Check the output name in your reference.`,
                        ServerlessErrorCodes.compose
                          .COMPOSE_COULD_NOT_RESOLVE_PARAM,
                        { stack: false },
                      )
                    } else {
                      // Compose does not normalize the -s shortcut (that happens
                      // per-service in the framework runner), so honor both here
                      // or the suggested command would silently target the
                      // default stage.
                      const stage = options?.stage || options?.s
                      const stageFlag = stage ? ` --stage ${stage}` : ''
                      throw new ServerlessError(
                        `Could not resolve the parameter '${key}': no deployed state found for service '${depService}'. Deploy it first with 'serverless deploy --service=${depService}${stageFlag}', then retry. If it is already deployed, refresh its state with 'serverless ${depService} info${stageFlag}'.`,
                        ServerlessErrorCodes.compose
                          .COMPOSE_COULD_NOT_RESOLVE_PARAM,
                        { stack: false },
                      )
                    }
                  } else {
                    serviceParams[key] = stateValue
                  }
                } else {
                  serviceParams[key] = value
                }
              }
            }

            /**
             * Call the runner function (e.g., route or any other function passed).
             */
            // Filter out c and config options
            // as might be used by Compose to select the correct config file
            const { c, config, ...filteredOptions } = options
            const runnerOutput = await runnerFunction({
              command,
              options: filteredOptions,
              versions: this.versions,
              compose: {
                workingDir: path.join(this.servicePath, data.inputs.path),
                params: serviceParams,
                serviceParams: data.inputs.parsedParams || {},
                resolverProviders,
                isWithinCompose: true,
                orgName: composeOrgName,
                serviceName: alias,
              },
              state,
            })

            await this.updateLocalState({
              alias,
              runnerOutput,
              command,
              state,
              graph: this.graph,
            })

            this.notRun.delete(alias)
            if (command[0] !== 'get-state' && isMultipleComponents) {
              this.successfulRuns.add(alias)

              this.logger.writeCompose(
                `${style.strong('✔')} ${style.bold(`${alias}`)}`,
              )

              const outputs = runnerOutput?.state?.outputs

              if (outputs && Object.keys(outputs).length > 0) {
                for (const key in outputs) {
                  this.logger.writeCompose(
                    `    ${style.aside(`${key}:`)} ${outputs[key]}`,
                  )
                }
              }
              if (
                runnerOutput?.deferredOutput &&
                typeof runnerOutput.deferredOutput === 'function'
              ) {
                await runnerOutput.deferredOutput()
              }
              this.logger.writeCompose(' ')
            }
          } catch (err) {
            this.failedRuns[alias] = [err]
            this.notRun.delete(alias)

            /**
             * If there are multiple components, we print the error
             * under the service that failed, and set the error exit code
             */
            if (isMultipleComponents) {
              this.logger.writeCompose(
                `${style.strong('✖')} ${style.bold(`${alias}`)}`,
              )

              this.logger.writeCompose(`    ${style.error(err.message)}`)
              this.logger.writeCompose(' ')

              // Ensure that the process exits with an error code
              process.exitCode = 1
            }

            // Throw error to stop execution on the graph, and handle the rejection below
            throw err
          } finally {
            nodesToRun.delete(alias)
            if (nodesToRun.size > 0 && command[0] !== 'get-state') {
              progressMain.notice(
                `${progressMessagePrefix} ${style.aside(`(${[...nodesToRun].join(', ')})`)}`,
                { isComposeMessage: true },
              )
            }
          }
        })(),
      )
    }

    const results = await Promise.allSettled(runPromises)

    const failed = results.filter((result) => result.status === 'rejected')

    if (failed.length > 0) {
      /**
       * If there is only one component to deploy, we throw the error
       * to be handled by the top level runner error handler to have
       * the same experience as deploying a single service
       *
       * We don't do that in case of multiple components because the compose
       * runner handles the error and prints the report at the end
       */
      if (!isMultipleComponents) {
        throw failed[0].reason
      }

      return
    }

    for (const alias of nodes) {
      this.graph.removeNode(alias)
    }

    await this.executeComponentsGraph({
      command,
      reverse,
      composeOrgName,
      options,
      resolverProviders,
      params,
      runnerFunction, // Pass the runner function along to the next recursive call
      state,
      isMultipleComponents, // Propagate so a single-mode error still rethrows on later graph levels
    })
  }

  /**
   * The Compose params a pinned (cross-stage) dependency's own configuration
   * resolves `${param:...}` against.
   *
   * A pinned read targets a different STAGE of the same project, not a different
   * param set: the run's resolved compose params are project-level inputs and
   * apply unchanged. The dependency's own `services.<alias>.params` are layered
   * on top, exactly as a normal dispatch of that service would receive them —
   * with one deliberate boundary. Two kinds of entry are omitted rather than
   * forwarded:
   *  - a service-typed token (`${service:...}`/`${<instance>:...}`): resolving it
   *    needs dispatch-time Compose state and could recurse back into this very
   *    pinned read, so a pinned dependency's configuration must not depend on
   *    one;
   *  - a dot-form reference whose dependency output is not in this run's local
   *    state yet: there is no value to supply, so nothing is invented for it.
   *
   * Omitting is not silent. If the pinned dependency's own configuration
   * actually consumes an omitted param, the pinned read itself fails with
   * MISSING_VARIABLE_RESULT naming that param — the honest outcome, since the
   * value genuinely is not knowable at that point. A possible future refinement
   * for the second case only: substitute `''` the way the dot-form loop already
   * does for `get-state`, so a pinned read degrades like every other read pass
   * instead of failing. Deliberately not done here — it trades a clear error for
   * a silent empty value and needs its own decision.
   *
   * @param {{ depAlias: string, params: Record<string, any>, state: State }}
   * @returns {Record<string, any>}
   */
  resolvePinnedDependencyParams({ depAlias, params, state }) {
    const resolved = { ...params }
    const depInputs = this.components[depAlias]?.inputs
    const depParams = depInputs?.params
    const depParsedParams = depInputs?.parsedParams
    if (!depParams || !depParsedParams) {
      return resolved
    }
    // Param keys of this dependency that carry a service reference, decided at
    // graph build (see `parseComposeGraph`) so the answer is the same whether
    // or not the dependency's own dispatch pass has already run. Empty without
    // a manager: the dot-form path has no service references to skip.
    const serviceReferenceKeys =
      this.serviceReferenceKeysByAlias.get(depAlias) ?? new Set()
    for (const [key, parsedValue] of Object.entries(depParsedParams)) {
      const rawValue = depParams[key]
      if (typeof rawValue !== 'string') {
        resolved[key] = parsedValue
        continue
      }
      if (serviceReferenceKeys.has(key)) {
        continue
      }
      if (rawValue.match(composeParamRegex)) {
        const [depService, outputKey] = parsedValue.split('.')
        const stateValue = state?.localState?.[depService]?.outputs?.[outputKey]
        if (stateValue !== undefined) {
          resolved[key] = stateValue
        }
        continue
      }
      resolved[key] = parsedValue
    }
    return resolved
  }

  /**
   * Updates the local state for a given service alias.
   *
   * @typedef {Object} UpdateLocalStateParams
   * @property {string} alias
   * @property {Object} runnerOutput
   * @property {string[]} command
   * @property {State} state
   * @property {import('@dagrejs/graphlib').Graph} graph
   *
   * @param {UpdateLocalStateParams}
   * @returns {Promise<void>}
   */
  async updateLocalState({ alias, runnerOutput, command, state, graph }) {
    const {
      state: returnedState,
      serviceUniqueId,
      runnerType,
    } = runnerOutput || {}

    const serviceUniqueIdProvided = serviceUniqueId && runnerType
    const isStateAuthoritative = STATE_WRITER_COMMANDS.includes(
      command.join(' '),
    )
    // get-state's returned state IS a store read: never re-persisted, but it
    // must still populate localState (it is the warming pass).
    const isGetState = command[0] === 'get-state'
    const usableState =
      isStateAuthoritative || isGetState ? returnedState : undefined

    if (serviceUniqueIdProvided && isStateAuthoritative && usableState) {
      await state?.putServiceState({
        serviceUniqueId,
        runnerType,
        value: JSON.stringify(usableState),
      })
    }

    if (
      state?.localState &&
      (usableState || graph.predecessors(alias)?.length)
    ) {
      state.localState[alias] =
        usableState ||
        (serviceUniqueIdProvided
          ? await state?.getServiceState({
              serviceUniqueId,
              runnerType,
            })
          : null)
    }
  }

  /**
   * Execute a single component in the Compose graph.
   * It runs the `info` command on the dependencies of the selected service
   * before running the original command on the selected service.
   * This is to ensure that the state of the dependencies is known before running the command on the selected service.
   *
   * @param {string} serviceName
   * @param {string[]} command
   * @param {boolean} reverse
   * @param {string} composeOrgName
   * @param {Record<string, any>} options
   * @param {Record<string, any>} resolverProviders
   * @param {Record<string, any>} params
   * @param {State} state
   * @returns {Promise<void>}
   */
  async executeSingleComponent({
    serviceName,
    command,
    reverse,
    composeOrgName,
    options,
    resolverProviders,
    params,
    state,
  }) {
    if (!this.graph.hasNode(serviceName)) {
      throw new ServerlessError(
        `The service "${serviceName}" does not exist in the Compose configuration.`,
        ServerlessErrorCodes.compose
          .COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
        { stack: false },
      )
    }
    // Delete the `service` option from the options object to pass through
    // Framework schema validation
    delete options.service
    // Get the data for the selected service
    const serviceData = this.graph.node(serviceName)
    if (command[0] !== 'remove') {
      // Get all dependencies of the selected service
      const nodesToKeep = this.getServiceDependencies(serviceName)
      // Filter the graph: Remove all nodes that are not dependencies of the selected service
      const nodesToRemove = this.graph
        .nodes()
        .filter((node) => !nodesToKeep.has(node))
      for (const node of nodesToRemove) {
        this.graph.removeNode(node)
      }
      // Run `get-state` command on the remaining graph (which are the dependencies)
      // to get the state of the dependencies before running the command on the selected service
      await this.executeComponentsGraph({
        command: ['get-state'],
        reverse,
        composeOrgName,
        options,
        resolverProviders,
        params,
        runnerFunction: resolveConfigAndGetState,
        state,
      })
    }

    // Set the graph to only contain the selected service
    this.graph = new Graph()
    this.graph.setNode(serviceName, serviceData)

    // Run the original command on the selected service
    await this.executeComponentsGraph({
      command,
      reverse,
      composeOrgName,
      options,
      resolverProviders,
      params,
      state,
      isMultipleComponents: false,
    })
  }

  /**
   * Execute a command on an exact subset of services (`--service=a,b`).
   *
   * Semantics — "exactly the named set": the command runs on precisely the
   * named services, dependency-ordered among themselves. Dependencies that
   * are NOT named are read (get-state) so `${param:}` references resolve,
   * but they are never deployed or removed.
   *
   * @param {string[]} serviceNames
   * @param {string[]} command
   * @param {boolean} reverse
   * @param {string} composeOrgName
   * @param {Record<string, any>} options
   * @param {Record<string, any>} resolverProviders
   * @param {Record<string, any>} params
   * @param {State} state
   * @returns {Promise<void>}
   */
  async executeSubsetComponents({
    serviceNames,
    command,
    reverse,
    composeOrgName,
    options,
    resolverProviders,
    params,
    state,
  }) {
    const availableServices = this.graph.nodes()
    for (const serviceName of serviceNames) {
      if (!this.graph.hasNode(serviceName)) {
        throw new ServerlessError(
          `The service "${serviceName}" does not exist in the Compose configuration. Available services: ${availableServices.join(', ')}.`,
          ServerlessErrorCodes.compose
            .COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
          { stack: false },
        )
      }
    }
    // Delete the `service` option from the options object to pass through
    // Framework schema validation (mirrors executeSingleComponent)
    delete options.service

    const named = new Set(serviceNames)
    // Capture node data and intra-set edges BEFORE any graph pruning
    const nodeData = new Map(
      serviceNames.map((name) => [name, this.graph.node(name)]),
    )
    // Keep only direct edges between two named services. A dependency that runs
    // THROUGH an unnamed (excluded) service has no in-run data path — the consumer
    // reads the unnamed dep's frozen state via get-state, not the currently-running
    // service — so there is no ordering to preserve and the two run in parallel.
    const intraSetEdges = this.graph
      .edges()
      .filter((edge) => named.has(edge.v) && named.has(edge.w))

    if (command[0] !== 'remove') {
      // Get-state the FULL transitive closure of the named set — do NOT subtract
      // named services. An unnamed dep can reference a NAMED service, so that named
      // service must be in the read pass for the dep's `${param:}` to resolve (C1).
      // Reading a named service's existing state is harmless: it is redeployed fresh
      // in the real run, and the exact-set guarantee (never deploy/remove an unnamed
      // service) is enforced by the rebuilt RUN graph below, not by pruning the read.
      const depsToFetch = new Set()
      for (const serviceName of serviceNames) {
        for (const dep of this.getServiceDependencies(serviceName)) {
          depsToFetch.add(dep)
        }
      }
      const nodesToRemove = this.graph
        .nodes()
        .filter((node) => !depsToFetch.has(node))
      for (const node of nodesToRemove) {
        this.graph.removeNode(node)
      }
      // The get-state pass runs with isMultipleComponents defaulting to true, so a
      // dependency that is not deployed yet does NOT abort the run: getServiceUniqueId
      // throws `Stack ... does not exist` for an absent stack, and that read failure
      // is tolerated here (the real run then teaches the correct "deploy it first"
      // message). This matches executeSingleComponent's get-state pass — the sibling
      // whose full-closure shape this method mirrors.
      await this.executeComponentsGraph({
        command: ['get-state'],
        reverse,
        composeOrgName,
        options,
        resolverProviders,
        params,
        runnerFunction: resolveConfigAndGetState,
        state,
      })
    }

    // Rebuild the graph with exactly the named services, keeping the edges
    // among them so the run stays dependency-ordered
    this.graph = new Graph()
    for (const [name, data] of nodeData) {
      this.graph.setNode(name, data)
    }
    for (const edge of intraSetEdges) {
      this.graph.setEdge(edge.v, edge.w)
    }

    await this.executeComponentsGraph({
      command,
      reverse,
      composeOrgName,
      options,
      resolverProviders,
      params,
      state,
      isMultipleComponents: true,
    })
  }

  /**
   * Get all dependencies for a service, including transitive dependencies.
   *
   * @param {string} serviceName
   * @returns {Set<string>}
   */
  getServiceDependencies(serviceName) {
    const visited = new Set()

    // Depth-first traversal to collect all dependencies (including transitive dependencies)
    const visit = (node) => {
      if (!visited.has(node)) {
        if (node !== serviceName) {
          visited.add(node)
        }
        const predecessors = this.graph.successors(node) || []
        for (const predecessor of predecessors) {
          visit(predecessor)
        }
      }
    }

    visit(serviceName)
    return visited
  }

  /**
   *   @typedef {Object} PrintRunReportParams
   *   @property {string[]} command
   *   @param {PrintRunReportParams}
   */
  printRunReport({ command }) {
    const endTime = new Date()
    const duration = Math.round((endTime - this.startTime) / 1000)

    const deployedCount = this.successfulRuns.size
    const failedCount = Object.keys(this.failedRuns).length || 0
    const skippedCount = this.notRun.size || 0
    const totalCount = deployedCount + failedCount + skippedCount

    let failedMessage = `${failedCount} failed`

    if (failedCount != 0) {
      failedMessage = `${style.error(`${failedCount} failed`)}`
    }

    this.logger.writeCompose(
      `${style.aside('Results:')} ${deployedCount} services succeeded, ${failedMessage}, ${skippedCount} skipped, ${totalCount} total    ${style.aside('Time:')} ${getHumanFriendlyTime({ seconds: duration })}\n`,
    )
  }
}

export { parseComposeGraph }
