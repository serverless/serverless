'use strict'

import { compileRuntime } from './compilers/runtime.js'
import { compileRuntimeEndpoint } from './compilers/runtimeEndpoint.js'
import { compileMemory } from './compilers/memory.js'
import { compileGateway } from './compilers/gateway.js'
import { compileGatewayTarget } from './compilers/gatewayTarget.js'
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
          invoke: {
            usage: 'Invoke a deployed AgentCore runtime agent',
            lifecycleEvents: ['invoke'],
            options: {
              agent: {
                usage:
                  'Name of the agent to invoke (defaults to first runtime agent)',
                shortcut: 'a',
                type: 'string',
              },
              message: {
                usage: 'Message to send to the agent',
                shortcut: 'm',
                type: 'string',
                required: true,
              },
              session: {
                usage: 'Session ID for conversation continuity',
                shortcut: 's',
                type: 'string',
              },
            },
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
        },
      },
    }

    // Lifecycle hooks
    this.hooks = {
      // Initialization
      initialize: () => this.init(),

      // Validation phase
      'before:package:initialize': () => this.validateConfig(),

      // Build Docker images before packaging (if configured)
      'before:package:createDeploymentArtifacts': () =>
        this.buildDockerImages(),

      // Compilation phase - add resources to CloudFormation
      'package:compileEvents': () => this.compileAgentCoreResources(),
      'before:package:compileFunctions': () => this.compileAgentCoreResources(),
      'after:package:compileFunctions': () => this.compileAgentCoreResources(),
      'before:package:finalize': () => this.compileAgentCoreResources(),

      // Post-deploy info
      'after:deploy:deploy': () => this.displayDeploymentInfo(),

      // Custom commands
      'agentcore:info:info': () => this.showInfo(),
      'agentcore:build:build': () => this.buildDockerImages(),
      'agentcore:invoke:invoke': () => this.invokeAgent(),
      'agentcore:logs:logs': () => this.fetchLogs(),
    }
  }

  /**
   * Initialize plugin
   */
  init() {
    this.log.debug(`${this.pluginName} initialized`)
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

    this.log.info(`Validating ${Object.keys(agents).length} agent(s)...`)

    for (const [name, config] of Object.entries(agents)) {
      this.validateAgent(name, config)
    }
  }

  /**
   * Validate individual agent configuration
   */
  validateAgent(name, config) {
    if (!config.type) {
      throw new this.serverless.classes.Error(
        `Agent '${name}' must have a 'type' property (runtime, memory, gateway, browser, codeInterpreter, or workloadIdentity)`,
      )
    }

    const validTypes = [
      'runtime',
      'memory',
      'gateway',
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
        this.validateRuntime(name, config)
        break
      case 'memory':
        this.validateMemory(name, config)
        break
      case 'gateway':
        this.validateGateway(name, config)
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
   */
  validateRuntime(name, config) {
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
  }

  /**
   * Validate memory configuration
   */
  validateMemory(name, config) {
    if (config.eventExpiryDuration !== undefined) {
      const duration = config.eventExpiryDuration
      if (typeof duration !== 'number' || duration < 7 || duration > 365) {
        throw new this.serverless.classes.Error(
          `Memory '${name}' eventExpiryDuration must be a number between 7 and 365 days`,
        )
      }
    }
  }

  /**
   * Validate gateway configuration
   */
  validateGateway(name, config) {
    const validAuthTypes = ['NONE', 'AWS_IAM', 'CUSTOM_JWT']
    if (
      config.authorizerType &&
      !validAuthTypes.includes(config.authorizerType)
    ) {
      throw new this.serverless.classes.Error(
        `Gateway '${name}' has invalid authorizerType '${config.authorizerType}'. Valid types: ${validAuthTypes.join(', ')}`,
      )
    }

    const validProtocols = ['MCP']
    if (config.protocolType && !validProtocols.includes(config.protocolType)) {
      throw new this.serverless.classes.Error(
        `Gateway '${name}' has invalid protocolType '${config.protocolType}'. Valid types: ${validProtocols.join(', ')}`,
      )
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
   * Build Docker images for runtime agents that have image configuration
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
          // No explicit artifact configuration - try buildpacks auto-detection
          // DockerClient will fall back to buildpacks if no Dockerfile exists
          runtimesToBuild.push({
            name,
            config,
            imageConfig: { path: '.', buildpacks: true },
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
      this.builtImages = await builder.processImages(ecrImages, context)
    }

    // Build images for runtimes with docker config
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
        const imageUri = await builder.buildAndPushForRuntime(
          name,
          dockerConfig,
          context,
        )
        this.builtImages[name] = imageUri
      }
    }
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
      targets: 0,
    }

    for (const [name, config] of Object.entries(agents)) {
      switch (config.type) {
        case 'runtime':
          this.compileRuntimeResources(name, config, context, template)
          stats.runtime++
          if (config.endpoints) {
            stats.endpoints += config.endpoints.length
          }
          break
        case 'memory':
          this.compileMemoryResources(name, config, context, template)
          stats.memory++
          break
        case 'gateway':
          this.compileGatewayResources(name, config, context, template)
          stats.gateway++
          if (config.targets) {
            stats.targets += config.targets.length
          }
          break
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
      resourceSummary.push(`${stats.gateway} gateway(s)`)
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
    if (stats.targets > 0) {
      this.log.info(`  - ${stats.targets} gateway target(s)`)
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
   */
  compileRuntimeResources(name, config, context, template) {
    const logicalId = getLogicalId(name, 'Runtime')
    const tags = mergeTags(
      context.defaultTags,
      config.tags,
      context.serviceName,
      context.stage,
      name,
    )

    // Resolve container image
    const containerImage = this.resolveContainerImage(name, config)

    // Create a modified config with resolved image
    const resolvedConfig = {
      ...config,
      artifact: containerImage ? { containerImage } : config.artifact,
    }

    // Generate IAM role if not provided
    if (!config.roleArn) {
      const roleLogicalId = `${logicalId}Role`
      const roleResource = generateRuntimeRole(name, resolvedConfig, context)
      template.Resources[roleLogicalId] = roleResource

      // Output the role ARN
      template.Outputs[`${logicalId}RoleArn`] = {
        Description: `IAM Role ARN for ${name} runtime`,
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile Runtime resource
    const runtimeResource = compileRuntime(name, resolvedConfig, context, tags)
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
   */
  compileMemoryResources(name, config, context, template) {
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

    // Compile Memory resource
    const memoryResource = compileMemory(name, config, context, tags)
    template.Resources[logicalId] = memoryResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: `ARN of ${name} AgentCore Memory`,
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
   * Compile Gateway and GatewayTarget resources
   */
  compileGatewayResources(name, config, context, template) {
    const logicalId = getLogicalId(name, 'Gateway')
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
      const roleResource = generateGatewayRole(name, config, context)
      template.Resources[roleLogicalId] = roleResource

      template.Outputs[`${logicalId}RoleArn`] = {
        Description: `IAM Role ARN for ${name} gateway`,
        Value: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }
    }

    // Compile Gateway resource
    const gatewayResource = compileGateway(name, config, context, tags)
    template.Resources[logicalId] = gatewayResource

    // Add outputs
    template.Outputs[`${logicalId}Arn`] = {
      Description: `ARN of ${name} AgentCore Gateway`,
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayArn'] },
      Export: {
        Name: `${context.serviceName}-${context.stage}-${name}-GatewayArn`,
      },
    }

    template.Outputs[`${logicalId}Id`] = {
      Description: `ID of ${name} AgentCore Gateway`,
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayIdentifier'] },
    }

    template.Outputs[`${logicalId}Url`] = {
      Description: `URL of ${name} AgentCore Gateway`,
      Value: { 'Fn::GetAtt': [logicalId, 'GatewayUrl'] },
    }

    // Compile GatewayTargets if defined
    if (config.targets && config.targets.length > 0) {
      for (const target of config.targets) {
        const targetName = target.name
        if (!targetName) {
          throw new this.serverless.classes.Error(
            `Gateway '${name}' target must have a 'name' property`,
          )
        }

        const targetLogicalId = getLogicalId(name, `${targetName}Target`)
        const targetResource = compileGatewayTarget(
          name,
          targetName,
          target,
          logicalId,
          context,
        )
        template.Resources[targetLogicalId] = targetResource

        // Add target outputs
        template.Outputs[`${targetLogicalId}Id`] = {
          Description: `ID of ${name}/${targetName} GatewayTarget`,
          Value: { 'Fn::GetAtt': [targetLogicalId, 'TargetId'] },
        }
      }
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

    this.log.notice('AgentCore Resources Deployed:')

    for (const [name, config] of Object.entries(agents)) {
      const type = config.type.charAt(0).toUpperCase() + config.type.slice(1)
      this.log.notice(`  ${name} (${type})`)
    }
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

    for (const [name, config] of Object.entries(agents)) {
      const type = config.type.charAt(0).toUpperCase() + config.type.slice(1)
      this.log.notice(`  ${name}:`)
      this.log.notice(`    Type: ${type}`)

      if (config.description) {
        this.log.notice(`    Description: ${config.description}`)
      }

      if (this.options.verbose) {
        this.log.notice(`    Config: ${JSON.stringify(config, null, 2)}`)
      }

      this.log.notice('')
    }
  }

  /**
   * Get the runtime ARN for an agent from CloudFormation stack outputs
   */
  async getRuntimeArn(agentName) {
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

      // Look for the runtime ARN output
      const logicalId = getLogicalId(agentName, 'Runtime')
      const outputKey = `${logicalId}Arn`

      const output = stack.Outputs?.find((o) => o.OutputKey === outputKey)
      if (!output) {
        throw new Error(`Runtime ARN output not found for agent '${agentName}'`)
      }

      return output.OutputValue
    } catch (error) {
      throw new this.serverless.classes.Error(
        `Failed to get runtime ARN: ${error.message}`,
      )
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
      if (config.type === 'runtime') {
        return name
      }
    }

    return null
  }

  /**
   * Invoke a deployed AgentCore runtime agent
   */
  async invokeAgent() {
    const { spawnSync } = await import('child_process')
    const crypto = await import('crypto')
    const fs = await import('fs')
    const os = await import('os')
    const path = await import('path')

    // Determine which agent to invoke
    let agentName = this.options.agent
    if (!agentName) {
      agentName = this.getFirstRuntimeAgent()
      if (!agentName) {
        throw new this.serverless.classes.Error(
          'No runtime agents found in configuration',
        )
      }
    }

    const message = this.options.message
    if (!message) {
      throw new this.serverless.classes.Error(
        'Message is required. Use --message or -m to specify',
      )
    }

    this.log.info(`Invoking agent: ${agentName}`)

    // Get the runtime ARN from stack outputs
    const runtimeArn = await this.getRuntimeArn(agentName)
    const region = this.provider.getRegion()

    // Generate or use provided session ID (must be at least 33 characters)
    const sessionId =
      this.options.session || `session-${Date.now()}-${crypto.randomUUID()}`

    // Create the payload and base64 encode it (required by AWS CLI)
    const payload = JSON.stringify({
      prompt: message,
    })
    const payloadBase64 = Buffer.from(payload).toString('base64')

    const outputFile = path.join(
      os.tmpdir(),
      `agentcore-response-${Date.now()}.bin`,
    )

    try {
      this.log.info(`Session ID: ${sessionId}`)
      this.log.info('Sending request...')
      this.log.notice('')

      // Use spawnSync with array arguments to avoid shell injection
      const args = [
        'bedrock-agentcore',
        'invoke-agent-runtime',
        '--agent-runtime-arn',
        runtimeArn,
        '--payload',
        payloadBase64,
        '--content-type',
        'application/json',
        '--accept',
        'application/json',
        '--runtime-session-id',
        sessionId,
        '--region',
        region,
        outputFile,
      ]

      const result = spawnSync('aws', args, { stdio: 'inherit' })

      if (result.error) {
        throw result.error
      }
      if (result.status !== 0) {
        throw new Error(`AWS CLI exited with code ${result.status}`)
      }

      // Read and display the response
      if (fs.existsSync(outputFile)) {
        const response = fs.readFileSync(outputFile, 'utf-8')
        this.log.notice('Response:')
        this.log.notice('─'.repeat(50))

        try {
          // Try to parse and pretty print JSON
          const parsed = JSON.parse(response)
          this.log.notice(JSON.stringify(parsed, null, 2))
        } catch {
          // If not JSON, print raw
          this.log.notice(response)
        }

        this.log.notice('─'.repeat(50))
      }
    } finally {
      // Cleanup temp files
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile)
      }
    }
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
}

export default ServerlessBedrockAgentCore
