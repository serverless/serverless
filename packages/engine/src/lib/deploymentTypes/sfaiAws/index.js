import { ServerlessEngineDevMode } from '../../devMode/index.js'
import deploy from './deploy.js'
import remove from './remove.js'
import {
  colorizeString,
  log,
  progress,
  ServerlessError,
  style,
} from '@serverless/util'
import _ from 'lodash'
import {
  createAndWaitForSlackAppInstallation,
  createManifest,
  getSlackCredentialsFromEnvironment,
  getSlackConfigTokenCredentials,
  updateSlackAppMode,
  refreshSlackConfigToken,
  removeSlackAppForDev,
} from './slack/apps.js'
import {
  createEventBridgeIntegrations,
  createScheduledEventBridgeIntegrations,
  reconcileEventBridgeIntegrations,
} from './integrations/eventbridge.js'
import { ServerlessAiManifestSchema } from './types.js'
import fs from 'fs'
import path from 'path'
import { AwsEventBridgeClient } from '../../aws/eventbridge.js'
import { AwsSsmClient } from '../../aws/ssm.js'
import { ParameterType } from '@aws-sdk/client-ssm'
import { setTimeout } from 'timers/promises'
import { EventSource } from 'eventsource'

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
  #ssmClient
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
  }

  #generateSlackManifestConfig(
    integrationName,
    integrationConfig,
    isDev = false,
  ) {
    const socketMode = isDev
    return [
      integrationName,
      {
        type: integrationConfig.type,
        handler: integrationConfig.handler ?? undefined,
        path: `/v1/integrations/${integrationName}/slack`,
        config: {
          name: integrationName,
          socketMode,
          credentialsEnvironmentVariables: {
            botToken: `${integrationName}_SLACK_BOT_TOKEN`,
            signingSecret: `${integrationName}_SLACK_SIGNING_SECRET`,
            appToken: `${integrationName}_SLACK_APP_TOKEN`,
          },
        },
      },
    ]
  }

  #generateMcpManifestConfig(integrationName, integrationConfig) {
    return [
      integrationName,
      {
        type: 'mcp',
        handler: integrationConfig.handler,
        path: `/v1/integrations/${integrationName}/mcp`,
        config: {
          description: integrationConfig.description,
          credentialsEnvironmentVariables: {
            bearerToken: `${integrationName}_MCP_BEARER_TOKEN`,
          },
        },
      },
    ]
  }
  #generateAwsEventBridgeManifestConfig(integrationName, integrationConfig) {
    return [
      integrationName,
      {
        type: 'awsEventBridge',
        handler: integrationConfig.handler,
        path: `/v1/integrations/${integrationName}/eventbridge`,
        config: {
          pattern: integrationConfig.pattern,
          webhookSecretEnvironmentName: `${integrationName}_EVENTBRIDGE_WEBHOOK_SECRET`,
        },
      },
    ]
  }

  #generateStreamManifestConfig(integrationName, integrationConfig) {
    return [
      integrationName,
      {
        type: 'stream',
        handler: integrationConfig.handler,
      },
    ]
  }

  #generateScheduleManifestConfig(integrationName, integrationConfig) {
    return [
      integrationName,
      {
        type: 'schedule',
        handler: integrationConfig.handler,
        path: `/v1/integrations/${integrationName}/schedule`,
        config: {
          schedule: integrationConfig.schedule,
        },
      },
    ]
  }

  #generateManifestConfig(integrationName, integrationConfig, isDev = false) {
    switch (integrationConfig.type) {
      case 'slack':
        return this.#generateSlackManifestConfig(
          integrationName,
          integrationConfig,
          isDev,
        )
      case 'awsEventBridge':
        return this.#generateAwsEventBridgeManifestConfig(
          integrationName,
          integrationConfig,
        )
      case 'stream':
        return this.#generateStreamManifestConfig(
          integrationName,
          integrationConfig,
        )
      case 'schedule':
        return this.#generateScheduleManifestConfig(
          integrationName,
          integrationConfig,
        )
      case 'mcp':
        return this.#generateMcpManifestConfig(
          integrationName,
          integrationConfig,
        )
      default:
        throw new ServerlessError(
          `Unsupported integration type: ${integrationConfig.type}`,
          'UNSUPPORTED_INTEGRATION_TYPE',
          { stack: false },
        )
    }
  }

  async #getSlackAppCredentials(integrationName) {
    const credentials = await this.#ssmClient.getSsmParameter({
      paramName: `/${this.#projectConfig.name}/${this.#stage}/slack/appconfig/credentials`,
    })
    if (!credentials) {
      return undefined
    }
    const expiresAt = new Date(JSON.parse(credentials).expiresAt)
    if (expiresAt < new Date()) {
      logger.warning('Slack app config credentials are expired, refreshing')
      const credentialsObject = JSON.parse(credentials)
      const refreshedCredentials = await refreshSlackConfigToken({
        configToken: credentialsObject.configToken,
        refreshToken: credentialsObject.refreshToken,
      })
      await this.#storeSlackAppCredentials(
        integrationName,
        refreshedCredentials,
      )
      return refreshedCredentials
    }
    return JSON.parse(credentials)
  }

  async #storeSlackAppCredentials(integrationName, credentials) {
    await this.#ssmClient.storeSSMParameter({
      paramName: `/${this.#projectConfig.name}/${this.#stage}/slack/appconfig/credentials`,
      paramValue: JSON.stringify(credentials),
      overwrite: true,
      type: ParameterType.SECURE_STRING,
    })
  }

  async #deleteSlackAppCredentials() {
    await this.#ssmClient.deleteSSMParameter({
      paramName: `/${this.#projectConfig.name}/${this.#stage}/slack/appconfig/credentials`,
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
    sclProgress.notice(
      `Deploying to stage "${this.#stage}" in region "${this.#region}"`,
    )

    const agent = this.#projectConfig.agent

    const rawManifest = {
      name: this.#projectConfig.name,
      agent: {
        name: agent.name,
        type: 'mastraAgent',
        entryPoint: agent.src,
        integrations: Object.fromEntries(
          Object.entries(agent.integrations ?? {}).map(
            ([integrationName, integrationConfig]) => {
              return this.#generateManifestConfig(
                integrationName,
                integrationConfig,
                false,
              )
            },
          ),
        ),
      },
    }
    const manifest = ServerlessAiManifestSchema.parse(rawManifest)

    await deploy({
      state: this.#state,
      projectConfig: this.#projectConfig,
      projectPath: this.#projectPath,
      stage: this.#stage,
      provider: this.#provider,
      resourceNameBase: this.#resourceNameBase,
      force,
      manifest,
    })

    await Promise.all([
      createEventBridgeIntegrations({
        baseName: this.#projectConfig.name,
        state: this.#state,
        agentName: 'service',
        agentConfig: this.#projectConfig.agent,
        awsEventBridgeClient: new AwsEventBridgeClient(this.#provider.aws),
      }),
      createScheduledEventBridgeIntegrations({
        baseName: this.#projectConfig.name,
        state: this.#state,
        agentName: 'service',
        agentConfig: this.#projectConfig.agent,
        awsEventBridgeClient: new AwsEventBridgeClient(this.#provider.aws),
      }),
    ])

    // Need to reconcile eventbridge and schedule integrations AFTER new integrations are created
    await reconcileEventBridgeIntegrations({
      state: this.#state,
      agentName: 'service',
      agentConfig: this.#projectConfig.agent,
      awsEventBridgeClient: new AwsEventBridgeClient(this.#provider.aws),
    })

    const slackIntegration = Object.entries(
      this.#state.state.containers['service'].integrations ?? {},
    ).find(([name, integration]) => integration.type === 'slack')
    if (slackIntegration) {
      logger.warning('Slack integration found, updating slack app mode')
      const slackCredentials = await this.#getSlackAppCredentials(
        slackIntegration[0],
      )

      let containerUrl = null
      if (this.#state.state.containers['service'].routing.customDomain) {
        containerUrl = `https://${this.#state.state.containers['service'].routing.customDomain}`
      } else if (
        this.#state.state.containers['service'].routing.awsCloudFront
          ?.distributionDomainName
      ) {
        containerUrl = `https://${this.#state.state.containers['service'].routing.awsCloudFront.distributionDomainName}`
      }

      await updateSlackAppMode({
        appId: slackIntegration[1].appId,
        socketMode: false,
        requestUrl: `${containerUrl}/v1/integrations/${slackIntegration[0]}/slack`,
        configToken: slackCredentials.configToken,
      })
    }

    if (!this.#state.state.containers['service'].integrations) {
      this.#state.state.containers['service'].integrations = {}
    }

    const mcpIntegration = Object.entries(
      manifest.agent.integrations ?? {},
    ).find(([name, integration]) => integration.type === 'mcp')

    if (mcpIntegration) {
      this.#state.state.containers['service'].integrations[mcpIntegration[0]] =
        {
          type: 'mcp',
          path: mcpIntegration[1].path,
        }
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

    // If force flag is set, remove the Slack application and stored credentials
    if (force) {
      const globalIntegrations = this.#state.state.integrations ?? {}
      const slackEntry = Object.entries(globalIntegrations).find(
        ([name, integration]) => integration.type === 'slack',
      )
      if (slackEntry) {
        const [integrationName, integration] = slackEntry
        let slackCredentials
        try {
          slackCredentials = await this.#getSlackAppCredentials(integrationName)
        } catch (err) {
          logger.error(
            `Failed to retrieve Slack credentials for integration '${integrationName}': ${err.message}`,
          )
        }
        if (slackCredentials?.configToken) {
          try {
            await removeSlackAppForDev({
              appId: integration.appId,
              configToken: slackCredentials.configToken,
            })
            logger.success(`Slack app '${integrationName}' removed`)
          } catch (err) {
            logger.error(
              `Failed to remove Slack app '${integration.appId}': ${err.message}`,
            )
          }
        }
        // delete stored Slack app credentials
        await this.#deleteSlackAppCredentials()
        // remove integration state
        delete this.#state.state.integrations[integrationName]
        await this.#state.save()
      }
    } else {
      logger.debug('Force flag not set, skipping Slack app removal')
    }
  }

  #devmodeStream() {
    const es = new EventSource('http://localhost:3000/v1/dashboard/events')
    const serviceName = colorizeString('[agent]')
    es.addEventListener(
      'connection',
      (event) => {},
      // console.log('connection', event),
    )
    es.addEventListener('log', (event) => {
      const data = JSON.parse(event.data)
      if (data?.source === 'slack') {
        const direction = data.attributes?.direction === 'received' ? '›' : '‹'
        logger.write(`${serviceName} ${direction} ${data.message}\n`)
      } else if (data?.source === 'mastra') {
        if (data.message.startsWith('Tool called')) {
          const toolName = data.attributes?.event?.toolName ?? 'unknown'
          logger.write(`${serviceName} · Tool: ${toolName} called\n`)
        }
      } else if (data?.source === 'openai') {
        const direction = data.attributes?.direction === 'received' ? '›' : '‹'
        logger.write(`${serviceName} ${direction} ${data.message}\n`)
      } else if (data?.level === 'error') {
        logger.write(`${serviceName} ${style.error(data.message)}\n`)
      } else {
        console.log(JSON.stringify(data, null, 2))
      }
    })
    es.addEventListener('trace', (event) => console.log('trace', event))

    return es
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
    const agent = this.#projectConfig.agent

    const rawManifest = {
      name: this.#projectConfig.name,
      orchestrator: {
        port: 8080,
        baseUrl: 'http://localhost:8080/v1',
        devDashboard: true,
      },
      agent: {
        name: agent.name,
        type: 'mastraAgent',
        entryPoint: agent.src,
        integrations: Object.fromEntries(
          Object.entries(agent.integrations ?? {}).map(
            ([integrationName, integrationConfig]) => {
              return this.#generateManifestConfig(
                integrationName,
                integrationConfig,
                true,
              )
            },
          ),
        ),
      },
    }
    const manifest = ServerlessAiManifestSchema.parse(rawManifest)

    // console.log('\n\n')
    // console.log(JSON.stringify(manifest, null, 2))
    // console.log('\n\n')

    const defaultDockerfile = `
    FROM public.ecr.aws/serverless-container-framework/sfai/base-nodejs:0.0.13
    RUN npm install -g nodemon
    WORKDIR /shim/app
    RUN echo '${JSON.stringify(manifest)}' > /.serverless.ai.manifest.json
    ENTRYPOINT ["nodemon", "-q", "/ai-framework/bin/start", "--", "--config", "/.serverless.ai.manifest.json"]`
    this.#projectConfig.containers = {
      service: {
        ..._.cloneDeep(this.#projectConfig.agent),
        src: './',
        routing: { pathPattern: '/*', ...this.#projectConfig.agent.routing },
        build: { dockerFileString: defaultDockerfile },
      }, // Note the "service" key is hardcoded for single container frameworks.
    }

    const slackIntegrationFromConfigEntry = Object.entries(
      this.#projectConfig.containers.service.integrations ?? {},
    ).find(([_name, integration]) => integration.type === 'slack')
    const slackIntegrationFromConfig = slackIntegrationFromConfigEntry
      ? slackIntegrationFromConfigEntry[1]
      : null

    // Load environment variables defined in the manifest into the project config
    const slackIntegrationEntry = Object.entries(
      manifest.agent.integrations ?? {},
    ).find(([name, integration]) => integration.type === 'slack')
    const slackIntegration = slackIntegrationEntry
      ? slackIntegrationEntry[1]
      : null

    const slackCredentials = getSlackCredentialsFromEnvironment()

    const slackIntegrationFromState = Object.entries(
      this.#state.state.containers['service'].integrations ?? {},
    ).find(([name, integration]) => integration.type === 'slack')

    let slackIntegrationSetup = false
    if (
      slackIntegration &&
      slackCredentials.botToken &&
      slackCredentials.signingSecret &&
      slackCredentials.appToken &&
      slackIntegrationFromState[1].appId
    ) {
      slackIntegrationSetup = true
      const envVars = slackIntegration.config.credentialsEnvironmentVariables
      logger.debug('using environment variables for slack credentials')
      this.#projectConfig.containers.service.environment[
        envVars.signingSecret
      ] = slackCredentials.signingSecret
      this.#projectConfig.containers.service.environment[envVars.botToken] =
        slackCredentials.botToken
      this.#projectConfig.containers.service.environment[envVars.appToken] =
        slackCredentials.appToken

      const slackConfigCredentials = await this.#getSlackAppCredentials(
        slackIntegrationFromState[0],
      )
      await updateSlackAppMode({
        appId: slackIntegrationFromState[1].appId,
        socketMode: true,
        configToken: slackConfigCredentials.configToken,
      })
    } else if (slackIntegration) {
      throw new ServerlessError(
        `Slack integration credentials not found. Please run \`serverless init-integrations\` and add slack credentials to your environment`,
        'SLACK_INTEGRATION_CREDENTIALS_NOT_FOUND',
        { stack: false },
      )
    }

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
    let es = null
    await devMode.start({
      onStart,
      onLogStdOut,
      onLogStdErr,
      onDevModeStream: () => {
        es = this.#devmodeStream()
      },
    })

    let containerUrl = null
    if (this.#state.state.containers['service'].routing?.customDomain) {
      containerUrl = `https://${this.#state.state.containers['service'].routing.customDomain}`
    } else if (
      this.#state.state.containers['service'].routing?.awsCloudFront
        ?.distributionDomainName
    ) {
      containerUrl = `https://${this.#state.state.containers['service'].routing.awsCloudFront.distributionDomainName}`
    }

    if (slackIntegrationSetup && containerUrl) {
      const slackConfigCredentials = await this.#getSlackAppCredentials(
        slackIntegrationFromState[0],
      )
      await updateSlackAppMode({
        appId: slackIntegrationFromState[1].appId,
        socketMode: false,
        requestUrl: `${containerUrl}/v1/integrations/${slackIntegrationFromState[0]}/slack`,
        configToken: slackConfigCredentials.configToken,
      })
    }

    es.close()
  }

  async #initSlackIntegration(integrationName, integrationConfig) {
    const containerName = 'service'
    if (
      this.#state.state.containers[containerName]?.integrations?.[
        integrationName
      ]
    ) {
      logger.warning(
        `Slack integration ${integrationName} already exists, skipping.`,
      )
      return
    }
    const slackEnvCredentials = getSlackCredentialsFromEnvironment()
    if (slackEnvCredentials.botToken && slackEnvCredentials.signingSecret) {
      logger.warning(
        `Slack integration ${integrationName} already has credentials in the environment, skipping.`,
      )
      return
    }

    let slackConfigCredentials =
      await this.#getSlackAppCredentials(integrationName)
    if (!slackConfigCredentials) {
      slackConfigCredentials = await getSlackConfigTokenCredentials()
      await this.#storeSlackAppCredentials(
        integrationName,
        slackConfigCredentials,
      )
      logger.success('Slack app config credentials stored in AWS SSM')
      await setTimeout(4000)
    } else {
      // TODO: Check if credentials are expired
    }

    // If no credentials are provided, create a new app
    if (integrationConfig && !integrationConfig.credentials) {
      const createAppResult = await createAndWaitForSlackAppInstallation(
        createManifest({ appDisplayName: integrationConfig.name }),
        slackConfigCredentials,
      )

      logger.write(
        `Slack integration ${integrationName} created.\n` +
          `Please add the following to your environment:\n` +
          `\SLACK_SIGNING_SECRET=${createAppResult.signingSecret}\n` +
          `\SLACK_BOT_TOKEN=${createAppResult.botToken}\n` +
          `\SLACK_APP_TOKEN=${createAppResult.appToken}\n`,
      )

      if (!this.#state.state.integrations) {
        this.#state.state.integrations = {}
      }
      if (!this.#state.state.integrations[integrationName]) {
        this.#state.state.integrations[integrationName] = {}
      }
      this.#state.state.integrations[integrationName] = {
        type: 'slack',
        appId: createAppResult.appId,
        socketMode: integrationConfig.socketMode,
        credentialEnv: {
          SLACK_SIGNING_SECRET: `${integrationName}_SLACK_SIGNING_SECRET`,
          SLACK_BOT_TOKEN: `${integrationName}_SLACK_BOT_TOKEN`,
          SLACK_APP_TOKEN: `${integrationName}_SLACK_APP_TOKEN`,
        },
      }

      if (!this.#state.state.containers[containerName]) {
        this.#state.state.containers[containerName] = {}
      }
      if (!this.#state.state.containers[containerName]?.integrations) {
        this.#state.state.containers[containerName].integrations = {}
      }
      this.#state.state.containers[containerName].integrations[
        integrationName
      ] = {
        type: 'slack',
        appId: createAppResult.appId,
        socketMode: integrationConfig.socketMode,
        credentialEnv: {
          SLACK_SIGNING_SECRET: `${integrationName}_SLACK_SIGNING_SECRET`,
          SLACK_BOT_TOKEN: `${integrationName}_SLACK_BOT_TOKEN`,
          SLACK_APP_TOKEN: `${integrationName}_SLACK_APP_TOKEN`,
        },
      }
      this.#state.state.isDeployed = true
      this.#state.save()
    } else if (integrationConfig.credentials) {
      logger.debug(`Using existing slack credentials for ${integrationName}`)
      return
    }
  }

  async #initIntegrations(options = {}) {
    const integrations = this.#projectConfig.agent.integrations ?? {}
    const integrationPromises = []
    for (const [integrationName, integrationConfig] of Object.entries(
      integrations,
    )) {
      switch (integrationConfig.type) {
        case 'slack':
          integrationPromises.push(
            this.#initSlackIntegration(integrationName, integrationConfig),
          )
          break
        case 'awsEventBridge':
          logger.debug('awsEventBridge integrations created at deploy time')
          break
        case 'schedule':
          logger.debug('schedule integrations created at deploy time')
          break
        case 'stream':
          logger.debug('stream integrations created at deploy time')
          break
        case 'mcp':
          logger.debug('mcp integrations created at deploy time')
          break
        default:
          throw new ServerlessError(
            `Unsupported integration type: ${integrationConfig.type}`,
            'UNSUPPORTED_INTEGRATION_TYPE',
          )
      }
    }
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
