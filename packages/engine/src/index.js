import _ from 'lodash'
import { ServerlessError, prettyPrintZodError, log } from '@serverless/util'
import { obfuscateSensitiveData } from '@serverlessinc/sf-core/src/utils/general/index.js'
import { getServerlessEngineDeploymentStateSchema } from './types.js'
import DeploymentTypeAwsApi from './lib/deploymentTypes/awsApi/index.js'
import DeploymentTypeSfaiAws from './lib/deploymentTypes/sfaiAws/index.js'
import DeploymentTypeAws from './lib/deploymentTypes/aws/index.js'
import { detectAiFramework } from './lib/deploymentTypes/aws/detector.js'

const logger = log.get('engine')

// Configure global settings
process.env.DOCKER_CLI_HINTS = false

/**
 * Serverless Engine
 * @class
 */
export class ServerlessEngine {
  #deploymentType
  #deploymentTypeInstance
  #stateSchema
  #projectConfig
  #projectPath
  #stage
  #provider
  #state
  #resourceNameBase
  #deployer
  #devMode

  /**
   * Creates an instance of ServerlessEngine.
   * @param {Object} params - The constructor parameters
   * @param {Object} [params.stateStore=null] - Store for persisting state with load() and save() methods
   * @param {Object} [params.projectConfig=null] - Configuration for the serverless containers project
   * @param {string} [params.projectPath=null] - Path to the project root
   * @param {string} params.stage - Deployment stage (e.g. 'dev', 'prod')
   * @param {Object} [params.provider=null] - Cloud provider configuration
   * @throws {ServerlessError} When required parameters are missing or invalid
   */
  constructor({
    stateStore = null,
    projectConfig = null,
    projectPath = null,
    stage,
    provider = null,
  } = {}) {
    // Ensure stateStore is set
    if (!stateStore) {
      throw new ServerlessError('stateStore is missing', 'MISSING_STATE_STORE')
    }
    // Ensure the stateStore has a get and set functions
    if (
      typeof stateStore.load !== 'function' ||
      typeof stateStore.save !== 'function'
    ) {
      throw new ServerlessError(
        'stateStore is missing load or save function',
        'INVALID_STATE_STORE',
      )
    }
    // Ensure projectConfig is set
    if (!projectConfig) {
      throw new ServerlessError(
        'projectConfig is missing',
        'MISSING_PROJECT_CONFIG',
      )
    }
    // Ensure projectPath is set
    if (!projectPath) {
      throw new ServerlessError(
        'projectPath is missing',
        'MISSING_PROJECT_PATH',
      )
    }
    // Validate provider
    if (!provider) {
      throw new ServerlessError('provider is missing', 'MISSING_PROVIDER')
    }
    if (!provider.type) {
      throw new ServerlessError(
        'provider.type is missing',
        'MISSING_PROVIDER_TYPE',
      )
    }
    if (provider.type !== 'aws') {
      throw new ServerlessError(
        'Only "aws" provider is supported at this time',
        'INVALID_PROVIDER_TYPE',
      )
    }
    // Ensure stage is set
    if (!stage) {
      throw new ServerlessError('stage is missing', 'MISSING_STAGE')
    }
    // Ensure stage is 3-12 characters long
    // Needed to not create overly long cloud resource names.
    // This is not in zod, so we validate here.
    if (stage.length < 3 || stage.length > 12) {
      throw new ServerlessError(
        '"stage" must be 3-12 characters long',
        'INVALID_STAGE_LENGTH',
      )
    }

    this.#projectConfig = projectConfig
    this.#projectPath = projectPath
    this.#stage = stage
    this.#provider = provider
    // Get deployment type from projectConfig, or use default
    this.#deploymentType = this.#projectConfig.deployment.type || 'aws@1.0'
    logger.debug('Deployment type:', this.#deploymentType)
    // Get state schema for the deployment type
    this.#stateSchema = getServerlessEngineDeploymentStateSchema({
      deploymentType: this.#deploymentType,
    })
    // Create a resource name base for the project
    this.#resourceNameBase = `${projectConfig.name}-${stage}`

    // Initialize the private state object to prevent "undefined" errors.
    this.#state = {}

    /**
     * Enhance stateStore load and save functions
     * - Only the "deployment" property is touched.
     * - Other root-level properties remain intact.
     */

    /**
     * Load state from stateStore
     * @returns {Promise<void>}
     */
    this.#state.load = async () => {
      // Load state from stateStore
      let previousState = await stateStore.load()

      // If no state has been saved, initialize as an empty object.
      if (!previousState) {
        previousState = {}
      }

      // NOTE: Here is where we may later handle state auto-migration

      if (previousState?.deployment && previousState?.deployment?.isDeployed) {
        // Use the existing deployment state.
        // fullState is preserved entirely, including any root-level properties.
        this.#state.fullState = _.cloneDeep(previousState)
        // Engine only cares about the nested deployment property.
        this.#state.state = _.cloneDeep(previousState.deployment)
        // For comparison, keep a copy of the deployment state.
        this.#state.previousState = _.cloneDeep(previousState.deployment)
      } else {
        // Initialize a new deployment state using Zod defaults.
        // This new state will live only under the "deployment" key.
        const newDeploymentState = this.#stateSchema.parse({})
        // Add name, stage, and config to the deployment state.
        newDeploymentState.name = this.#projectConfig.name
        newDeploymentState.stage = this.#stage
        newDeploymentState.config = this.#projectConfig
        this.#state.state = _.cloneDeep(newDeploymentState)
        this.#state.previousState = _.cloneDeep(newDeploymentState)
        // Merge the new deployment state into the full state
        // while preserving any existing root-level properties.
        this.#state.fullState = Object.assign({}, previousState, {
          deployment: _.cloneDeep(newDeploymentState),
        })
      }

      logger.debug('Loaded deployment state:', this.#state.state)
    }

    /**
     * Save state to stateStore
     * @returns {Promise<void>}
     */
    this.#state.save = async () => {
      // Ensure state has the required properties
      let deploymentState = {
        ...this.#state.state,
        name: this.#state.state.name || this.#projectConfig.name,
        stage: this.#stage,
        timeCreated:
          this.#state.previousState?.timeCreated || new Date().toISOString(),
        timeLastUpdated: new Date().toISOString(),
      }

      // Validate state before saving using the Zod schema.
      deploymentState = await this.#stateSchema.safeParseAsync(deploymentState)
      if (!deploymentState.success) {
        const errorMessage = prettyPrintZodError({
          errorMessage: 'Invalid state syntax',
          zodError: deploymentState.error,
        })
        throw new ServerlessError(errorMessage, 'INVALID_STATE', {
          stack: false,
        })
      }
      deploymentState = deploymentState.data

      // Obfuscate any sensitive configuration data before saving
      if (deploymentState.config) {
        deploymentState.config = obfuscateSensitiveData({
          obj: deploymentState.config,
          sensitiveKeys: ['environment'],
        })
      }

      // Update only the "deployment" property of the full state.
      // This preserves any other root-level keys present.
      this.#state.fullState = Object.assign({}, this.#state.fullState, {
        deployment: deploymentState,
      })

      // Save the updated full state back into stateStore.
      await stateStore.save(this.#state.fullState)
      logger.debug('Saved full state:', this.#state.fullState)

      // Update local state copies for further operations.
      this.#state.state = _.cloneDeep(deploymentState)
      this.#state.previousState = _.cloneDeep(deploymentState)
    }

    // Determine and instantiate the deployment type
    if (this.#deploymentType === 'awsApi@1.0') {
      this.#deploymentTypeInstance = new DeploymentTypeAwsApi({
        state: this.#state,
        projectConfig: this.#projectConfig,
        projectPath: this.#projectPath,
        stage: this.#stage,
        provider: this.#provider,
        resourceNameBase: this.#resourceNameBase,
      })
    } else if (this.#deploymentType === 'sfaiAws@1.0') {
      this.#deploymentTypeInstance = new DeploymentTypeSfaiAws({
        state: this.#state,
        projectConfig: this.#projectConfig,
        projectPath: this.#projectPath,
        stage: this.#stage,
        provider: this.#provider,
        resourceNameBase: this.#resourceNameBase,
      })
    } else if (this.#deploymentType === 'aws@1.0') {
      this.#deploymentTypeInstance = new DeploymentTypeAws({
        state: this.#state,
        projectConfig: this.#projectConfig,
        projectPath: this.#projectPath,
        stage: this.#stage,
        provider: this.#provider,
        resourceNameBase: this.#resourceNameBase,
      })
    } else {
      throw new ServerlessError(
        `Unsupported deployment type: ${this.#deploymentType}`,
        'UNSUPPORTED_DEPLOYMENT_TYPE',
      )
    }

    logger.debug('Initialized Serverless Engine')
  }

  /**
   * Gets the current deployment state
   * @returns {Promise<Object>} The current deployment state
   */
  async getDeploymentState() {
    await this.#state.load()
    return this.#state.state
  }

  /**
   * Runs Serverless Engine Deploy
   * @param {Object} options - The options object
   * @param {boolean} [options.force=false] - Force deployment even if no changes detected
   * @returns {Promise<Object>} - Returns the updated state
   */
  async deploy({ force = false } = {}) {
    // Load state
    await this.#state.load()

    // Run deploy and get the updated state
    await this.#deploymentTypeInstance.deploy({ force })

    // On successful deployment..
    this.#state.state.timeLastDeployed = new Date().toISOString()
    this.#state.state.isDeployed = true
    // ONLY save new project config in state if deployment was successful
    this.#state.state.config = this.#projectConfig

    // Save the state
    await this.#state.save()

    return this.#state.state
  }

  /**
   * Runs Serverless Containers Dev Mode
   * @param {Object} options - The options object
   * @param {Function} options.onLogStdOut - The function to call when log output is received
   * @param {Function} options.onLogStdErr - The function to call when error log output is received
   * @returns {Promise<void>}
   */
  async dev({
    proxyPort = 3000,
    controlPort = 3001,
    onStart = null,
    onLogStdOut = null,
    onLogStdErr = null,
  } = {}) {
    // Validate
    await this.#state.load()

    // Start Dev Mode
    await this.#deploymentTypeInstance.dev({
      proxyPort,
      controlPort,
      onStart,
      onLogStdOut,
      onLogStdErr,
    })
  }

  /**
   * Runs Serverless Containers Remove
   * @param {Object} options - The options object
   * @param {boolean} [options.force=false] - Force removal even if there are warnings
   * @returns {Promise<void>}
   */
  async remove({ all = false, force = false }) {
    await this.#state.load()

    await this.#deploymentTypeInstance.remove({ all, force })

    // Reset state
    this.#state.state = {}
    this.#state.state.name = this.#projectConfig.name
    this.#state.state.stage = this.#stage
    this.#state.state.isDeployed = false
    this.#state.state.timeLastRemoved = new Date().toISOString()

    await this.#state.save()

    logger.debug('Final state', this.#state.state)

    return this.#state.state
  }

  async executeCommand(commandName, options = {}) {
    if (['deploy', 'dev', 'remove', 'info'].includes(commandName)) {
      return this[commandName](options)
    } else {
      if ('executeCustomCommand' in this.#deploymentTypeInstance) {
        await this.#state.load()
        const response =
          await this.#deploymentTypeInstance.executeCustomCommand(
            commandName,
            options,
          )
        await this.#state.save()
        return response
      }
      throw new ServerlessError(
        `Unsupported command: ${commandName}`,
        'UNSUPPORTED_COMMAND',
      )
    }
  }
}

export { detectAiFramework }
