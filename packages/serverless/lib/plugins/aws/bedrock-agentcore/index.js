'use strict'

import { defineAgentsSchema } from './validators/schema.js'
import {
  buildDockerImages as buildDockerImagesFn,
  pushDockerImages as pushDockerImagesFn,
} from './docker/coordinator.js'
import { AgentCoreDevMode } from './dev/index.js'
import {
  parseTimeAgo,
  listLogGroups,
  fetchLogEvents,
  tailLogs,
  formatLogEvent,
  getRuntimeLogGroupPrefix,
} from './commands/logs.js'
import {
  displayDeploymentInfo as displayDeploymentInfoFn,
  showInfo as showInfoFn,
} from './commands/info.js'
import {
  validateGatewayConfig as validateGatewayConfigFn,
  validateRuntime as validateRuntimeFn,
  validateToolConfig as validateToolConfigFn,
  validateMemoryConfig as validateMemoryConfigFn,
  validateBrowser as validateBrowserFn,
  validateCodeInterpreter as validateCodeInterpreterFn,
  isReservedAgentKey,
} from './validators/config.js'
import {
  compileAgentCoreResources as compileAgentCoreResourcesFn,
  resolveContainerImage as resolveContainerImageFn,
} from './compilation/orchestrator.js'
import { getLogicalId } from './utils/naming.js'

// Reserved keys are imported from validators/config.js via isReservedAgentKey()

/**
 * Serverless Framework internal plugin for AWS Bedrock AgentCore
 *
 * Enables defining AgentCore Runtime, Memory, Gateway, Browser,
 * CodeInterpreter, and WorkloadIdentity resources directly in
 * serverless.yml configuration files.
 */
class ServerlessBedrockAgentCore {
  /**
   * Determines if this plugin should be loaded based on configuration
   */
  static shouldLoad({ serverless }) {
    const agentsConfig = serverless?.configurationInput?.agents
    if (!agentsConfig || Object.keys(agentsConfig).length === 0) {
      return false
    }
    return true
  }

  constructor(serverless, options, { log, progress, writeText }) {
    this.serverless = serverless
    this.options = options
    this.log = log
    this.progress = progress
    this.writeText = writeText
    this.provider = this.serverless.getProvider('aws')

    // Plugin configuration
    this.pluginName = 'bedrock-agentcore'

    // Store built image URIs
    this.builtImages = {}

    // Store build metadata for push phase
    this.buildMetadata = []

    // Flag to prevent compiling resources multiple times
    this.resourcesCompiled = false

    // Define schema validation for 'agents' top-level key
    defineAgentsSchema(serverless)

    // Define custom commands
    this.commands = {
      agentcore: {
        usage: 'Manage Bedrock AgentCore resources',
        lifecycleEvents: ['info'],
        commands: {
          info: {
            usage: 'Display information about deployed AgentCore resources',
            lifecycleEvents: ['info'],
            options: {
              verbose: {
                usage: 'Show detailed information',
                shortcut: 'v',
                type: 'boolean',
              },
            },
          },
          build: {
            usage: 'Build Docker images for AgentCore runtimes',
            lifecycleEvents: ['build'],
          },
          logs: {
            usage: 'Fetch logs for a deployed AgentCore runtime',
            lifecycleEvents: ['logs'],
            options: {
              agent: {
                usage:
                  'Name of the agent to get logs for (defaults to first runtime agent)',
                shortcut: 'a',
                type: 'string',
              },
              tail: {
                usage: 'Continuously stream new logs',
                shortcut: 't',
                type: 'boolean',
              },
              startTime: {
                usage: 'Start time for logs (e.g., "1h", "30m", "2024-01-01")',
                type: 'string',
              },
              filter: {
                usage: 'Filter pattern for logs',
                shortcut: 'f',
                type: 'string',
              },
            },
          },
          dev: {
            usage:
              'Start local development mode for an AgentCore runtime agent (alternative to "serverless dev --agents")',
            lifecycleEvents: ['dev'],
            options: {
              agent: {
                usage:
                  'Name of the agent to run (defaults to first runtime agent)',
                shortcut: 'a',
                type: 'string',
              },
              port: {
                usage: 'Port to expose the container on (default: 8080)',
                shortcut: 'p',
                type: 'string',
              },
            },
          },
        },
      },
    }

    // Lifecycle hooks
    this.hooks = {
      // Initialization
      initialize: () => this.init(),

      // Validation phase
      'before:package:initialize': () => this.validateConfig(),

      // Package phase - build Docker images locally (no AWS operations)
      'before:package:createDeploymentArtifacts': () =>
        this.buildDockerImages(),

      // Compilation phase - add resources to CloudFormation
      'package:compileEvents': () => this.compileAgentCoreResources(),
      'before:package:compileFunctions': () => this.compileAgentCoreResources(),
      'after:package:compileFunctions': () => this.compileAgentCoreResources(),
      'before:package:finalize': () => this.compileAgentCoreResources(),

      // Deploy phase - push Docker images to ECR
      'before:deploy:deploy': () => this.pushDockerImages(),

      // Post-deploy info
      'after:deploy:deploy': () => this.displayDeploymentInfo(),

      // Custom commands
      'agentcore:info:info': () => this.showInfo(),
      'agentcore:build:build': () => this.buildDockerImages(),
      'agentcore:logs:logs': () => this.fetchLogs(),
      'agentcore:dev:dev': () => this.startDevMode(),
    }
  }

  /**
   * Initialize plugin
   */
  init() {
    this.log.debug(`${this.pluginName} initialized`)

    // Populate service.agents so it's available to other plugins (like aws:info)
    const agents = this.getAgentsConfig()
    if (agents && !this.serverless.service.agents) {
      this.serverless.service.agents = agents
    }
  }

  /**
   * Get the service context for compilers
   */
  getContext() {
    const service = this.serverless.service
    const stage = this.provider.getStage()
    const region = this.provider.getRegion()

    return {
      serviceName: service.service,
      stage,
      region,
      accountId: '${AWS::AccountId}', // CloudFormation intrinsic
      defaultTags: {},
      // Artifact directory name for S3 uploads (used by code deployment)
      artifactDirectoryName: service.package?.artifactDirectoryName,
      // Custom deployment bucket (string if specified, undefined if auto-generated)
      deploymentBucket: service.package?.deploymentBucket,
    }
  }

  /**
   * Create a throwError helper bound to this plugin's error class
   * @private
   */
  #throwError(message) {
    throw new this.serverless.classes.Error(message)
  }

  /**
   * Validate gateway configuration (delegates to validators/config.js)
   */
  validateGatewayConfig(gatewayName, gatewayConfig, sharedTools = {}) {
    validateGatewayConfigFn(gatewayName, gatewayConfig, sharedTools, (msg) =>
      this.#throwError(msg),
    )
  }

  /**
   * Validate runtime agent configuration (delegates to validators/config.js)
   */
  validateAgent(name, config, sharedMemory = {}, sharedGateways = {}) {
    this.validateRuntime(name, config, sharedMemory, sharedGateways)
  }

  /**
   * Validate runtime configuration (delegates to validators/config.js)
   */
  validateRuntime(name, config, sharedMemory = {}, sharedGateways = {}) {
    const throwError = (msg) => this.#throwError(msg)
    const validateMemory = (memName, memConfig, err) =>
      validateMemoryConfigFn(memName, memConfig, err)

    validateRuntimeFn(
      name,
      config,
      sharedMemory,
      sharedGateways,
      throwError,
      validateMemory,
    )
  }

  /**
   * Validate tool configuration (delegates to validators/config.js)
   */
  validateToolConfig(name, config) {
    validateToolConfigFn(name, config, (msg) => this.#throwError(msg))
  }

  /**
   * Validate memory configuration (delegates to validators/config.js)
   */
  validateMemoryConfig(name, config) {
    validateMemoryConfigFn(name, config, (msg) => this.#throwError(msg))
  }

  /**
   * Validate browser configuration (delegates to validators/config.js)
   */
  validateBrowser(name, config) {
    validateBrowserFn(name, config, (msg) => this.#throwError(msg))
  }

  /**
   * Validate code interpreter configuration (delegates to validators/config.js)
   */
  validateCodeInterpreter(name, config) {
    validateCodeInterpreterFn(name, config, (msg) => this.#throwError(msg))
  }

  /**
   * Validate the agents configuration
   * Uses validators from validators/config.js
   */
  validateConfig() {
    const agents = this.getAgentsConfig()

    if (!agents || Object.keys(agents).length === 0) {
      this.log.debug('No agents defined, skipping AgentCore compilation')
      return
    }

    // Get shared resources for reference validation
    const sharedMemory = agents.memory || {}

    // Count runtime agents (excluding reserved keys)
    const runtimeAgentCount = Object.keys(agents).filter(
      (k) => !isReservedAgentKey(k),
    ).length
    // Count browser and codeInterpreter agents
    const browserCount = Object.keys(agents.browsers || {}).length
    const codeInterpreterCount = Object.keys(
      agents.codeInterpreters || {},
    ).length
    const totalAgents = runtimeAgentCount + browserCount + codeInterpreterCount
    this.log.info(`Validating ${totalAgents} agent(s)...`)

    // Validate shared memory first
    if (agents.memory) {
      for (const [memoryName, memoryConfig] of Object.entries(agents.memory)) {
        this.validateMemoryConfig(memoryName, memoryConfig)
      }
    }

    // Validate shared tools
    if (agents.tools) {
      for (const [toolName, toolConfig] of Object.entries(agents.tools)) {
        // Shared tools must be inline configs, not references
        if (typeof toolConfig === 'string') {
          this.#throwError(
            `Shared tool '${toolName}' cannot be a reference - define it inline`,
          )
        }
        this.validateToolConfig(toolName, toolConfig)
      }
    }

    // Validate gateways and their tool references
    const sharedTools = agents.tools || {}
    const sharedGateways = agents.gateways || {}
    if (agents.gateways) {
      for (const [gatewayName, gatewayConfig] of Object.entries(
        agents.gateways,
      )) {
        this.validateGatewayConfig(gatewayName, gatewayConfig, sharedTools)
      }
    }

    // Validate browsers (reserved key)
    if (agents.browsers) {
      for (const [browserName, browserConfig] of Object.entries(
        agents.browsers,
      )) {
        this.validateBrowser(browserName, browserConfig)
      }
    }

    // Validate codeInterpreters (reserved key)
    if (agents.codeInterpreters) {
      for (const [ciName, ciConfig] of Object.entries(
        agents.codeInterpreters,
      )) {
        this.validateCodeInterpreter(ciName, ciConfig)
      }
    }

    // Validate runtime agents (non-reserved keys)
    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (isReservedAgentKey(name)) {
        continue
      }
      this.validateAgent(name, config, sharedMemory, sharedGateways)
    }
  }

  /**
   * Build Docker images for runtime agents (delegates to docker/coordinator.js)
   */
  async buildDockerImages() {
    const agents = this.getAgentsConfig()
    const context = this.getContext()
    const ecrImages = this.serverless.service.provider?.ecr?.images

    await buildDockerImagesFn({
      agents,
      ecrImages,
      context,
      serverless: this.serverless,
      log: this.log,
      progress: this.progress,
      builtImages: this.builtImages,
      buildMetadata: this.buildMetadata,
    })
  }

  /**
   * Push Docker images to ECR (delegates to docker/coordinator.js)
   */
  async pushDockerImages() {
    await pushDockerImagesFn({
      buildMetadata: this.buildMetadata,
      serverless: this.serverless,
      log: this.log,
      progress: this.progress,
    })
  }

  /**
   * Get agents configuration from various sources
   */
  getAgentsConfig() {
    // Try multiple locations where agents might be defined
    const service = this.serverless.service

    // Direct property on service
    if (service.agents) {
      return service.agents
    }

    // From initialServerlessConfig (raw yaml)
    if (service.initialServerlessConfig?.agents) {
      return service.initialServerlessConfig.agents
    }

    // From custom.agents (alternative location)
    if (service.custom?.agents) {
      return service.custom.agents
    }

    // From serverless.configurationInput
    if (this.serverless.configurationInput?.agents) {
      return this.serverless.configurationInput.agents
    }

    return null
  }

  /**
   * Resolve the container image for a runtime (delegates to compilation/orchestrator.js)
   * Note: Kept as instance method because it needs access to this.builtImages
   */
  resolveContainerImage(name, config) {
    return resolveContainerImageFn(name, config, this.builtImages)
  }

  /**
   * Compile all AgentCore resources to CloudFormation (delegates to compilation/orchestrator.js)
   */
  compileAgentCoreResources() {
    const agents = this.getAgentsConfig()
    const context = this.getContext()
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate

    // Use mutable object to track compilation state
    const resourcesCompiled = { value: this.resourcesCompiled }

    compileAgentCoreResourcesFn({
      agents,
      context,
      template,
      builtImages: this.builtImages,
      serviceDir: this.serverless.serviceDir,
      log: this.log,
      resourcesCompiled,
    })

    // Update plugin state
    this.resourcesCompiled = resourcesCompiled.value
  }

  /**
   * Display deployment information after deploy (delegates to commands/info.js)
   */
  async displayDeploymentInfo() {
    displayDeploymentInfoFn({
      agents: this.serverless.service.agents,
    })
  }

  /**
   * Show information about AgentCore resources (delegates to commands/info.js)
   */
  async showInfo() {
    await showInfoFn({
      agents: this.serverless.service.agents,
      log: this.log,
      options: this.options,
      provider: this.provider,
    })
  }

  /**
   * Get the runtime ID for an agent from CloudFormation stack outputs
   */
  async getRuntimeId(agentName) {
    const stackName = this.provider.naming.getStackName()

    try {
      const result = await this.provider.request(
        'CloudFormation',
        'describeStacks',
        {
          StackName: stackName,
        },
      )

      const stack = result.Stacks?.[0]
      if (!stack) {
        throw new Error(`Stack ${stackName} not found`)
      }

      const logicalId = getLogicalId(agentName, 'Runtime')
      const outputKey = `${logicalId}Id`

      const output = stack.Outputs?.find((o) => o.OutputKey === outputKey)
      if (!output) {
        throw new Error(`Runtime ID output not found for agent '${agentName}'`)
      }

      return output.OutputValue
    } catch (error) {
      throw new this.serverless.classes.Error(
        `Failed to get runtime ID: ${error.message}`,
      )
    }
  }

  /**
   * Find the first runtime agent name
   * All non-reserved keys are runtime agents
   */
  getFirstRuntimeAgent() {
    const agents = this.getAgentsConfig()
    if (!agents) {
      return null
    }

    for (const [name] of Object.entries(agents)) {
      // Skip reserved keys - first non-reserved key is a runtime agent
      if (isReservedAgentKey(name)) {
        continue
      }
      return name
    }

    return null
  }

  /**
   * Fetch logs for a deployed AgentCore runtime
   * Uses utilities from commands/logs.js for AWS CLI operations
   */
  async fetchLogs() {
    // Determine which agent to get logs for
    let agentName = this.options.agent
    if (!agentName) {
      agentName = this.getFirstRuntimeAgent()
      if (!agentName) {
        throw new this.serverless.classes.Error(
          'No runtime agents found in configuration',
        )
      }
    }

    this.log.info(`Fetching logs for agent: ${agentName}`)

    // Get the runtime ID
    const runtimeId = await this.getRuntimeId(agentName)
    const region = this.provider.getRegion()

    // Get log group prefix for AgentCore runtimes
    const logGroupPrefix = getRuntimeLogGroupPrefix(runtimeId)
    this.log.info(`Log group prefix: ${logGroupPrefix}`)

    try {
      // List log groups matching the prefix
      const logGroups = listLogGroups(logGroupPrefix, region)

      if (logGroups.length === 0) {
        this.log.notice(
          'No log groups found. The agent may not have been invoked yet.',
        )
        this.log.notice(`Looking for: ${logGroupPrefix}*`)
        return
      }

      // Use the first log group found (runtime-logs)
      const logGroupName = logGroups[0].logGroupName
      this.log.info(`Using log group: ${logGroupName}`)

      if (this.options.tail) {
        // Stream logs continuously
        this.log.notice('Streaming logs (Ctrl+C to stop)...')
        this.log.notice('─'.repeat(50))

        await tailLogs({
          logGroupName,
          region,
          filterPattern: this.options.filter,
        })
      } else {
        // Fetch recent logs
        const startTime = parseTimeAgo(this.options.startTime)

        const events = fetchLogEvents({
          logGroupName,
          region,
          startTime,
          filterPattern: this.options.filter,
        })

        if (events.length === 0) {
          this.log.notice('No log events found in the specified time range.')
          this.log.notice(
            `Time range: since ${new Date(startTime).toISOString()}`,
          )
          return
        }

        this.log.notice(`Found ${events.length} log events:`)
        this.log.notice('─'.repeat(50))

        for (const event of events) {
          this.log.notice(formatLogEvent(event))
        }

        this.log.notice('─'.repeat(50))
      }
    } catch (error) {
      throw new this.serverless.classes.Error(
        `Failed to fetch logs: ${error.message}`,
      )
    }
  }

  /**
   * Get the IAM role ARN for an agent from CloudFormation stack outputs
   */
  async getRoleArn(agentName) {
    const stackName = this.provider.naming.getStackName()

    try {
      const result = await this.provider.request(
        'CloudFormation',
        'describeStacks',
        {
          StackName: stackName,
        },
      )

      const stack = result.Stacks?.[0]
      if (!stack) {
        throw new Error(`Stack ${stackName} not found`)
      }

      // Look for the role ARN output
      const logicalId = getLogicalId(agentName, 'Runtime')
      const outputKey = `${logicalId}RoleArn`

      const output = stack.Outputs?.find((o) => o.OutputKey === outputKey)
      if (!output) {
        throw new Error(`Role ARN output not found for agent '${agentName}'`)
      }

      return output.OutputValue
    } catch (error) {
      throw new this.serverless.classes.Error(
        `Failed to get role ARN: ${error.message}`,
      )
    }
  }

  /**
   * Start local development mode for an AgentCore runtime
   */
  async startDevMode() {
    const path = await import('path')

    // Determine which agent to run
    let agentName = this.options.agent
    if (!agentName) {
      agentName = this.getFirstRuntimeAgent()
      if (!agentName) {
        throw new this.serverless.classes.Error(
          'No runtime agents found in configuration',
        )
      }
    }

    // Verify the agent exists and is a runtime
    const agents = this.getAgentsConfig()
    const agentConfig = agents[agentName]
    if (!agentConfig) {
      throw new this.serverless.classes.Error(
        `Agent '${agentName}' not found in configuration`,
      )
    }
    if (agentConfig.type !== 'runtime') {
      throw new this.serverless.classes.Error(
        `Agent '${agentName}' is not a runtime agent. Dev mode only supports runtime agents.`,
      )
    }

    // Get the port
    const port = this.options.port ? parseInt(this.options.port, 10) : 8080

    // Get deployed role ARN
    this.log.notice(`Starting dev mode for agent '${agentName}'...`)
    this.log.notice('Fetching deployed IAM role ARN...')

    let roleArn
    try {
      roleArn = await this.getRoleArn(agentName)
    } catch (error) {
      throw new this.serverless.classes.Error(
        `Failed to get deployed role ARN. Make sure the agent is deployed first.\n` +
          `Run 'serverless deploy' to deploy the agent.\n` +
          `Error: ${error.message}`,
      )
    }

    this.log.notice(`Using IAM role: ${roleArn}`)

    // Get project path
    const projectPath = this.serverless.serviceDir

    // Start dev mode
    const serviceName = this.serverless.service.service
    const devMode = new AgentCoreDevMode({
      serverless: this.serverless,
      provider: this.provider,
      serviceName,
      projectPath,
      agentName,
      agentConfig,
      region: this.provider.getRegion(),
      roleArn,
      port,
    })

    try {
      await devMode.start()
    } catch (error) {
      await devMode.stop()
      throw new this.serverless.classes.Error(
        `Dev mode failed: ${error.message}`,
      )
    }
  }
}

export default ServerlessBedrockAgentCore
