'use strict'

import { compileRuntime } from './compilers/runtime.js'
import { compileRuntimeEndpoint } from './compilers/runtimeEndpoint.js'
import { compileMemory } from './compilers/memory.js'
import { compileGateway } from './compilers/gateway.js'
import {
  compileGatewayTarget,
  detectTargetType,
} from './compilers/gatewayTarget.js'
import { compileBrowser } from './compilers/browser.js'
import { compileCodeInterpreter } from './compilers/codeInterpreter.js'
import { compileWorkloadIdentity } from './compilers/workloadIdentity.js'
import {
  generateRuntimeRole,
  generateMemoryRole,
  generateGatewayRole,
  generateBrowserRole,
  generateCodeInterpreterRole,
} from './iam/policies.js'
import { getLogicalId } from './utils/naming.js'
import { mergeTags } from './utils/tags.js'
import { defineAgentsSchema } from './validators/schema.js'
import { DockerBuilder } from './docker/builder.js'
import { AgentCoreDevMode } from './dev/index.js'

// Reserved keys at agents level (not treated as agent definitions)
const RESERVED_AGENT_KEYS = ['memory', 'tools']

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
    const customConfig = service.custom?.agentCore || {}

    return {
      serviceName: service.service,
      stage,
      region,
      accountId: '${AWS::AccountId}', // CloudFormation intrinsic
      customConfig,
      defaultTags: customConfig.defaultTags || {},
      // Artifact directory name for S3 uploads (used by code deployment)
      artifactDirectoryName: service.package?.artifactDirectoryName,
      // Custom deployment bucket (string if specified, undefined if auto-generated)
      deploymentBucket: service.package?.deploymentBucket,
    }
  }

  /**
   * Validate the agents configuration
   */
  validateConfig() {
    const agents = this.getAgentsConfig()

    if (!agents || Object.keys(agents).length === 0) {
      this.log.debug('No agents defined, skipping AgentCore compilation')
      return
    }

    // Get shared resources for reference validation
    const sharedMemory = agents.memory || {}
    const sharedTools = agents.tools || {}

    // Count agents excluding reserved keys
    const agentCount = Object.keys(agents).filter(
      (k) => !RESERVED_AGENT_KEYS.includes(k),
    ).length
    this.log.info(`Validating ${agentCount} agent(s)...`)

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
          throw new this.serverless.classes.Error(
            `Shared tool '${toolName}' cannot be a reference - define it inline`,
          )
        }
        this.validateToolConfig(toolName, toolConfig)
      }
    }

    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      this.validateAgent(name, config, sharedMemory, sharedTools)
    }
  }

  /**
   * Validate individual agent configuration
   * @param {string} name - Agent name
   * @param {object} config - Agent configuration
   * @param {object} sharedMemory - Available shared memory definitions for reference validation
   * @param {object} sharedTools - Available shared tools for reference validation
   */
  validateAgent(name, config, sharedMemory = {}, sharedTools = {}) {
    // Default type to 'runtime' if not specified
    if (!config.type) {
      config.type = 'runtime'
    }

    const validTypes = [
      'runtime',
      'browser',
      'codeInterpreter',
      'workloadIdentity',
    ]
    if (!validTypes.includes(config.type)) {
      throw new this.serverless.classes.Error(
        `Agent '${name}' has invalid type '${config.type}'. Valid types: ${validTypes.join(', ')}`,
      )
    }

    // Type-specific validation
    switch (config.type) {
      case 'runtime':
        this.validateRuntime(name, config, sharedMemory, sharedTools)
        break
      case 'browser':
        this.validateBrowser(name, config)
        break
      case 'codeInterpreter':
        this.validateCodeInterpreter(name, config)
        break
      case 'workloadIdentity':
        this.validateWorkloadIdentity(name, config)
        break
    }
  }

  /**
   * Validate runtime configuration
   * @param {string} name - Runtime name
   * @param {object} config - Runtime configuration
   * @param {object} sharedMemory - Available shared memory definitions for reference validation
   * @param {object} sharedTools - Available shared tools for reference validation
   */
  validateRuntime(name, config, sharedMemory = {}, sharedTools = {}) {
    // Check if using image reference (will be built) or artifact (pre-built)
    const hasImage = config.image !== undefined
    const hasArtifact = config.artifact !== undefined

    // If no image or artifact specified, buildpacks auto-detection will be used
    // This is valid - DockerClient will build using buildpacks from the service directory

    if (hasArtifact) {
      // artifact.docker means we need to build
      if (config.artifact.docker) {
        // Docker build config is valid
      } else if (config.artifact.entryPoint && !config.artifact.s3?.bucket) {
        // Auto-packaging: entryPoint alone (without s3.bucket) means Framework will package
        // This is valid for code deployment with automatic packaging
      } else if (!config.artifact.containerImage && !config.artifact.s3) {
        // Otherwise need containerImage or s3
        throw new this.serverless.classes.Error(
          `Runtime '${name}' artifact must specify either 'containerImage', 's3' (bucket/key), 'docker' (for build), or 'entryPoint' (for auto-packaging)`,
        )
      }
    }

    // Validate requestHeaders configuration
    if (config.requestHeaders) {
      if (config.requestHeaders.allowlist) {
        if (!Array.isArray(config.requestHeaders.allowlist)) {
          throw new this.serverless.classes.Error(
            `Runtime '${name}' requestHeaders.allowlist must be an array of header names`,
          )
        }
        if (config.requestHeaders.allowlist.length > 20) {
          throw new this.serverless.classes.Error(
            `Runtime '${name}' requestHeaders.allowlist cannot exceed 20 headers (got ${config.requestHeaders.allowlist.length})`,
          )
        }
        // Validate each header is a non-empty string
        for (const header of config.requestHeaders.allowlist) {
          if (typeof header !== 'string' || header.trim().length === 0) {
            throw new this.serverless.classes.Error(
              `Runtime '${name}' requestHeaders.allowlist contains invalid header name: '${header}'`,
            )
          }
        }
      }
    }

    // Validate memory configuration if present
    if (config.memory) {
      if (typeof config.memory === 'string') {
        // Memory is a reference to a shared memory - validate it exists
        if (!sharedMemory[config.memory]) {
          throw new this.serverless.classes.Error(
            `Runtime '${name}' references memory '${config.memory}' which is not defined in agents.memory`,
          )
        }
      } else if (typeof config.memory === 'object') {
        // Inline memory configuration - validate the config
        this.validateMemoryConfig(`${name}-memory`, config.memory)
      } else {
        throw new this.serverless.classes.Error(
          `Runtime '${name}' memory must be either a string (reference to shared memory) or an object (inline memory config)`,
        )
      }
    }

    // Validate tools configuration if present
    if (config.tools) {
      if (typeof config.tools !== 'object' || Array.isArray(config.tools)) {
        throw new this.serverless.classes.Error(
          `Runtime '${name}' tools must be an object with tool names as keys`,
        )
      }

      for (const [toolName, toolConfig] of Object.entries(config.tools)) {
        if (typeof toolConfig === 'string') {
          // String reference to shared tool - validate it exists
          if (!sharedTools[toolConfig]) {
            throw new this.serverless.classes.Error(
              `Runtime '${name}' tool '${toolName}' references shared tool '${toolConfig}' which is not defined in agents.tools`,
            )
          }
        } else if (typeof toolConfig === 'object') {
          // Inline tool configuration - validate it
          this.validateToolConfig(`${name}/${toolName}`, toolConfig)
        } else {
          throw new this.serverless.classes.Error(
            `Runtime '${name}' tool '${toolName}' must be either a string (reference to shared tool) or an object (inline tool config)`,
          )
        }
      }
    }
  }

  /**
   * Validate tool configuration
   * @param {string} name - Tool name (for error messages)
   * @param {object} config - Tool configuration
   */
  validateToolConfig(name, config) {
    // Detect tool type
    let toolType
    try {
      toolType = detectTargetType(config)
    } catch {
      throw new this.serverless.classes.Error(
        `Tool '${name}' must have one of: function, openapi, smithy, or mcp`,
      )
    }

    // Validate function tools require toolSchema
    if (toolType === 'function' && !config.toolSchema) {
      throw new this.serverless.classes.Error(
        `Tool '${name}' with function type requires toolSchema`,
      )
    }

    // Validate MCP server URL pattern
    if (toolType === 'mcp') {
      const endpoint = config.mcp
      if (!endpoint || !endpoint.startsWith('https://')) {
        throw new this.serverless.classes.Error(
          `Tool '${name}' mcp endpoint must be a valid https:// URL`,
        )
      }
    }

    // Validate credentials if present
    if (config.credentials) {
      const validTypes = ['GATEWAY_IAM_ROLE', 'OAUTH', 'API_KEY']
      if (
        config.credentials.type &&
        !validTypes.includes(config.credentials.type)
      ) {
        throw new this.serverless.classes.Error(
          `Tool '${name}' credentials.type must be one of: ${validTypes.join(', ')}`,
        )
      }

      if (config.credentials.type === 'OAUTH') {
        if (!config.credentials.providerArn || !config.credentials.scopes) {
          throw new this.serverless.classes.Error(
            `Tool '${name}' OAUTH credentials require providerArn and scopes`,
          )
        }
      }

      if (config.credentials.type === 'API_KEY') {
        if (!config.credentials.providerArn) {
          throw new this.serverless.classes.Error(
            `Tool '${name}' API_KEY credentials require providerArn`,
          )
        }
      }
    }
  }

  /**
   * Validate memory configuration (used for both inline and shared memory definitions)
   * Uses user-friendly property names: expiration, encryptionKey, strategies
   */
  validateMemoryConfig(name, config) {
    // Validate expiration (maps to EventExpiryDuration)
    if (config.expiration !== undefined) {
      const duration = config.expiration
      if (typeof duration !== 'number' || duration < 7 || duration > 365) {
        throw new this.serverless.classes.Error(
          `Memory '${name}' expiration must be a number between 7 and 365 days`,
        )
      }
    }

    // Validate encryptionKey if present
    if (config.encryptionKey !== undefined) {
      if (typeof config.encryptionKey !== 'string') {
        throw new this.serverless.classes.Error(
          `Memory '${name}' encryptionKey must be a string (ARN)`,
        )
      }
    }

    // Validate strategies if present
    if (config.strategies !== undefined) {
      if (!Array.isArray(config.strategies)) {
        throw new this.serverless.classes.Error(
          `Memory '${name}' strategies must be an array`,
        )
      }
    }
  }

  /**
   * Validate browser configuration
   */
  validateBrowser(name, config) {
    const validModes = ['PUBLIC', 'VPC']
    if (
      config.network?.networkMode &&
      !validModes.includes(config.network.networkMode)
    ) {
      throw new this.serverless.classes.Error(
        `Browser '${name}' has invalid networkMode '${config.network.networkMode}'. Valid modes: ${validModes.join(', ')}`,
      )
    }

    // Validate recording configuration
    if (config.recording) {
      if (config.recording.s3Location) {
        if (!config.recording.s3Location.bucket) {
          throw new this.serverless.classes.Error(
            `Browser '${name}' recording.s3Location must have a 'bucket' property`,
          )
        }
      }
    }
  }

  /**
   * Validate code interpreter configuration
   */
  validateCodeInterpreter(name, config) {
    const validModes = ['PUBLIC', 'SANDBOX', 'VPC']
    if (
      config.network?.networkMode &&
      !validModes.includes(config.network.networkMode)
    ) {
      throw new this.serverless.classes.Error(
        `CodeInterpreter '${name}' has invalid networkMode '${config.network.networkMode}'. Valid modes: ${validModes.join(', ')}`,
      )
    }

    // Validate VPC configuration when VPC mode is specified
    if (config.network?.networkMode === 'VPC') {
      if (!config.network.vpcConfig) {
        throw new this.serverless.classes.Error(
          `CodeInterpreter '${name}' requires vpcConfig when networkMode is VPC`,
        )
      }
      if (
        !config.network.vpcConfig.subnets ||
        config.network.vpcConfig.subnets.length === 0
      ) {
        throw new this.serverless.classes.Error(
          `CodeInterpreter '${name}' vpcConfig must have at least one subnet`,
        )
      }
    }
  }

  /**
   * Validate workload identity configuration
   */
  validateWorkloadIdentity(name, config) {
    // Name must be 3-255 characters, pattern: [A-Za-z0-9_.-]+
    // The naming utility will handle this, but we can validate length
    if (name.length < 1 || name.length > 255) {
      throw new this.serverless.classes.Error(
        `WorkloadIdentity '${name}' name must be between 1 and 255 characters`,
      )
    }

    // Validate OAuth2 return URLs if provided
    if (config.oauth2ReturnUrls) {
      if (!Array.isArray(config.oauth2ReturnUrls)) {
        throw new this.serverless.classes.Error(
          `WorkloadIdentity '${name}' oauth2ReturnUrls must be an array`,
        )
      }

      for (const url of config.oauth2ReturnUrls) {
        // Allow https:// URLs or http://localhost for local development
        const isHttps = url.startsWith('https://')
        const isLocalhost = url.startsWith('http://localhost')
        if (typeof url !== 'string' || (!isHttps && !isLocalhost)) {
          throw new this.serverless.classes.Error(
            `WorkloadIdentity '${name}' oauth2ReturnUrls must contain valid HTTPS URLs (or http://localhost for development)`,
          )
        }
      }
    }
  }

  /**
   * Build Docker images for runtime agents (package phase - local only)
   */
  async buildDockerImages() {
    const agents = this.getAgentsConfig()
    const ecrImages = this.serverless.service.provider?.ecr?.images

    if (!agents) {
      return
    }

    // Find runtimes that need Docker builds
    const runtimesToBuild = []

    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      if (config.type === 'runtime') {
        // Check for Docker build config: either top-level 'image' or nested 'artifact.docker'
        if (config.image) {
          runtimesToBuild.push({ name, config, imageConfig: config.image })
        } else if (config.artifact?.docker) {
          runtimesToBuild.push({
            name,
            config,
            imageConfig: config.artifact.docker,
          })
        } else if (
          !config.artifact?.containerImage &&
          !config.artifact?.entryPoint &&
          !config.artifact?.s3?.bucket
        ) {
          // No explicit artifact configuration - look for Dockerfile in root directory
          runtimesToBuild.push({
            name,
            config,
            imageConfig: { path: '.' },
          })
        }
      }
    }

    if (runtimesToBuild.length === 0 && !ecrImages) {
      return
    }

    // Initialize Docker builder
    const builder = new DockerBuilder(this.serverless, this.log, this.progress)

    // Check Docker is available
    const dockerAvailable = await builder.checkDocker()
    if (!dockerAvailable) {
      throw new this.serverless.classes.Error(
        'Docker is required to build agent images but was not found. Please install Docker.',
      )
    }

    const context = this.getContext()

    // Build images defined in provider.ecr.images (Serverless standard pattern)
    if (ecrImages) {
      this.log.info('Building ECR images...')
      // For now, keep the old behavior for provider.ecr.images (build + push)
      // TODO: Refactor processImages to also split build/push
      this.builtImages = await builder.processImages(ecrImages, context)
    }

    // Build images for runtimes with docker config (LOCAL BUILD ONLY)
    for (const { name, imageConfig } of runtimesToBuild) {
      // Handle string reference to provider.ecr.images
      if (typeof imageConfig === 'string') {
        if (this.builtImages[imageConfig]) {
          continue // Already built above
        }
      }

      // Build the image - imageConfig should have path or repository
      const dockerConfig =
        typeof imageConfig === 'string' ? { name: imageConfig } : imageConfig

      if (dockerConfig.path || dockerConfig.repository) {
        this.log.info(`Building Docker image for runtime: ${name}`)
        const buildMetadata = await builder.buildForRuntime(
          name,
          dockerConfig,
          context,
        )

        // Store image URI for CloudFormation
        this.builtImages[name] = buildMetadata.imageUri

        // Store metadata for push phase
        this.buildMetadata.push({ agentName: name, ...buildMetadata })
      }
    }
  }

  /**
   * Push Docker images to ECR (deploy phase)
   */
  async pushDockerImages() {
    if (this.buildMetadata.length === 0) {
      return
    }

    // Initialize Docker builder
    const builder = new DockerBuilder(this.serverless, this.log, this.progress)

    // Push all built images
    for (const metadata of this.buildMetadata) {
      this.log.info(`Pushing Docker image for runtime: ${metadata.agentName}`)
      await builder.pushForRuntime(metadata)
    }

    this.log.info('All Docker images pushed successfully')
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
   * Get gateway configuration from provider.agents.gateway
   */
  getGatewayConfig() {
    const service = this.serverless.service
    return service.provider?.agents?.gateway || {}
  }

  /**
   * Collect all tools (shared + agent-level) to determine if gateway is needed
   * Also returns which agents have tools for env var injection
   */
  collectAllTools(agents) {
    const sharedTools = agents.tools || {}
    const agentTools = {} // Map of agentName -> resolved tools

    for (const [name, config] of Object.entries(agents)) {
      if (RESERVED_AGENT_KEYS.includes(name)) continue
      if (config.type !== 'runtime' || !config.tools) continue

      agentTools[name] = {}
      for (const [toolName, toolConfig] of Object.entries(config.tools)) {
        if (typeof toolConfig === 'string') {
          // String reference - use shared tool config
          agentTools[name][toolName] = sharedTools[toolConfig]
        } else {
          // Inline tool config
          agentTools[name][toolName] = toolConfig
        }
      }
    }

    // Check if any tools exist
    const hasSharedTools = Object.keys(sharedTools).length > 0
    const hasAgentTools = Object.keys(agentTools).length > 0

    return {
      sharedTools,
      agentTools,
      hasTools: hasSharedTools || hasAgentTools,
    }
  }

  /**
   * Compile all AgentCore resources to CloudFormation
   */
  compileAgentCoreResources() {
    // Prevent running multiple times
    if (this.resourcesCompiled) {
      return
    }

    const agents = this.getAgentsConfig()

    if (!agents || Object.keys(agents).length === 0) {
      return
    }

    this.resourcesCompiled = true

    const context = this.getContext()
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate

    if (!template) {
      this.resourcesCompiled = false
      return
    }

    // Ensure Resources and Outputs exist
    template.Resources = template.Resources || {}
    template.Outputs = template.Outputs || {}

    const stats = {
      runtime: 0,
      memory: 0,
      gateway: 0,
      browser: 0,
      codeInterpreter: 0,
      workloadIdentity: 0,
      endpoints: 0,
      tools: 0,
    }

    // Collect all tools to determine if gateway is needed
    const { sharedTools, agentTools, hasTools } = this.collectAllTools(agents)

    // First pass: Compile gateway and shared tools if any tools exist
    let gatewayLogicalId = null
    if (hasTools) {
      gatewayLogicalId = this.compileToolsGateway(context, template)
      stats.gateway = 1

      // Compile shared tools
      for (const [toolName, toolConfig] of Object.entries(sharedTools)) {
        this.compileToolResource(
          toolName,
          toolConfig,
          gatewayLogicalId,
          context,
          template,
        )
        stats.tools++
      }
    }

    // Second pass: Compile shared memory from agents.memory
    if (agents.memory) {
      for (const [memoryName, memoryConfig] of Object.entries(agents.memory)) {
        this.compileMemoryResources(memoryName, memoryConfig, context, template)
        stats.memory++
      }
    }

    // Third pass: Compile all agents (excluding reserved keys)
    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }

      switch (config.type) {
        case 'runtime': {
          // Pass gateway info for env var injection
          const agentHasTools = !!agentTools[name]
          this.compileRuntimeResources(
            name,
            config,
            context,
            template,
            agents.memory,
            agentHasTools ? gatewayLogicalId : null,
          )
          stats.runtime++
          if (config.endpoints) {
            stats.endpoints += config.endpoints.length
          }
          // If runtime has inline memory, count it
          if (config.memory && typeof config.memory === 'object') {
            stats.memory++
          }
          // Compile agent-level tools (inline only, not shared references)
          if (config.tools) {
            for (const [toolName, toolConfig] of Object.entries(config.tools)) {
              // Only compile inline tools (not string references to shared)
              if (typeof toolConfig === 'object') {
                const fullToolName = `${name}-${toolName}`
                this.compileToolResource(
                  fullToolName,
                  toolConfig,
                  gatewayLogicalId,
                  context,
                  template,
                )
                stats.tools++
              }
            }
          }
          break
        }
        case 'browser':
          this.compileBrowserResources(name, config, context, template)
          stats.browser++
          break
        case 'codeInterpreter':
          this.compileCodeInterpreterResources(name, config, context, template)
          stats.codeInterpreter++
          break
        case 'workloadIdentity':
          this.compileWorkloadIdentityResources(name, config, context, template)
          stats.workloadIdentity++
          break
      }
    }

    const resourceSummary = []
    if (stats.runtime > 0) {
      resourceSummary.push(`${stats.runtime} runtime(s)`)
    }
    if (stats.memory > 0) {
      resourceSummary.push(`${stats.memory} memory(s)`)
    }
    if (stats.gateway > 0) {
      resourceSummary.push(`${stats.gateway} gateway`)
    }
    if (stats.browser > 0) {
      resourceSummary.push(`${stats.browser} browser(s)`)
    }
    if (stats.codeInterpreter > 0) {
      resourceSummary.push(`${stats.codeInterpreter} codeInterpreter(s)`)
    }
    if (stats.workloadIdentity > 0) {
      resourceSummary.push(`${stats.workloadIdentity} workloadIdentity(s)`)
    }

    this.log.info(`Compiled AgentCore resources: ${resourceSummary.join(', ')}`)

    if (stats.endpoints > 0) {
      this.log.info(`  - ${stats.endpoints} runtime endpoint(s)`)
    }
    if (stats.tools > 0) {
      this.log.info(`  - ${stats.tools} tool(s)`)
    }
  }

  /**
   * Compile the auto-created Gateway for tools
   * @returns {string} Gateway logical ID
   */
  compileToolsGateway(context, template) {
    const gatewayConfig = this.getGatewayConfig()
    const logicalId = 'AgentCoreGateway'
    const tags = mergeTags(
      context.defaultTags,
      gatewayConfig.tags,
      context.serviceName,
      context.stage,
      'gateway',
    )

    // Generate IAM role if not provided
    const roleLogicalId = `${logicalId}Role`
    if (!gatewayConfig.roleArn) {
      const roleResource = generateGatewayRole(
        'gateway',
        gatewayConfig,
        context,
      )
      template.Resources[roleLogicalId] = roleResource

      template.Outputs[`${logicalId}RoleArn`] = {
        Description: 'IAM Role ARN for AgentCore Gateway',
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile Gateway resource - pass roleLogicalId to ensure correct reference
    const gatewayResource = compileGateway(
      'gateway',
      gatewayConfig,
      context,
      tags,
      roleLogicalId,
    )
    template.Resources[logicalId] = gatewayResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: 'ARN of AgentCore Gateway',
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-GatewayArn`,
      },
    }

    template.Outputs[`${logicalId}Id`] = {
      Description: 'ID of AgentCore Gateway',
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayIdentifier'] },
    }

    template.Outputs[`${logicalId}Url`] = {
      Description: 'URL of AgentCore Gateway',
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayUrl'] },
    }

    return logicalId
  }

  /**
   * Compile a tool as a GatewayTarget resource
   */
  compileToolResource(
    toolName,
    toolConfig,
    gatewayLogicalId,
    context,
    template,
  ) {
    const logicalId = getLogicalId(toolName, 'Tool')
    const serviceDir = this.serverless.serviceDir

    // Compile GatewayTarget resource
    const targetResource = compileGatewayTarget(
      toolName,
      toolConfig,
      gatewayLogicalId,
      serviceDir,
    )
    template.Resources[logicalId] = targetResource

    // Add target output
    template.Outputs[`${logicalId}Id`] = {
      Description: `ID of ${toolName} tool (GatewayTarget)`,
      Value: { 'Fn::GetAtt': [logicalId, 'TargetId'] },
    }
  }

  /**
   * Resolve the container image for a runtime
   */
  resolveContainerImage(name, config) {
    // If artifact.containerImage is specified, use it directly
    if (config.artifact?.containerImage) {
      return config.artifact.containerImage
    }

    // If artifact.docker is specified, check if we built it
    if (config.artifact?.docker) {
      if (this.builtImages[name]) {
        return this.builtImages[name]
      }
    }

    // If image is specified, resolve it
    if (config.image) {
      const imageName = typeof config.image === 'string' ? config.image : name

      // Check if we built this image
      if (this.builtImages[imageName]) {
        return this.builtImages[imageName]
      }

      // Check provider.ecr.images for URI
      const ecrImages = this.serverless.service.provider?.ecr?.images
      if (ecrImages && ecrImages[imageName]?.uri) {
        return ecrImages[imageName].uri
      }
    }

    // Check for buildpacks-built image (no artifact config specified)
    // This handles the auto-detection case where buildpacks were used
    if (this.builtImages[name]) {
      return this.builtImages[name]
    }

    return null
  }

  /**
   * Compile Runtime and RuntimeEndpoint resources
   * @param {string} name - Runtime name
   * @param {object} config - Runtime configuration
   * @param {object} context - Service context
   * @param {object} template - CloudFormation template
   * @param {object} [sharedMemories] - Shared memory definitions for reference resolution
   * @param {string} [gatewayLogicalId] - Gateway logical ID for env var injection (if agent has tools)
   */
  compileRuntimeResources(
    name,
    config,
    context,
    template,
    sharedMemories = {},
    gatewayLogicalId = null,
  ) {
    const logicalId = getLogicalId(name, 'Runtime')
    const tags = mergeTags(
      context.defaultTags,
      config.tags,
      context.serviceName,
      context.stage,
      name,
    )

    // Track memory logical ID for dependency linking
    let memoryLogicalId = null

    // Handle memory configuration
    if (config.memory) {
      if (typeof config.memory === 'string') {
        // Reference to shared memory - get its logical ID
        memoryLogicalId = getLogicalId(config.memory, 'Memory')
      } else if (typeof config.memory === 'object') {
        // Inline memory - compile it as a separate resource
        const inlineMemoryName = `${name}-memory`
        memoryLogicalId = getLogicalId(inlineMemoryName, 'Memory')

        // Compile the inline memory resource
        this.compileMemoryResources(
          inlineMemoryName,
          config.memory,
          context,
          template,
          name,
        )
      }
    }

    // Resolve container image
    const containerImage = this.resolveContainerImage(name, config)

    // Create a modified config with resolved image and env vars
    const resolvedConfig = {
      ...config,
      artifact: containerImage ? { containerImage } : config.artifact,
    }

    // Inject BEDROCK_AGENTCORE_MEMORY_ID env var when memory is configured
    if (memoryLogicalId) {
      resolvedConfig.environment = {
        ...resolvedConfig.environment,
        BEDROCK_AGENTCORE_MEMORY_ID: {
          'Fn::GetAtt': [memoryLogicalId, 'MemoryId'],
        },
      }
    }

    // Inject BEDROCK_AGENTCORE_GATEWAY_URL env var when tools are configured
    if (gatewayLogicalId) {
      resolvedConfig.environment = {
        ...resolvedConfig.environment,
        BEDROCK_AGENTCORE_GATEWAY_URL: {
          'Fn::GetAtt': [gatewayLogicalId, 'GatewayUrl'],
        },
      }
    }

    // Generate IAM role if not provided
    if (!config.roleArn) {
      const roleLogicalId = `${logicalId}Role`

      // Build role options for memory and gateway access
      const roleOptions = {}
      if (memoryLogicalId) {
        // Pass CFN GetAtt for memory ID to construct ARN
        roleOptions.memoryResourceRef = {
          'Fn::GetAtt': [memoryLogicalId, 'MemoryId'],
        }
      }
      if (gatewayLogicalId) {
        // Pass CFN GetAtt for gateway identifier to construct ARN
        // Note: Gateway uses 'GatewayIdentifier' not 'GatewayId' per CFN schema
        roleOptions.gatewayResourceRef = {
          'Fn::GetAtt': [gatewayLogicalId, 'GatewayIdentifier'],
        }
      }

      const roleResource = generateRuntimeRole(
        name,
        resolvedConfig,
        context,
        roleOptions,
      )
      template.Resources[roleLogicalId] = roleResource

      // Output the role ARN
      template.Outputs[`${logicalId}RoleArn`] = {
        Description: `IAM Role ARN for ${name} runtime`,
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile Runtime resource
    const runtimeResource = compileRuntime(name, resolvedConfig, context, tags)

    // Add dependency on memory if present
    if (memoryLogicalId) {
      runtimeResource.DependsOn = runtimeResource.DependsOn || []
      runtimeResource.DependsOn.push(memoryLogicalId)

      // Output the memory ARN associated with this runtime
      template.Outputs[`${logicalId}MemoryArn`] = {
        Description: `Memory ARN associated with ${name} runtime`,
        Value: { 'Fn::GetAtt': [memoryLogicalId, 'MemoryArn'] },
      }
    }

    template.Resources[logicalId] = runtimeResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: `ARN of ${name} AgentCore Runtime`,
      Value: { 'Fn::GetAtt': [logicalId, 'AgentRuntimeArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-${name}-RuntimeArn`,
      },
    }

    template.Outputs[`${logicalId}Id`] = {
      Description: `ID of ${name} AgentCore Runtime`,
      Value: { 'Fn::GetAtt': [logicalId, 'AgentRuntimeId'] },
    }

    // Add URL output for easy invocation
    template.Outputs[`${logicalId}Url`] = {
      Description: `Invocation URL for ${name} AgentCore Runtime`,
      Value: {
        'Fn::Sub': [
          'https://bedrock-agentcore.${Region}.amazonaws.com/runtimes/${RuntimeArn}/invocations',
          {
            Region: { Ref: 'AWS::Region' },
            RuntimeArn: { 'Fn::GetAtt': [logicalId, 'AgentRuntimeArn'] },
          },
        ],
      },
    }

    // Compile RuntimeEndpoints if defined
    if (config.endpoints && config.endpoints.length > 0) {
      for (const endpoint of config.endpoints) {
        const endpointName = endpoint.name || 'default'
        const endpointLogicalId = getLogicalId(name, `${endpointName}Endpoint`)

        const endpointResource = compileRuntimeEndpoint(
          name,
          endpointName,
          endpoint,
          logicalId,
          context,
          tags,
        )
        template.Resources[endpointLogicalId] = endpointResource

        // Add endpoint outputs
        template.Outputs[`${endpointLogicalId}Arn`] = {
          Description: `ARN of ${name}/${endpointName} RuntimeEndpoint`,
          Value: {
            'Fn::GetAtt': [endpointLogicalId, 'AgentRuntimeEndpointArn'],
          },
        }
      }
    }
  }

  /**
   * Compile Memory resources
   * @param {string} name - Memory name
   * @param {object} config - Memory configuration (supports user-friendly property names)
   * @param {object} context - Service context
   * @param {object} template - CloudFormation template
   * @param {string} [parentRuntimeName] - If memory is inline on a runtime, the runtime name
   */
  compileMemoryResources(name, config, context, template, parentRuntimeName) {
    const logicalId = getLogicalId(name, 'Memory')
    const tags = mergeTags(
      context.defaultTags,
      config.tags,
      context.serviceName,
      context.stage,
      name,
    )

    // Generate IAM role if not provided
    if (!config.roleArn) {
      const roleLogicalId = `${logicalId}Role`
      const roleResource = generateMemoryRole(name, config, context)
      template.Resources[roleLogicalId] = roleResource

      template.Outputs[`${logicalId}RoleArn`] = {
        Description: `IAM Role ARN for ${name} memory`,
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile Memory resource (supports user-friendly property names)
    const memoryResource = compileMemory(
      name,
      config,
      context,
      tags,
      parentRuntimeName,
    )
    template.Resources[logicalId] = memoryResource

    // Add outputs
    const description = parentRuntimeName
      ? `ARN of ${name} AgentCore Memory (inline for ${parentRuntimeName})`
      : `ARN of ${name} AgentCore Memory`

    template.Outputs[`${logicalId}Arn`] = {
      Description: description,
      Value: { 'Fn::GetAtt': [logicalId, 'MemoryArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-${name}-MemoryArn`,
      },
    }

    template.Outputs[`${logicalId}Id`] = {
      Description: `ID of ${name} AgentCore Memory`,
      Value: { 'Fn::GetAtt': [logicalId, 'MemoryId'] },
    }
  }

  /**
   * Compile Browser resources
   */
  compileBrowserResources(name, config, context, template) {
    const logicalId = getLogicalId(name, 'Browser')
    const tags = mergeTags(
      context.defaultTags,
      config.tags,
      context.serviceName,
      context.stage,
      name,
    )

    // Generate IAM role if not provided
    if (!config.roleArn) {
      const roleLogicalId = `${logicalId}Role`
      const roleResource = generateBrowserRole(name, config, context)
      template.Resources[roleLogicalId] = roleResource

      template.Outputs[`${logicalId}RoleArn`] = {
        Description: `IAM Role ARN for ${name} browser`,
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile Browser resource
    const browserResource = compileBrowser(name, config, context, tags)
    template.Resources[logicalId] = browserResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: `ARN of ${name} AgentCore Browser`,
      Value: { 'Fn::GetAtt': [logicalId, 'BrowserArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-${name}-BrowserArn`,
      },
    }

    template.Outputs[`${logicalId}Id`] = {
      Description: `ID of ${name} AgentCore Browser`,
      Value: { 'Fn::GetAtt': [logicalId, 'BrowserId'] },
    }
  }

  /**
   * Compile CodeInterpreter resources
   */
  compileCodeInterpreterResources(name, config, context, template) {
    const logicalId = getLogicalId(name, 'CodeInterpreter')
    const tags = mergeTags(
      context.defaultTags,
      config.tags,
      context.serviceName,
      context.stage,
      name,
    )

    // Generate IAM role if not provided
    if (!config.roleArn) {
      const roleLogicalId = `${logicalId}Role`
      const roleResource = generateCodeInterpreterRole(name, config, context)
      template.Resources[roleLogicalId] = roleResource

      template.Outputs[`${logicalId}RoleArn`] = {
        Description: `IAM Role ARN for ${name} code interpreter`,
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile CodeInterpreter resource
    const codeInterpreterResource = compileCodeInterpreter(
      name,
      config,
      context,
      tags,
    )
    template.Resources[logicalId] = codeInterpreterResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: `ARN of ${name} AgentCore CodeInterpreter`,
      Value: { 'Fn::GetAtt': [logicalId, 'CodeInterpreterArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-${name}-CodeInterpreterArn`,
      },
    }

    template.Outputs[`${logicalId}Id`] = {
      Description: `ID of ${name} AgentCore CodeInterpreter`,
      Value: { 'Fn::GetAtt': [logicalId, 'CodeInterpreterId'] },
    }
  }

  /**
   * Compile WorkloadIdentity resources
   */
  compileWorkloadIdentityResources(name, config, context, template) {
    const logicalId = getLogicalId(name, 'WorkloadIdentity')
    const tags = mergeTags(
      context.defaultTags,
      config.tags,
      context.serviceName,
      context.stage,
      name,
    )

    // WorkloadIdentity doesn't require an IAM role

    // Compile WorkloadIdentity resource
    const workloadIdentityResource = compileWorkloadIdentity(
      name,
      config,
      context,
      tags,
    )
    template.Resources[logicalId] = workloadIdentityResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: `ARN of ${name} AgentCore WorkloadIdentity`,
      Value: { 'Fn::GetAtt': [logicalId, 'WorkloadIdentityArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-${name}-WorkloadIdentityArn`,
      },
    }
  }

  /**
   * Display deployment information after deploy
   */
  async displayDeploymentInfo() {
    const agents = this.serverless.service.agents

    if (!agents || Object.keys(agents).length === 0) {
      return
    }

    // Resources deployed - no verbose output needed
  }

  /**
   * Show information about AgentCore resources
   */
  async showInfo() {
    const agents = this.serverless.service.agents

    if (!agents || Object.keys(agents).length === 0) {
      this.log.notice('No AgentCore resources defined in this service.')
      return
    }

    this.log.notice('AgentCore Resources:')
    this.log.notice('')

    // Check if gateway exists and show its URL
    const { hasTools } = this.collectAllTools(agents)
    if (hasTools) {
      this.log.notice('Gateway:')
      this.log.notice('  Auto-created gateway for tools')
      // Try to get gateway URL from stack outputs
      try {
        const stackName = this.provider.naming.getStackName()
        const result = await this.provider.request(
          'CloudFormation',
          'describeStacks',
          { StackName: stackName },
        )
        const stack = result.Stacks?.[0]
        const urlOutput = stack?.Outputs?.find(
          (o) => o.OutputKey === 'AgentCoreGatewayUrl',
        )
        if (urlOutput) {
          this.log.notice(`  URL: ${urlOutput.OutputValue}`)
        }
      } catch {
        this.log.notice('  URL: (deploy to see URL)')
      }
      this.log.notice('')
    }

    // Display shared memory
    if (agents.memory) {
      this.log.notice('Shared Memory:')
      for (const [memoryName, memoryConfig] of Object.entries(agents.memory)) {
        this.log.notice(`  ${memoryName}:`)
        this.log.notice(`    Type: Memory (shared)`)
        if (memoryConfig.description) {
          this.log.notice(`    Description: ${memoryConfig.description}`)
        }
        if (memoryConfig.expiration) {
          this.log.notice(`    Expiration: ${memoryConfig.expiration} days`)
        }
        if (this.options.verbose) {
          this.log.notice(
            `    Config: ${JSON.stringify(memoryConfig, null, 2)}`,
          )
        }
        this.log.notice('')
      }
    }

    // Display shared tools
    if (agents.tools) {
      this.log.notice('Shared Tools:')
      for (const [toolName, toolConfig] of Object.entries(agents.tools)) {
        this.log.notice(`  ${toolName}:`)
        try {
          const toolType = detectTargetType(toolConfig)
          this.log.notice(`    Type: ${toolType}`)
        } catch {
          this.log.notice(`    Type: unknown`)
        }
        if (toolConfig.description) {
          this.log.notice(`    Description: ${toolConfig.description}`)
        }
        if (this.options.verbose) {
          this.log.notice(`    Config: ${JSON.stringify(toolConfig, null, 2)}`)
        }
        this.log.notice('')
      }
    }

    this.log.notice('Agents:')
    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      const type = config.type.charAt(0).toUpperCase() + config.type.slice(1)
      this.log.notice(`  ${name}:`)
      this.log.notice(`    Type: ${type}`)

      if (config.description) {
        this.log.notice(`    Description: ${config.description}`)
      }

      // Show memory info for runtimes
      if (config.memory) {
        if (typeof config.memory === 'string') {
          this.log.notice(`    Memory: ${config.memory} (shared reference)`)
        } else {
          this.log.notice(`    Memory: inline`)
        }
      }

      // Show tools info for runtimes
      if (config.tools) {
        const toolNames = Object.keys(config.tools)
        this.log.notice(`    Tools: ${toolNames.join(', ')}`)
      }

      if (this.options.verbose) {
        this.log.notice(`    Config: ${JSON.stringify(config, null, 2)}`)
      }

      this.log.notice('')
    }
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
   */
  getFirstRuntimeAgent() {
    const agents = this.getAgentsConfig()
    if (!agents) {
      return null
    }

    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      if (config.type === 'runtime') {
        return name
      }
    }

    return null
  }

  /**
   * Parse a time string like "1h", "30m", "5m" to milliseconds ago
   */
  parseTimeAgo(timeStr) {
    if (!timeStr) {
      return Date.now() - 60 * 60 * 1000
    } // Default 1 hour

    const match = timeStr.match(/^(\d+)([mhd])$/)
    if (match) {
      const value = parseInt(match[1], 10)
      const unit = match[2]
      const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
      }

      return Date.now() - value * multipliers[unit]
    }

    // Try parsing as date
    const date = new Date(timeStr)
    if (!isNaN(date.getTime())) {
      return date.getTime()
    }

    return Date.now() - 60 * 60 * 1000 // Default 1 hour
  }

  /**
   * Fetch logs for a deployed AgentCore runtime
   */
  async fetchLogs() {
    const { spawnSync, spawn } = await import('child_process')

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

    // Log group pattern for AgentCore runtimes
    const logGroupPrefix = `/aws/bedrock-agentcore/runtimes/${runtimeId}`

    this.log.info(`Log group prefix: ${logGroupPrefix}`)

    // First, list log groups matching the prefix
    try {
      const listArgs = [
        'logs',
        'describe-log-groups',
        '--log-group-name-prefix',
        logGroupPrefix,
        '--region',
        region,
        '--output',
        'json',
      ]

      const listResult = spawnSync('aws', listArgs, { encoding: 'utf-8' })
      if (listResult.error) {
        throw listResult.error
      }
      if (listResult.status !== 0) {
        throw new Error(
          listResult.stderr || `AWS CLI exited with code ${listResult.status}`,
        )
      }
      const logGroups = JSON.parse(listResult.stdout)

      if (!logGroups.logGroups || logGroups.logGroups.length === 0) {
        this.log.notice(
          'No log groups found. The agent may not have been invoked yet.',
        )
        this.log.notice(`Looking for: ${logGroupPrefix}*`)
        return
      }

      // Use the first log group found (runtime-logs)
      const logGroupName = logGroups.logGroups[0].logGroupName
      this.log.info(`Using log group: ${logGroupName}`)

      if (this.options.tail) {
        // Stream logs continuously
        this.log.notice('Streaming logs (Ctrl+C to stop)...')
        this.log.notice('─'.repeat(50))

        const tailArgs = [
          'logs',
          'tail',
          logGroupName,
          '--follow',
          '--region',
          region,
          ...(this.options.filter
            ? ['--filter-pattern', this.options.filter]
            : []),
        ]

        const tailCmd = spawn('aws', tailArgs, { stdio: 'inherit' })

        // Handle graceful shutdown
        process.on('SIGINT', () => {
          tailCmd.kill()
          process.exit(0)
        })

        await new Promise((resolve) => {
          tailCmd.on('close', resolve)
        })
      } else {
        // Fetch recent logs
        const startTime = this.parseTimeAgo(this.options.startTime)

        const logsArgs = [
          'logs',
          'filter-log-events',
          '--log-group-name',
          logGroupName,
          '--start-time',
          startTime.toString(),
          '--region',
          region,
          ...(this.options.filter
            ? ['--filter-pattern', this.options.filter]
            : []),
          '--output',
          'json',
        ]

        const logsResult = spawnSync('aws', logsArgs, { encoding: 'utf-8' })
        if (logsResult.error) {
          throw logsResult.error
        }
        if (logsResult.status !== 0) {
          throw new Error(
            logsResult.stderr ||
              `AWS CLI exited with code ${logsResult.status}`,
          )
        }
        const events = JSON.parse(logsResult.stdout)

        if (!events.events || events.events.length === 0) {
          this.log.notice('No log events found in the specified time range.')
          this.log.notice(
            `Time range: since ${new Date(startTime).toISOString()}`,
          )
          return
        }

        this.log.notice(`Found ${events.events.length} log events:`)
        this.log.notice('─'.repeat(50))

        for (const event of events.events) {
          const timestamp = new Date(event.timestamp).toISOString()
          const message = event.message.trim()
          this.log.notice(`[${timestamp}] ${message}`)
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
    const devMode = new AgentCoreDevMode({
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
