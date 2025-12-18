import graphlib from '@dagrejs/graphlib'
import traverse from 'traverse'
import { getHumanFriendlyTime } from '../../../utils/index.js'
import { route } from '../../router.js'
import path from 'path'
import {
  ServerlessError,
  ServerlessErrorCodes,
  log,
  progress,
  style,
} from '@serverless/util'
import { resolveConfigAndGetState } from './state.js'
import _ from 'lodash'

const { Graph, alg } = graphlib

const composeParamRegex = /(?<=\$\{)[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+(?=\})/

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
 * @param {AllComponents} allComponents
 * @return {AllComponents}
 */
const setDependencies = (allComponents) => {
  const regex = /\${(\w*:?[\w\d.-]+)}/g

  for (const alias of Object.keys(allComponents)) {
    const dependencies = traverse(allComponents[alias].inputs).reduce(
      (accum, value) => {
        const matches = typeof value === 'string' ? value.match(regex) : null
        if (matches) {
          for (const match of matches) {
            const referencedComponent = match
              .substring(2, match.length - 1)
              .split('.')[0]

            if (!allComponents[referencedComponent]) {
              throw new ServerlessError(
                `The service "${referencedComponent}" does not exist. It is referenced by "${alias}" in expression "${match}".`,
                ServerlessErrorCodes.compose.COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
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

    if (typeof allComponents[alias].inputs.dependsOn === 'string') {
      const explicitDependency = allComponents[alias].inputs.dependsOn
      if (!allComponents[explicitDependency]) {
        throw new ServerlessError(
          `The service "${explicitDependency}" referenced in "dependsOn" of "${alias}" does not exist`,
          ServerlessErrorCodes.compose.COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
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
            ServerlessErrorCodes.compose.COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
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
 * @param {{ servicePath: string, configuration: Record<string, any>, versions: Record<string, any> }}
 * @returns {Promise<Compose>}
 */
const parseComposeGraph = async ({ servicePath, configuration, versions }) => {
  const allComponents = await getAllComponents(configuration)

  const componentsWithDependencies = setDependencies(allComponents)

  const graph = createGraph(componentsWithDependencies)

  return new Compose({
    components: componentsWithDependencies,
    graph,
    versions,
    servicePath,
  })
}

class Compose {
  /**
   * @typdef {Object} ComposeParams
   * @property {Record<string, any>} components
   * @property {import('@dagrejs/graphlib').Graph} graph
   * @property {Record<string, any>} versions
   * @property {string} servicePath
   */
  constructor({ components, graph, versions, servicePath }) {
    this.components = components
    this.graph = graph
    this.logger = log.get('core:compose')
    this.versions = versions
    this.servicePath = servicePath
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

    for (const alias of nodes) {
      const data = this.graph.node(alias)

      runPromises.push(
        (async () => {
          try {
            const serviceParams = { ...params }
            if (data.inputs.parsedParams) {
              for (const [key, value] of Object.entries(
                data.inputs.parsedParams,
              )) {
                const isParamReference =
                  data.inputs.params[key].match(composeParamRegex)

                if (isParamReference) {
                  const splitKey = value.split('.')
                  const stateValue =
                    state?.localState?.[splitKey[0]]?.outputs?.[splitKey[1]]
                  if (!stateValue) {
                    if (command[0] === 'print') {
                      serviceParams[key] = 'NOT_AVAILABLE_IN_PRINT_COMMAND'
                    } else if (command[0] === 'remove') {
                      serviceParams[key] = ''
                    } else {
                      throw new ServerlessError(
                        `Could not resolve the parameter '${key}'. Please ensure that it is correctly defined in the Compose configuration and that all dependent services are deployed. If the services are deployed, verify that their state is up to date by running 'deploy' or 'info' command on the Compose file.`,
                        ServerlessErrorCodes.compose.COMPOSE_COULD_NOT_RESOLVE_PARAM,
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
    })
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

    if (
      serviceUniqueIdProvided &&
      returnedState &&
      command[0] !== 'get-state'
    ) {
      await state?.putServiceState({
        serviceUniqueId,
        runnerType,
        value: JSON.stringify(returnedState),
      })
    }

    if (
      state?.localState &&
      (returnedState || graph.predecessors(alias)?.length)
    ) {
      state.localState[alias] =
        returnedState ||
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
        ServerlessErrorCodes.compose.COMPOSE_GRAPH_SERVICE_DEPENDENCY_DOES_NOT_EXIST,
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
