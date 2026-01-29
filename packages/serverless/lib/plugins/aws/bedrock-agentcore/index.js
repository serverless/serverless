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
import {
  generateRuntimeRole,
  generateMemoryRole,
  generateGatewayRole,
  generateBrowserRole,
  generateCodeInterpreterRole,
} from './iam/policies.js'
import { getLogicalId, pascalCase } from './utils/naming.js'
import { mergeTags } from './utils/tags.js'
import { defineAgentsSchema } from './validators/schema.js'
import { DockerBuilder } from './docker/builder.js'
import { AgentCoreDevMode } from './dev/index.js'

// Reserved keys at agents level (not treated as runtime agent definitions)
const RESERVED_AGENT_KEYS = [
  'memory',
  'tools',
  'gateways',
  'browsers',
  'codeInterpreters',
]

/**
 * Check if role should be auto-generated
 * Returns true if role should be generated (no role or role is a customization object)
 * Returns false if role is an existing ARN or CloudFormation intrinsic
 *
 * @param {object} config - Resource configuration
 * @returns {boolean} True if role should be generated
 */
function shouldGenerateRole(config) {
  // No role specified - generate with defaults
  if (!config.role) {
    return true
  }

  // Role is a string ARN - don't generate
  if (typeof config.role === 'string') {
    return false
  }

  // Role is an object - check if it's a CF intrinsic or customization
  if (typeof config.role === 'object') {
    // CloudFormation intrinsic functions - don't generate
    if (
      config.role.Ref ||
      config.role['Fn::GetAtt'] ||
      config.role['Fn::ImportValue'] ||
      config.role['Fn::Sub'] ||
      config.role['Fn::Join']
    ) {
      return false
    }
    // Customization object (has statements, managedPolicies, etc.) - generate with customizations
    return true
  }

  return false
}

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

    // Count runtime agents (excluding reserved keys)
    const runtimeAgentCount = Object.keys(agents).filter(
      (k) => !RESERVED_AGENT_KEYS.includes(k),
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
          throw new this.serverless.classes.Error(
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
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      this.validateAgent(name, config, sharedMemory, sharedGateways)
    }
  }

  /**
   * Validate gateway configuration
   * @param {string} gatewayName - Gateway name
   * @param {object} gatewayConfig - Gateway configuration
   * @param {object} sharedTools - Available shared tools for reference validation
   */
  validateGatewayConfig(gatewayName, gatewayConfig, sharedTools = {}) {
    // Validate tools references
    if (gatewayConfig.tools) {
      if (!Array.isArray(gatewayConfig.tools)) {
        throw new this.serverless.classes.Error(
          `Gateway '${gatewayName}' tools must be an array of tool names`,
        )
      }

      for (const toolName of gatewayConfig.tools) {
        if (typeof toolName !== 'string') {
          throw new this.serverless.classes.Error(
            `Gateway '${gatewayName}' tool reference must be a string, got ${typeof toolName}`,
          )
        }
        if (!sharedTools[toolName]) {
          throw new this.serverless.classes.Error(
            `Gateway '${gatewayName}' references undefined tool '${toolName}'. Define it in agents.tools first.`,
          )
        }
      }
    }

    // Validate authorizer if present
    if (gatewayConfig.authorizer) {
      const authorizer = gatewayConfig.authorizer
      const validTypes = ['NONE', 'AWS_IAM', 'CUSTOM_JWT']

      if (typeof authorizer === 'string') {
        const normalizedType = authorizer.toUpperCase()
        if (!validTypes.includes(normalizedType)) {
          throw new this.serverless.classes.Error(
            `Gateway '${gatewayName}' has invalid authorizer type '${authorizer}'. Valid types: ${validTypes.join(', ')}`,
          )
        }
      } else if (typeof authorizer === 'object') {
        const normalizedType = authorizer.type?.toUpperCase()
        if (!normalizedType || !validTypes.includes(normalizedType)) {
          throw new this.serverless.classes.Error(
            `Gateway '${gatewayName}' has invalid authorizer.type. Valid types: ${validTypes.join(', ')}`,
          )
        }
        // Validate JWT config is present when type is CUSTOM_JWT
        if (normalizedType === 'CUSTOM_JWT' && !authorizer.jwt) {
          throw new this.serverless.classes.Error(
            `Gateway '${gatewayName}' with CUSTOM_JWT authorizer requires jwt configuration`,
          )
        }
        if (authorizer.jwt && !authorizer.jwt.discoveryUrl) {
          throw new this.serverless.classes.Error(
            `Gateway '${gatewayName}' jwt configuration requires discoveryUrl`,
          )
        }
      }
    }
  }

  /**
   * Validate individual runtime agent configuration
   * Runtime agents are any non-reserved keys under agents
   * @param {string} name - Agent name
   * @param {object} config - Agent configuration
   * @param {object} sharedMemory - Available shared memory definitions for reference validation
   * @param {object} sharedGateways - Available gateways for reference validation
   */
  validateAgent(name, config, sharedMemory = {}, sharedGateways = {}) {
    // All non-reserved keys are runtime agents
    this.validateRuntime(name, config, sharedMemory, sharedGateways)
  }

  /**
   * Validate runtime configuration
   * @param {string} name - Runtime name
   * @param {object} config - Runtime configuration
   * @param {object} sharedMemory - Available shared memory definitions for reference validation
   * @param {object} sharedGateways - Available gateways for reference validation
   */
  validateRuntime(name, config, sharedMemory = {}, sharedGateways = {}) {
    // Check deployment type: code (handler) or container (artifact.image)
    const hasHandler = config.handler !== undefined
    const hasArtifactImage = config.artifact?.image !== undefined

    // Mutual exclusivity: cannot have both handler and artifact.image
    if (hasHandler && hasArtifactImage) {
      throw new this.serverless.classes.Error(
        `Runtime '${name}' cannot specify both 'handler' and 'artifact.image'. Use 'handler' for code deployment or 'artifact.image' for container deployment.`,
      )
    }

    // If no handler and no artifact.image specified, buildpacks auto-detection will be used
    // This is valid - DockerClient will build using buildpacks from the service directory

    // Validate artifact.s3 requires handler (code deployment)
    if (config.artifact?.s3 && !hasHandler && !hasArtifactImage) {
      throw new this.serverless.classes.Error(
        `Runtime '${name}' with 'artifact.s3' requires 'handler' to be specified for code deployment.`,
      )
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

    // Validate gateway configuration if present
    if (config.gateway) {
      if (typeof config.gateway !== 'string') {
        throw new this.serverless.classes.Error(
          `Runtime '${name}' gateway must be a string reference to a gateway defined in agents.gateways`,
        )
      }
      // Only validate gateway reference if gateways are defined
      // If no gateways are defined but gateway property is set, that's an error
      if (Object.keys(sharedGateways).length === 0) {
        throw new this.serverless.classes.Error(
          `Runtime '${name}' references gateway '${config.gateway}' but no gateways are defined in agents.gateways`,
        )
      }
      if (!sharedGateways[config.gateway]) {
        throw new this.serverless.classes.Error(
          `Runtime '${name}' references undefined gateway '${config.gateway}'. Available gateways: ${Object.keys(sharedGateways).join(', ')}`,
        )
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
      const normalizedType = config.credentials.type?.toUpperCase()
      if (normalizedType && !validTypes.includes(normalizedType)) {
        throw new this.serverless.classes.Error(
          `Tool '${name}' credentials.type must be one of: ${validTypes.join(', ')}`,
        )
      }

      if (normalizedType === 'OAUTH') {
        if (!config.credentials.provider || !config.credentials.scopes) {
          throw new this.serverless.classes.Error(
            `Tool '${name}' OAUTH credentials require provider and scopes`,
          )
        }
      }

      if (normalizedType === 'API_KEY') {
        if (!config.credentials.provider) {
          throw new this.serverless.classes.Error(
            `Tool '${name}' API_KEY credentials require provider`,
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
   * @param {string} name - Browser name
   * @param {object} config - Browser configuration
   */
  validateBrowser(name, config) {
    const validModes = ['PUBLIC', 'VPC']
    const networkMode = config.network?.mode?.toUpperCase()
    if (networkMode && !validModes.includes(networkMode)) {
      throw new this.serverless.classes.Error(
        `Browser '${name}' has invalid network.mode '${config.network.mode}'. Valid modes: ${validModes.join(', ')}`,
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
   * @param {string} name - CodeInterpreter name
   * @param {object} config - CodeInterpreter configuration
   */
  validateCodeInterpreter(name, config) {
    const validModes = ['PUBLIC', 'SANDBOX', 'VPC']
    const networkMode = config.network?.mode?.toUpperCase()
    if (networkMode && !validModes.includes(networkMode)) {
      throw new this.serverless.classes.Error(
        `CodeInterpreter '${name}' has invalid network.mode '${config.network.mode}'. Valid modes: ${validModes.join(', ')}`,
      )
    }

    // Validate VPC configuration when VPC mode is specified
    if (networkMode === 'VPC') {
      if (!config.network.subnets || config.network.subnets.length === 0) {
        throw new this.serverless.classes.Error(
          `CodeInterpreter '${name}' requires network.subnets when mode is VPC`,
        )
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
      // Skip reserved keys - only runtime agents need Docker builds
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      // All non-reserved keys are runtime agents
      // Check for Docker build config: artifact.image as object (not string URI)
      const artifactImage = config.artifact?.image
      if (artifactImage && typeof artifactImage === 'object') {
        // artifact.image is an object with build instructions
        runtimesToBuild.push({
          name,
          config,
          imageConfig: artifactImage,
        })
      } else if (
        !artifactImage && // No pre-built image URI
        !config.handler // No code deployment handler
      ) {
        // No explicit artifact configuration - use buildpacks auto-detection
        // Look for Dockerfile in root directory
        runtimesToBuild.push({
          name,
          config,
          imageConfig: { path: '.' },
        })
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
   * Collect all tools (shared + agent-level) to determine if gateway is needed
   * Also returns which agents have tools for env var injection
   *
   * Behavior:
   * - If gateways is NOT defined: return all tools from agents.tools, hasGateways=false
   * - If gateways IS defined: return tools, but compilation uses gateway assignments, hasGateways=true
   */
  collectAllTools(agents) {
    const sharedTools = agents.tools || {}
    const gateways = agents.gateways || {}
    const hasGateways = Object.keys(gateways).length > 0
    const hasTools = Object.keys(sharedTools).length > 0

    return {
      sharedTools,
      hasTools,
      hasGateways,
    }
  }

  /**
   * Collect gateway configurations with their tool assignments
   * Returns a map of gateway names to their configs (with normalized authorizer)
   */
  collectGateways(agents) {
    const gateways = agents.gateways || {}
    const result = {}

    for (const [gatewayName, gatewayConfig] of Object.entries(gateways)) {
      result[gatewayName] = {
        ...gatewayConfig,
        tools: gatewayConfig.tools || [],
        // Normalize authorizer (string -> object form)
        authorizer: this.normalizeAuthorizer(gatewayConfig.authorizer),
      }
    }

    return result
  }

  /**
   * Normalize authorizer config from string shorthand to object form
   * Also normalizes case to uppercase for CFN compatibility
   * @param {string|object} authorizer - 'AWS_IAM' or { type: 'CUSTOM_JWT', jwt: {...} }
   * @returns {object} - { type: 'AWS_IAM' } or { type: 'CUSTOM_JWT', jwt: {...} }
   */
  normalizeAuthorizer(authorizer) {
    if (!authorizer) {
      return { type: 'AWS_IAM' } // Default
    }
    if (typeof authorizer === 'string') {
      return { type: authorizer.toUpperCase() }
    }
    // Normalize type to uppercase
    return {
      ...authorizer,
      type: authorizer.type?.toUpperCase() || 'AWS_IAM',
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
      endpoints: 0,
      tools: 0,
    }

    // Collect all tools and gateway info
    const { sharedTools, hasTools, hasGateways } = this.collectAllTools(agents)

    // Map of gateway names to their logical IDs (for agent gateway selection)
    const gatewayLogicalIds = {}

    // First pass: Compile gateways and tools
    if (hasGateways) {
      // Multi-gateway mode: compile each gateway and its tools
      const gateways = this.collectGateways(agents)

      for (const [gatewayName, gatewayConfig] of Object.entries(gateways)) {
        const gatewayLogicalId = this.compileNamedGateway(
          gatewayName,
          gatewayConfig,
          context,
          template,
        )
        gatewayLogicalIds[gatewayName] = gatewayLogicalId
        stats.gateway++

        // Compile tools for this gateway
        for (const toolName of gatewayConfig.tools) {
          const toolConfig = sharedTools[toolName]
          if (toolConfig) {
            this.compileToolResource(
              toolName,
              toolConfig,
              gatewayLogicalId,
              context,
              template,
              gatewayName, // Include gateway name for unique logical ID
            )
            stats.tools++
          }
        }
      }
    } else if (hasTools) {
      // Default gateway mode (backwards compat): create single gateway with all tools
      const gatewayLogicalId = this.compileToolsGateway(context, template)
      gatewayLogicalIds['_default'] = gatewayLogicalId
      stats.gateway = 1

      // Compile all shared tools to the default gateway
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

    // Third pass: Compile browsers from reserved key
    if (agents.browsers) {
      for (const [browserName, browserConfig] of Object.entries(
        agents.browsers,
      )) {
        this.compileBrowserResources(
          browserName,
          browserConfig,
          context,
          template,
        )
        stats.browser++
      }
    }

    // Fourth pass: Compile codeInterpreters from reserved key
    if (agents.codeInterpreters) {
      for (const [ciName, ciConfig] of Object.entries(
        agents.codeInterpreters,
      )) {
        this.compileCodeInterpreterResources(
          ciName,
          ciConfig,
          context,
          template,
        )
        stats.codeInterpreter++
      }
    }

    // Fifth pass: Compile runtime agents (non-reserved keys)
    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }

      // All non-reserved keys are runtime agents
      // Determine which gateway (if any) this agent uses
      let agentGatewayLogicalId = null
      if (config.gateway && gatewayLogicalIds[config.gateway]) {
        // Agent explicitly specifies a gateway
        agentGatewayLogicalId = gatewayLogicalIds[config.gateway]
      } else if (!hasGateways && gatewayLogicalIds['_default']) {
        // No explicit gateway but default exists (backwards compat)
        agentGatewayLogicalId = gatewayLogicalIds['_default']
      }
      // If gateways exist but agent doesn't specify one, no gateway injection

      this.compileRuntimeResources(
        name,
        config,
        context,
        template,
        agents.memory,
        agentGatewayLogicalId,
      )
      stats.runtime++
      if (config.endpoints) {
        stats.endpoints += config.endpoints.length
      }
      // If runtime has inline memory, count it
      if (config.memory && typeof config.memory === 'object') {
        stats.memory++
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

    this.log.info(`Compiled AgentCore resources: ${resourceSummary.join(', ')}`)

    if (stats.endpoints > 0) {
      this.log.info(`  - ${stats.endpoints} runtime endpoint(s)`)
    }
    if (stats.tools > 0) {
      this.log.info(`  - ${stats.tools} tool(s)`)
    }
  }

  /**
   * Compile the auto-created default Gateway for tools (backwards compatibility)
   * Used when agents.tools exists but agents.gateways does not
   * @returns {string} Gateway logical ID
   */
  compileToolsGateway(context, template) {
    const gatewayConfig = {} // Default config when no explicit gateways defined
    const logicalId = 'AgentCoreGateway'
    const tags = mergeTags(
      context.defaultTags,
      gatewayConfig.tags,
      context.serviceName,
      context.stage,
      'gateway',
    )

    // Generate IAM role (always generated for default gateway)
    const roleLogicalId = `${logicalId}Role`
    const roleResource = generateGatewayRole('gateway', gatewayConfig, context)
    template.Resources[roleLogicalId] = roleResource

    template.Outputs[`${logicalId}RoleArn`] = {
      Description: 'IAM Role ARN for AgentCore Gateway',
      Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
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
   * Compile a named Gateway from agents.gateways
   * @param {string} gatewayName - Gateway name from config
   * @param {object} gatewayConfig - Gateway configuration (with normalized authorizer)
   * @param {object} context - Compilation context
   * @param {object} template - CloudFormation template
   * @returns {string} Gateway logical ID
   */
  compileNamedGateway(gatewayName, gatewayConfig, context, template) {
    const logicalId = `AgentCoreGateway${pascalCase(gatewayName)}`
    const tags = mergeTags(
      context.defaultTags,
      gatewayConfig.tags,
      context.serviceName,
      context.stage,
      gatewayName,
    )

    // Build gateway config for compiler
    // Convert normalized authorizer back to gateway compiler format
    const compilerConfig = {
      ...gatewayConfig,
      authorizerType: gatewayConfig.authorizer?.type || 'AWS_IAM',
      // Convert jwt to authorizerConfiguration format if present
      ...(gatewayConfig.authorizer?.jwt && {
        authorizerConfiguration: {
          jwt: gatewayConfig.authorizer.jwt,
        },
      }),
    }

    // Generate IAM role if not provided or if role is a customization object
    const roleLogicalId = `${logicalId}Role`
    if (shouldGenerateRole(gatewayConfig)) {
      const roleResource = generateGatewayRole(
        gatewayName,
        gatewayConfig,
        context,
      )
      template.Resources[roleLogicalId] = roleResource

      template.Outputs[`${logicalId}RoleArn`] = {
        Description: `IAM Role ARN for ${gatewayName} Gateway`,
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile Gateway resource
    const gatewayResource = compileGateway(
      gatewayName,
      compilerConfig,
      context,
      tags,
      roleLogicalId,
    )
    template.Resources[logicalId] = gatewayResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: `ARN of ${gatewayName} Gateway`,
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-${pascalCase(gatewayName)}GatewayArn`,
      },
    }

    template.Outputs[`${logicalId}Id`] = {
      Description: `ID of ${gatewayName} Gateway`,
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayIdentifier'] },
    }

    template.Outputs[`${logicalId}Url`] = {
      Description: `URL of ${gatewayName} Gateway`,
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayUrl'] },
    }

    return logicalId
  }

  /**
   * Compile a tool as a GatewayTarget resource
   * @param {string} toolName - Tool name
   * @param {object} toolConfig - Tool configuration
   * @param {string} gatewayLogicalId - Gateway logical ID
   * @param {object} context - Compilation context
   * @param {object} template - CloudFormation template
   * @param {string} [gatewayName] - Optional gateway name for unique logical ID (multi-gateway)
   */
  compileToolResource(
    toolName,
    toolConfig,
    gatewayLogicalId,
    context,
    template,
    gatewayName,
  ) {
    // When same tool is in multiple gateways, include gateway name in logical ID
    const logicalId = gatewayName
      ? `${getLogicalId(toolName, 'Tool')}${pascalCase(gatewayName)}`
      : getLogicalId(toolName, 'Tool')
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
    const description = gatewayName
      ? `ID of ${toolName} tool (GatewayTarget for ${gatewayName})`
      : `ID of ${toolName} tool (GatewayTarget)`
    template.Outputs[`${logicalId}Id`] = {
      Description: description,
      Value: { 'Fn::GetAtt': [logicalId, 'TargetId'] },
    }
  }

  /**
   * Resolve the container image for a runtime
   */
  resolveContainerImage(name, config) {
    const artifactImage = config.artifact?.image

    // If artifact.image is a string (pre-built image URI), use it directly
    if (typeof artifactImage === 'string') {
      return artifactImage
    }

    // If artifact.image is an object (build config), check if we built it
    if (typeof artifactImage === 'object' && artifactImage !== null) {
      if (this.builtImages[name]) {
        return this.builtImages[name]
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

    // Create a modified config with resolved values and normalized artifact format
    // This normalizes the new schema (handler, runtime at root) to the internal
    // format expected by the compiler (entryPoint, runtime in artifact)
    const resolvedConfig = {
      ...config,
      artifact: {
        ...config.artifact,
        // If we have a resolved container image, set it
        ...(containerImage && { image: containerImage }),
        // Normalize handler to entryPoint array for compiler
        ...(config.handler && { entryPoint: [config.handler] }),
        // Normalize runtime to artifact.runtime for compiler
        ...(config.runtime && { runtime: config.runtime }),
      },
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

    // Generate IAM role if not provided or if role is a customization object
    // Support both 'role' (new) and 'roleArn' (legacy) property names
    if (shouldGenerateRole(config)) {
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

    // Generate IAM role if not provided or if role is a customization object
    // Support both 'role' (new) and 'roleArn' (legacy) property names
    if (shouldGenerateRole(config)) {
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

    // Generate IAM role if not provided or if role is a customization object
    // Support both 'role' (new) and 'roleArn' (legacy) property names
    if (shouldGenerateRole(config)) {
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

    // Generate IAM role if not provided or if role is a customization object
    // Support both 'role' (new) and 'roleArn' (legacy) property names
    if (shouldGenerateRole(config)) {
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

    // Display runtime agents (non-reserved keys)
    this.log.notice('Runtime Agents:')
    let hasRuntimeAgents = false
    for (const [name, config] of Object.entries(agents)) {
      // Skip reserved keys
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      hasRuntimeAgents = true
      this.log.notice(`  ${name}:`)
      this.log.notice(`    Type: Runtime`)

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

      // Show gateway info for runtimes
      if (config.gateway) {
        this.log.notice(`    Gateway: ${config.gateway}`)
      }

      if (this.options.verbose) {
        this.log.notice(`    Config: ${JSON.stringify(config, null, 2)}`)
      }

      this.log.notice('')
    }
    if (!hasRuntimeAgents) {
      this.log.notice('  (none)')
      this.log.notice('')
    }

    // Display browsers
    if (agents.browsers && Object.keys(agents.browsers).length > 0) {
      this.log.notice('Browsers:')
      for (const [name, config] of Object.entries(agents.browsers)) {
        this.log.notice(`  ${name}:`)
        if (config.description) {
          this.log.notice(`    Description: ${config.description}`)
        }
        if (this.options.verbose) {
          this.log.notice(`    Config: ${JSON.stringify(config, null, 2)}`)
        }
        this.log.notice('')
      }
    }

    // Display codeInterpreters
    if (
      agents.codeInterpreters &&
      Object.keys(agents.codeInterpreters).length > 0
    ) {
      this.log.notice('Code Interpreters:')
      for (const [name, config] of Object.entries(agents.codeInterpreters)) {
        this.log.notice(`  ${name}:`)
        if (config.description) {
          this.log.notice(`    Description: ${config.description}`)
        }
        if (this.options.verbose) {
          this.log.notice(`    Config: ${JSON.stringify(config, null, 2)}`)
        }
        this.log.notice('')
      }
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
   * All non-reserved keys are runtime agents
   */
  getFirstRuntimeAgent() {
    const agents = this.getAgentsConfig()
    if (!agents) {
      return null
    }

    for (const [name] of Object.entries(agents)) {
      // Skip reserved keys - first non-reserved key is a runtime agent
      if (RESERVED_AGENT_KEYS.includes(name)) {
        continue
      }
      return name
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
    const serviceName = this.serverless.service.service
    const devMode = new AgentCoreDevMode({
      serverless: this.serverless,
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
