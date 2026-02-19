'use strict'

import { defineAgentsSchema } from './validators/schema.js'
import {
  buildDockerImages as buildDockerImagesFn,
  pushDockerImages as pushDockerImagesFn,
} from './docker/coordinator.js'
import { displayDeploymentInfo as displayDeploymentInfoFn } from './commands/info.js'
import {
  validateGatewayConfig as validateGatewayConfigFn,
  validateRuntime as validateRuntimeFn,
  validateToolConfig as validateToolConfigFn,
  validateMemoryConfig as validateMemoryConfigFn,
  validateBrowser as validateBrowserFn,
  validateCodeInterpreter as validateCodeInterpreterFn,
} from './validators/config.js'
import {
  compileAgentCoreResources as compileAgentCoreResourcesFn,
  resolveContainerImage as resolveContainerImageFn,
} from './compilation/orchestrator.js'

// With the 'ai' top-level property, agents are under ai.agents (no reserved key filtering needed)

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
    const aiConfig = serverless?.configurationInput?.ai
    if (!aiConfig || Object.keys(aiConfig).length === 0) {
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

    // Define schema validation for 'ai' top-level key
    defineAgentsSchema(serverless)

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
    }
  }

  /**
   * Initialize plugin
   */
  init() {
    this.log.debug(`${this.pluginName} initialized`)

    // Populate service.ai so it's available to other plugins (like aws:info)
    const aiConfig = this.getAiConfig()
    if (aiConfig && !this.serverless.service.ai) {
      this.serverless.service.ai = aiConfig
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
   * Validate the ai configuration
   * Uses validators from validators/config.js
   */
  validateConfig() {
    const aiConfig = this.getAiConfig()

    if (!aiConfig || Object.keys(aiConfig).length === 0) {
      this.log.debug('No ai config defined, skipping AgentCore compilation')
      return
    }

    // Get shared resources for reference validation
    const sharedMemory = aiConfig.memory || {}
    const agents = aiConfig.agents || {}

    // Count runtime agents
    const runtimeAgentCount = Object.keys(agents).length
    // Count browser and codeInterpreter agents
    const browserCount = Object.keys(aiConfig.browsers || {}).length
    const codeInterpreterCount = Object.keys(
      aiConfig.codeInterpreters || {},
    ).length
    const totalAgents = runtimeAgentCount + browserCount + codeInterpreterCount
    this.log.info(`Validating ${totalAgents} agent(s)...`)

    // Validate shared memory first
    if (aiConfig.memory) {
      for (const [memoryName, memoryConfig] of Object.entries(
        aiConfig.memory,
      )) {
        this.validateMemoryConfig(memoryName, memoryConfig)
      }
    }

    // Validate shared tools
    if (aiConfig.tools) {
      for (const [toolName, toolConfig] of Object.entries(aiConfig.tools)) {
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
    const sharedTools = aiConfig.tools || {}
    const sharedGateways = aiConfig.gateways || {}
    if (aiConfig.gateways) {
      for (const [gatewayName, gatewayConfig] of Object.entries(
        aiConfig.gateways,
      )) {
        this.validateGatewayConfig(gatewayName, gatewayConfig, sharedTools)
      }
    }

    // Validate browsers
    if (aiConfig.browsers) {
      for (const [browserName, browserConfig] of Object.entries(
        aiConfig.browsers,
      )) {
        this.validateBrowser(browserName, browserConfig)
      }
    }

    // Validate codeInterpreters
    if (aiConfig.codeInterpreters) {
      for (const [ciName, ciConfig] of Object.entries(
        aiConfig.codeInterpreters,
      )) {
        this.validateCodeInterpreter(ciName, ciConfig)
      }
    }

    // Validate runtime agents
    for (const [name, config] of Object.entries(agents)) {
      this.validateAgent(name, config, sharedMemory, sharedGateways)
    }
  }

  /**
   * Build Docker images for runtime agents (delegates to docker/coordinator.js)
   */
  async buildDockerImages() {
    const aiConfig = this.getAiConfig()
    const context = this.getContext()
    const ecrImages = this.serverless.service.provider?.ecr?.images

    await buildDockerImagesFn({
      aiConfig,
      ecrImages,
      context,
      serverless: this.serverless,
      log: this.log,
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
    })
  }

  /**
   * Get ai configuration from various sources
   */
  getAiConfig() {
    // Try multiple locations where ai config might be defined
    const service = this.serverless.service

    // Direct property on service
    if (service.ai) {
      return service.ai
    }

    // From initialServerlessConfig (raw yaml)
    if (service.initialServerlessConfig?.ai) {
      return service.initialServerlessConfig.ai
    }

    // From serverless.configurationInput
    if (this.serverless.configurationInput?.ai) {
      return this.serverless.configurationInput.ai
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
    const aiConfig = this.getAiConfig()
    const context = this.getContext()
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate

    // Use mutable object to track compilation state
    const resourcesCompiled = { value: this.resourcesCompiled }

    compileAgentCoreResourcesFn({
      aiConfig,
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
      aiConfig: this.serverless.service.ai,
    })
  }
}

export default ServerlessBedrockAgentCore
