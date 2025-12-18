import { ServerlessEngineDevMode } from '../../devMode/index.js'
import deploy from './deploy.js'
import remove from './remove.js'
import { log, progress } from '@serverless/util'

const logger = log.get('containers-library:deployer')
const sclProgress = progress.get('main')

/**
 * Handles deployment and removal operations for SCL projects
 */
export default class DeploymentTypeAwsApi {
  #state
  #projectConfig
  #projectPath
  #provider
  #stage
  #region
  #resourceNameBase
  /**
   * Creates a new SclDeployer instance
   * @param {Object} params - Constructor parameters
   * @param {Object} params.state - Project state manager
   * @param {Object} params.projectConfig - Project configuration
   * @param {string} params.projectPath - Path to project directory
   * @param {string} params.stage - Deployment stage (e.g. dev, prod)
   */
  constructor({
    state,
    projectConfig,
    projectPath,
    stage,
    provider,
    resourceNameBase,
  }) {
    this.#state = state
    this.#projectConfig = projectConfig
    this.#projectPath = projectPath
    this.#stage = stage
    this.#provider = provider
    this.#region = provider.aws.region
    this.#resourceNameBase = resourceNameBase
  }

  /**
   * Deploys the project based on provider configuration
   * Currently supports AWS deployments
   * @param {Object} params - Deployment parameters
   * @param {boolean} [params.force=false] - Force deployment regardless of changes
   * @returns {Promise<void>}
   */
  async deploy({ force = false } = {}) {
    sclProgress.notice(
      `Deploying to stage "${this.#stage}" in region "${this.#region}"`,
    )

    await deploy({
      state: this.#state,
      projectConfig: this.#projectConfig,
      projectPath: this.#projectPath,
      stage: this.#stage,
      provider: this.#provider,
      resourceNameBase: this.#resourceNameBase,
      force,
    })
  }

  /**
   * Removes deployed resources based on provider configuration
   * @param {Object} params - Removal parameters
   * @param {boolean} [params.all=false] - Remove all resources including shared ones
   * @param {boolean} [params.force=false] - Skip confirmation prompts
   * @returns {Promise<void>}
   */
  async remove({ all = false, force = false } = {}) {
    sclProgress.notice('Removing')

    await remove({
      state: this.#state,
      projectConfig: this.#projectConfig,
      projectPath: this.#projectPath,
      stage: this.#stage,
      provider: this.#provider,
      resourceNameBase: this.#resourceNameBase,
      all,
      force,
    })
  }

  /**
   * Starts the development environment
   * @returns {Promise<void>}
   */
  async dev({
    proxyPort = 3000,
    controlPort = 3001,
    onStart = null,
    onLogStdOut = null,
    onLogStdErr = null,
  } = {}) {
    const devMode = new ServerlessEngineDevMode({
      state: this.#state,
      projectConfig: this.#projectConfig,
      projectPath: this.#projectPath,
      stage: this.#stage,
      provider: this.#provider,
      resourceNameBase: this.#resourceNameBase,
      proxyPort,
      controlPort,
    })
    await devMode.start({
      onStart,
      onLogStdOut,
      onLogStdErr,
    })
  }
}
