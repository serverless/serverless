import path from 'path'
import { getAwsCredentialProvider } from '../../utils/index.js'
import {
  formatTimeAgo,
  log,
  progress,
  ServerlessError,
  style,
} from '@serverless/util'
import { Runner } from './index.js'
import { ServerlessAiFramework } from '../frameworks/sai/index.js'

const logger = log.get('runner:sai')
const progressMain = progress.get('main')

/**
 * Serverless AI Framework Runner
 * @extends Runner
 */
export class ServerlessAiFrameworkRunner extends Runner {
  static configFileNames = ['serverless.ai']
  static runnerType = 'sai'
  #framework
  #stage
  getAwsDeploymentCredentials

  /**
   * Constructor for the Serverless Framework Container Runner
   */
  constructor({
    config,
    command,
    configFilePath,
    options,
    stage,
    versionFramework,
    resolverManager,
    compose,
  } = {}) {
    super({
      config,
      configFilePath,
      command,
      options,
      stage,
      versionFramework,
      resolverManager,
      compose,
    })

    this.runnerType = this.constructor.runnerType
    this.configFileNames = this.constructor.configFileNames

    this.#stage = stage
  }

  /**
   * Returns the service unique ID
   * Built on name and stage
   * Region is omitted because they differ across providers,
   * and state is only stored in one region on each provider.
   * @returns {Promise<{serviceUniqueId: string}>}
   */
  async getServiceUniqueId() {
    // Ensure properties required for serviceUniqueId are set
    if (!this.config.name || !this.stage) {
      throw new ServerlessError(
        'name and stage are required for serviceUniqueId',
        'INVALID_SERVICE_UNIQUE_ID',
      )
    }

    return {
      serviceUniqueId: `${this.config.name}-${this.stage}`,
    }
  }

  /**
   * Runs the Serverless Container Framework
   * @returns {Promise<{authenticatedData: Object, state: Object, serviceUniqueId: string}>}
   */
  async run() {
    // Authenticate
    const authenticatedData = await this.resolveVariablesAndAuthenticate()

    // Resolve the variables in the template file
    await this.resolveVariables()

    // Get the AWS deployment credentials
    let credentialProvider = null
    let credentialProviderResolved = false
    try {
      credentialProvider = await this.getAwsCredentialProvider()
      credentialProviderResolved = await credentialProvider.resolveCredentials()
    } catch (error) {
      if (
        error.message.includes('Could not load credentials from any providers')
      ) {
        logger.error(
          `Serverless AI Framework requires AWS credentials for all operations. It not only deploys resources to your AWS account, but also saves state there.\n\nLearn how to set up AWS credentials here: https://www.serverless.com/framework/docs/providers/aws/guide/credentials`,
        )
      }
      throw error
    }

    // Get the service unique ID
    // Do this after resolving variables or there may be issues with unresolved variables in the ID
    let serviceUniqueId = await this.getServiceUniqueId()
    serviceUniqueId = serviceUniqueId.serviceUniqueId

    progressMain.notice('Serverless AI Framework initializing')

    // Create an easier wrapper around the state store, to pass into Containers Library
    const globalStateStore = await this.resolveStateStore({
      credentialProvider: credentialProvider.resolveCredentials,
    })
    const stateStore = {
      load: async () => {
        const remoteState = await globalStateStore.getServiceState({
          serviceUniqueId,
          runnerType: this.runnerType,
        })
        return remoteState
      },
      save: async (newState = {}) => {
        // If newState is not a string, convert it to a string
        if (typeof newState !== 'string') {
          newState = JSON.stringify(newState)
        }
        await globalStateStore.putServiceState({
          serviceUniqueId,
          runnerType: this.runnerType,
          value: newState,
        })
      },
    }

    this.#framework = new ServerlessAiFramework({
      stateStore,
      projectPath: path.dirname(this.configFilePath),
      projectConfig: this.config,
      stage: this.#stage,
      provider: {
        type: 'aws',
        aws: {
          region: credentialProviderResolved.region,
          credentials: {
            accessKeyId: credentialProviderResolved.accessKeyId,
            secretAccessKey: credentialProviderResolved.secretAccessKey,
            sessionToken: credentialProviderResolved.sessionToken,
          },
        },
      },
    })

    // Route command to appropriate handler
    const command = this.command
    if (command[0] === 'deploy') {
      await this.runDeploy()
    } else if (command[0] === 'dev') {
      await this.runDev()
    } else if (command[0] === 'info') {
      await this.runInfo()
    } else if (command[0] === 'remove') {
      await this.runRemove()
    } else if (command[0] === 'init') {
      await this.runInitIntegrations()
    } else {
      throw new ServerlessError(
        `Serverless AI Framework does not support command: ${command}`,
        'SERVERLESS_AI_UNSUPPORTED_COMMAND',
        { stack: false },
      )
    }

    return {
      authenticatedData,
      serviceUniqueId: (await this.getServiceUniqueId()).serviceUniqueId,
    }
  }

  async runInitIntegrations() {
    await this.#framework.initIntegrations()
  }

  /**
   * Runs the deploy command
   * @returns {Promise<string>} Output string
   */
  async runDeploy() {
    // Handle force flag for deploy command
    const force = Boolean(this.options?.force)
    const res = await this.#framework.deploy({ force })

    const output = this.#formatInfoOutput({ deploymentState: res })
    log.notice(output)
  }

  /**
   * Runs the dev command
   * @returns {Promise<void>}
   */
  async runDev() {
    /**
     * Customize branding for Dev Mode.
     * @param {Object} proxyData - The proxy data from dev mode.
     */
    const onStart = async ({ proxyData, integrations, state } = {}) => {
      const output = this.#formatInfoOutput({
        deploymentState: state,
        devMode: true,
      })
      log.notice(output)
    }

    await this.#framework.dev({
      onStart,
      proxyPort: Number(this.options?.['port-proxy'] || 3000),
      controlPort: Number(this.options?.['port-control'] || 3001),
    })
  }

  /**
   * Runs the info command
   * @returns {Promise<void>}
   */
  async runInfo() {
    const info = await this.#framework.info()
    const output = this.#formatInfoOutput({ deploymentState: info })
    log.notice(output)
  }

  /**
   * Runs the remove command with confirmation for destructive operations
   * @returns {Promise<void>}
   */
  async runRemove() {
    const all = Boolean(this.options?.all)
    const force = Boolean(this.options?.force)

    // Show confirmation only if "all" is true and "force" is false
    if (all && !force) {
      logger.warning(
        '"all" flag detected. This will remove all resources for this service, including shared resources (e.g. VPC, ALB, ECS Cluster, etc.).',
      )
      const confirmed = await logger.confirm({
        message: 'Are you sure you want to continue?',
        initial: false,
      })
      if (!confirmed) {
        return
      }
    }

    const res = await this.#framework.remove({ all, force })
    log.success(`${res.name} removed successfully`)
  }

  /**
   * Formats the deployment results into a human-readable string
   * @param {Object} params - Function parameters
   * @param {Object} params.deploymentState - Result object from deployment
   * @param {boolean} [params.devMode=false] - Whether to format for dev mode
   * @returns {string} Formatted output string
   */
  #formatInfoOutput({ deploymentState, devMode = false }) {
    logger.logoServerlessAiFramework(devMode)
    // Show notice if project is not deployed
    if (!deploymentState.isDeployed) {
      logger.error('This project is not deployed.')
      logger.aside(
        'Run "serverless deploy", or develop locally with "serverless dev". Also, check out other ai projects you can deploy here: https://github.com/serverless/ai',
      )
      return
    }
    // Otherwise, show the project info
    let output = ''
    output += style.notice(`name: ${deploymentState.name}\n`)
    output += style.aside(`› Stage: ${deploymentState.stage}\n`)

    // Loop through containers
    for (const containerName in deploymentState.containers) {
      const container = deploymentState.containers[containerName]
      output += `› agent\n`
      if (!devMode) {
        // Get last deployed time
        const lastDeployed = new Date(container.timeLastDeployed)
        if (container.deployedOnLastDeployment) {
          output += style.aside(
            `  › Deployed: ${formatTimeAgo({ date: lastDeployed })}\n`,
          )
        } else {
          output += style.aside(
            `  › Deployed: ${formatTimeAgo({ date: lastDeployed })}\n`,
          )
        }
        // Create endpoint by custom domain or ALB
        let containerUrl = null
        if (container.routing.customDomain) {
          containerUrl = `https://${container.routing.customDomain}${container.routing.pathPattern}`
        } else if (container.routing.awsCloudFront?.distributionDomainName) {
          containerUrl = `https://${container.routing.awsCloudFront.distributionDomainName}${container.routing.pathPattern}`
        } else {
          containerUrl = `http://${deploymentState.awsAlb.dnsName}${container.routing.pathPattern}`
        }
        output += style.aside(`  › Path: ${containerUrl}\n`)
      } else {
        output += style.aside(
          `  › Dashboard is running at http://localhost:${this.options?.['port-control'] || 3000}\n`,
        )
      }
      const slackIntegrations = Object.entries(container.integrations).filter(
        ([integrationName, integration]) => integration.type === 'slack',
      )
      if (slackIntegrations.length > 0) {
        output += `  › Slack Integrations:\n`
        slackIntegrations.forEach(([integrationName, integration]) => {
          output += style.aside(
            `    › ${integrationName}: https://slack.com/app_redirect?app=${integration.appId}\n`,
          )
        })
      }

      const eventBridgeIntegrations = Object.entries(
        container.integrations,
      ).filter(
        ([integrationName, integration]) =>
          integration.type === 'awsEventBridge',
      )
      if (eventBridgeIntegrations.length > 0 && !devMode) {
        output += `  › EventBridge Integrations:\n`
        eventBridgeIntegrations.forEach(([integrationName, integration]) => {
          output += style.aside(
            `    › ${integrationName}: Subscribed to ${integration.pattern.source?.join(', ') || 'all events'}\n`,
          )
        })
      }

      const scheduleIntegrations = Object.entries(
        container.integrations,
      ).filter(
        ([integrationName, integration]) => integration.type === 'schedule',
      )
      if (scheduleIntegrations.length > 0 && !devMode) {
        output += `  › Schedule Integrations:\n`
        scheduleIntegrations.forEach(([integrationName, integration]) => {
          output += style.aside(
            `    › ${integrationName}: ${integration.schedule}\n`,
          )
        })
      }

      const mcpIntegrations = Object.entries(container.integrations).filter(
        ([integrationName, integration]) => integration.type === 'mcp',
      )
      if (mcpIntegrations.length > 0) {
        output += `  › MCP Integrations:\n`
        mcpIntegrations.forEach(([integrationName, integration]) => {
          output += style.aside(
            `    › ${integrationName}: ${integration.path}/sse\n`,
          )
        })
      }
    }

    return output.trim()
  }

  /**
   * Gets AWS credential provider for container deployments
   * @async
   * @returns {Promise<Object>} Object containing region and resolveCredentials function
   * @property {string} region - AWS region for deployment
   * @property {Function} resolveCredentials - Function to resolve AWS credentials
   */
  async getAwsCredentialProvider() {
    const { region, resolveCredentials } = await getAwsCredentialProvider({
      awsProfile: this.options?.['aws-profile'],
      providerAwsAccessKeyId:
        this.authenticatedData?.dashboard?.serviceProvider?.accessKeyId,
      providerAwsSecretAccessKey:
        this.authenticatedData?.dashboard?.serviceProvider?.secretAccessKey,
      providerAwsSessionToken:
        this.authenticatedData?.dashboard?.serviceProvider?.sessionToken,
      resolversManager: this.resolverManager,
    })
    this.getAwsDeploymentCredentials = resolveCredentials
    return { region, resolveCredentials }
  }

  /**
   * Returns the CLI schema for the Containers runner
   * @returns {Array<Object>} Array of command configurations
   */
  getCliSchema() {
    return [
      {
        command: 'deploy',
        description:
          'Deploy the agents and foundational infrastructure. Code and config change detection allows for incremental deployments.',
        builder: [
          {
            options: {
              force: {
                description:
                  'Disregard config/code change detection and deploy all agents and infrastructure.',
                type: 'boolean',
              },
            },
          },
        ],
      },
      {
        command: 'dev',
        description:
          'Start dev mode and run all agents in your project locally. This also spins up a local proxy to route requests to your agents. Logs, errors and more are displayed in the terminal.',
        builder: [
          {
            options: {
              'port-proxy': {
                description: 'Port for the main proxy server (default: 3000)',
                type: 'number',
              },
              'port-control': {
                description: 'Port for the control server (default: 3001)',
                type: 'number',
              },
            },
          },
        ],
      },
      {
        command: 'info',
        description: 'Display information about your deployed agents',
        builder: [
          {
            options: {},
          },
        ],
      },
      {
        command: 'remove',
        description: 'Remove deployed agent services',
        builder: [
          {
            options: {
              all: {
                description:
                  'Remove all resources including shared infrastructure (e.g. VPC, ALB, ECS Cluster, etc.). Be careful when using this if some resources were created by other projects.',
                type: 'boolean',
              },
              force: {
                description:
                  'Force removal of all resources including shared infrastructure (e.g. VPC, ALB, ECS Cluster, etc.) without confirmation. Useful for CI/CD pipelines.',
                type: 'boolean',
              },
            },
          },
        ],
      },
      {
        command: 'init',
        description: 'Initialize integrations for your project',
        builder: [
          {
            options: {},
          },
        ],
      },
    ]
  }
}
