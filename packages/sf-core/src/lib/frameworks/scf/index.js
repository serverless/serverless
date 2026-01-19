import { ServerlessEngine } from '@serverless/engine'
import { getServerlessContainerFrameworkConfigSchema } from './types.js'
import { ServerlessError, validateZodSchema, log } from '@serverless/util'

const logger = log.get('scf')

// Configure global settings
process.env.DOCKER_CLI_HINTS = false

/**
 * Serverless Container Framework
 * @class
 */
export class ServerlessContainerFramework {
  #configSchema
  #engine

  /**
   * Creates an instance of ServerlessContainersLibrary
   * @param {Object} params - The constructor parameters
   * @param {Object} [params.stateStore=null] - Store for persisting state with load() and save() methods
   * @param {Object} [params.projectConfig=null] - Configuration for the serverless containers project
   * @param {string} [params.projectPath=null] - Path to the project root
   * @param {string} params.stage - Deployment stage (e.g. 'dev', 'prod')
   * @param {Object} [params.provider=null] - Provider configuration options
   * @param {string} [params.provider.type=null] - Provider type (e.g. 'aws')
   * @param {string} [params.provider.region=null] - AWS region to deploy to
   * @throws {ServerlessError} When required parameters are missing or invalid
   */
  constructor({
    stateStore = null,
    projectConfig = null,
    projectPath = null,
    provider = null,
    stage,
  } = {}) {
    /**
     * Check projectConfig.deployment.type here because
     * it's needed to to create the full configuration schema.
     */
    if (!projectConfig.deployment?.type) {
      throw new ServerlessError(
        'deployment.type is required in configuration file',
        'MISSING_DEPLOYMENT_TYPE',
      )
    }

    /**
     * Get the configuration schema for this framework.
     * Extend it with the deployment.type schema.
     */
    this.#configSchema = getServerlessContainerFrameworkConfigSchema({
      deploymentType: projectConfig.deployment?.type,
    })

    // Validate project config
    validateZodSchema({
      schema: this.#configSchema,
      data: projectConfig,
      errorMessage: 'Invalid configuration:',
      errorCode: 'INVALID_CONFIGURATION',
    })

    // Initialize engine
    this.#engine = new ServerlessEngine({
      stateStore,
      projectConfig,
      projectPath,
      stage,
      provider,
    })

    logger.debug('Initialized Serverless Container Framework')
  }

  /**
   * Deploys the project
   * @param {Object} options - The options object
   * @param {boolean} [options.force=false] - Force deployment even if no changes detected
   * @returns {Promise<void>}
   */
  async deploy({ force = false } = {}) {
    return this.#engine.deploy({ force })
  }

  /**
   * Gets the current deployment state
   * @returns {Promise<Object>} The current deployment state
   */
  async info() {
    return this.#engine.getDeploymentState()
  }

  /**
   * Starts development mode.
   * The proxyPort and controlPort options are passed through to the engine's dev mode.
   * @param {Object} options - Development mode options.
   * @param {Function} [options.onStart=null] - Callback invoked when dev mode starts.
   * @param {Function} [options.onLogStdOut=null] - Callback for standard output logs.
   * @param {Function} [options.onLogStdErr=null] - Callback for standard error logs.
   * @param {number} [options.proxyPort] - Custom port for the main proxy server.
   * @param {number} [options.controlPort] - Custom port for the control server.
   * @returns {Promise<void>}
   */
  async dev({
    proxyPort,
    controlPort,
    onStart = null,
    onLogStdOut = null,
    onLogStdErr = null,
  } = {}) {
    return this.#engine.dev({
      proxyPort,
      controlPort,
      onStart,
      onLogStdOut,
      onLogStdErr,
    })
  }

  /**
   * Removes the project
   * @param {Object} options - The options object
   * @param {boolean} [options.all=false] - Remove all resources
   * @param {boolean} [options.force=false] - Force removal even if no resources found
   * @returns {Promise<void>}
   */
  async remove({ all = false, force = false } = {}) {
    return this.#engine.remove({ all, force })
  }

  async initIntegrations() {
    return this.#engine.executeCommand('init-integrations')
  }
}
