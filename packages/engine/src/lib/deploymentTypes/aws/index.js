import { ServerlessEngineDevMode } from '../../devMode/index.js'
import deploy from './deploy.js'
import remove from './remove.js'
import { ServerlessError, log, progress } from '@serverless/util'
import { detectAiFramework } from './detector.js'
import {
  createEventBridgeIntegrations,
  createScheduledEventBridgeIntegrations,
  reconcileEventBridgeIntegrations,
  setupIntegrationEnvVars,
} from '../sfaiAws/integrations/eventbridge.js'
import { AwsEventBridgeClient } from '../../aws/eventbridge.js'
import { AwsSsmClient } from '../../aws/ssm.js'
import SlackIntegration from '../../integrations/slack.js'

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
  #aiFramework
  #ssmClient
  #slackIntegration
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
    this.#ssmClient = new AwsSsmClient(provider.aws)
    this.#slackIntegration = new SlackIntegration({
      projectConfig: this.#projectConfig,
      stage: this.#stage,
      ssmClient: this.#ssmClient,
      state: this.#state,
    })
  }

  /**
   * Deploys the project based on provider configuration
   * Currently supports AWS deployments
   * @param {Object} params - Deployment parameters
   * @param {boolean} [params.force=false] - Force deployment regardless of changes
   * @returns {Promise<void>}
   */
  async deploy({ force = false } = {}) {
    this.#aiFramework = await detectAiFramework(this.#projectPath)
    sclProgress.notice(
      `Deploying to stage "${this.#stage}" in region "${this.#region}"`,
    )

    // Check for incompatible Mastra, Slack, and Lambda combination
    if (this.#aiFramework?.aiFramework === 'mastra') {
      for (const [containerName, containerConfig] of Object.entries(
        this.#projectConfig.containers ?? {},
      )) {
        if (
          containerConfig.compute?.type === 'awsLambda' &&
          Object.entries(containerConfig.integrations || {}).some(
            ([_, integration]) => integration.type === 'slack',
          )
        ) {
          throw new ServerlessError(
            `Container "${containerName}": Cannot deploy a container with Mastra, Slack integration, and AWS Lambda together. This combination is not supported.`,
            'INCOMPATIBLE_CONFIGURATION',
            { stack: false },
          )
        }
      }
    }

    // TODO: Should probably change this to be more fine grained eventually
    if (this.#slackIntegration.hasSlackIntegration()) {
      for (const containerName of Object.keys(
        this.#projectConfig.containers ?? {},
      )) {
        if (
          !this.#projectConfig.containers[containerName].environment
            ?.SLACK_BOT_TOKEN
        ) {
          this.#projectConfig.containers[containerName].environment = {
            ...this.#projectConfig.containers[containerName].environment,
            SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
            SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
            SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
          }
        }
      }
    }

    // Setup webhook path environment variables for integrations before deployment
    for (const [containerName, containerConfig] of Object.entries(
      this.#projectConfig.containers,
    )) {
      setupIntegrationEnvVars({
        containerConfig,
      })
    }

    await deploy({
      state: this.#state,
      projectConfig: this.#projectConfig,
      projectPath: this.#projectPath,
      stage: this.#stage,
      provider: this.#provider,
      resourceNameBase: this.#resourceNameBase,
      force,
      aiFramework: this.#aiFramework?.aiFramework ?? null,
    })

    for (const [containerName, containerConfig] of Object.entries(
      this.#projectConfig.containers,
    )) {
      const baseName = `${this.#projectConfig.name}-${containerName}`
      await Promise.all([
        createEventBridgeIntegrations({
          baseName,
          state: this.#state,
          serviceName: containerName,
          containerConfig,
          awsEventBridgeClient: new AwsEventBridgeClient(this.#provider.aws),
        }),
        createScheduledEventBridgeIntegrations({
          baseName,
          state: this.#state,
          serviceName: containerName,
          containerConfig,
          awsEventBridgeClient: new AwsEventBridgeClient(this.#provider.aws),
        }),
      ])
    }

    for (const [containerName, containerConfig] of Object.entries(
      this.#projectConfig.containers,
    )) {
      await reconcileEventBridgeIntegrations({
        state: this.#state,
        serviceName: containerName,
        containerConfig,
        awsEventBridgeClient: new AwsEventBridgeClient(this.#provider.aws),
      })
    }

    try {
      await this.#slackIntegration.deploy()
    } catch (error) {
      logger.debug('Failed to deploy slack integration', error)
    }
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
    await this.#slackIntegration.startDev()
    try {
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
    } catch (err) {
      throw err
    } finally {
      await this.#slackIntegration.stopDev()
    }
  }

  async #initIntegrations(options = {}) {
    await this.#slackIntegration.init()
    this.#state.save()
  }

  async executeCustomCommand(commandName, options = {}) {
    switch (commandName) {
      case 'init-integrations':
        return this.#initIntegrations(options)
      default:
        throw new ServerlessError(
          `Unsupported command: ${commandName}`,
          'UNSUPPORTED_COMMAND',
        )
    }
  }
}
