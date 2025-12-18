import { ServerlessEngine } from '@serverless/engine'
import { getServerlessAiFrameworkConfigSchema } from './types.js'
import { validateZodSchema, log } from '@serverless/util'

const logger = log.get('scf')

// Configure global settings
process.env.DOCKER_CLI_HINTS = false

export class ServerlessAiFramework {
  #configSchema
  #engine
  #projectConfig

  constructor({
    stateStore = null,
    projectConfig = null,
    projectPath = null,
    provider = null,
    stage,
  } = {}) {
    /**
     * Validate the project config
     */
    this.#configSchema = getServerlessAiFrameworkConfigSchema({
      deploymentType: 'sfaiAws@1.0',
    })
    this.#projectConfig = validateZodSchema({
      schema: this.#configSchema,
      data: projectConfig,
      errorMessage: 'Invalid configuration:',
      errorCode: 'INVALID_CONFIGURATION',
    })

    this.#engine = new ServerlessEngine({
      stateStore,
      projectConfig: this.#projectConfig,
      projectPath,
      stage,
      provider,
    })

    logger.debug('Initialized Serverless AI Framework')
  }

  async deploy({ force = false } = {}) {
    return this.#engine.deploy({ force })
  }

  async info() {
    return this.#engine.getDeploymentState()
  }

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

  async remove({ all = false, force = false } = {}) {
    return this.#engine.remove({ all, force })
  }

  async initIntegrations() {
    return this.#engine.executeCommand('init-integrations')
  }
}
