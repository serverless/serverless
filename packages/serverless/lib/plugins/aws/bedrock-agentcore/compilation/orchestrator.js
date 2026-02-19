'use strict'

/**
 * AgentCore compilation orchestrator
 *
 * Coordinates the compilation of all AgentCore resources into CloudFormation.
 * Handles gateways, tools, memories, runtimes, browsers, and code interpreters.
 */

import { compileRuntime } from '../compilers/runtime.js'
import { compileRuntimeEndpoint } from '../compilers/runtimeEndpoint.js'
import { compileMemory } from '../compilers/memory.js'
import { compileGateway } from '../compilers/gateway.js'
import {
  compileGatewayTarget,
  detectTargetType,
} from '../compilers/gatewayTarget.js'
import { compileBrowser } from '../compilers/browser.js'
import { compileCodeInterpreter } from '../compilers/codeInterpreter.js'
import {
  generateRuntimeRole,
  generateMemoryRole,
  generateGatewayRole,
  generateBrowserRole,
  generateCodeInterpreterRole,
  shouldGenerateRole,
} from '../iam/policies.js'
import {
  getLogicalId,
  getGatewayLogicalId,
  pascalCase,
} from '../utils/naming.js'
import { mergeTags } from '../utils/tags.js'
import { normalizeRuntime } from '../utils/runtime.js'
/**
 * Compile all AgentCore resources to CloudFormation
 *
 * @param {object} config - Configuration object
 * @param {object} config.aiConfig - AI configuration (ai: block from serverless.yml)
 * @param {object} config.context - Compilation context
 * @param {object} config.template - CloudFormation template
 * @param {object} config.builtImages - Map of runtime names to built Docker images
 * @param {string} config.serviceDir - Service directory path
 * @param {object} config.log - Logger instance
 * @param {object} config.resourcesCompiled - Mutable flag to track if resources were compiled
 * @returns {object} Compilation statistics
 */
export function compileAgentCoreResources(config) {
  const {
    aiConfig,
    context,
    template,
    builtImages,
    serviceDir,
    log,
    resourcesCompiled,
  } = config

  // Prevent running multiple times
  if (resourcesCompiled.value) {
    return null
  }

  if (!aiConfig || Object.keys(aiConfig).length === 0) {
    return null
  }

  resourcesCompiled.value = true

  if (!template) {
    resourcesCompiled.value = false
    return null
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
  const { sharedTools, hasTools, hasGateways } = collectAllTools(aiConfig)

  // Map of gateway names to their logical IDs (for agent gateway selection)
  const gatewayLogicalIds = {}

  // First pass: Compile gateways and tools
  if (hasGateways) {
    // Multi-gateway mode: compile each gateway and its tools
    const gateways = collectGateways(aiConfig)

    for (const [gatewayName, gatewayConfig] of Object.entries(gateways)) {
      // Detect if any tools use OAuth/API Key credential providers
      gatewayConfig.hasCredentialProviders = hasOAuthOrApiKeyTools(
        gatewayConfig.tools || [],
        sharedTools,
      )

      const gatewayLogicalId = compileNamedGateway(
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
          compileToolResource(
            toolName,
            toolConfig,
            gatewayLogicalId,
            context,
            template,
            serviceDir,
            gatewayName, // Include gateway name for unique logical ID
          )
          stats.tools++
        }
      }
    }
  } else if (hasTools) {
    // Default gateway mode (backwards compat): create single gateway with all tools
    const gatewayLogicalId = compileToolsGateway(context, template, sharedTools)
    gatewayLogicalIds['_default'] = gatewayLogicalId
    stats.gateway = 1

    // Compile all shared tools to the default gateway
    for (const [toolName, toolConfig] of Object.entries(sharedTools)) {
      compileToolResource(
        toolName,
        toolConfig,
        gatewayLogicalId,
        context,
        template,
        serviceDir,
      )
      stats.tools++
    }
  }

  // Second pass: Compile shared memory from ai.memory
  if (aiConfig.memory) {
    for (const [memoryName, memoryConfig] of Object.entries(aiConfig.memory)) {
      compileMemoryResources(memoryName, memoryConfig, context, template)
      stats.memory++
    }
  }

  // Third pass: Compile browsers from ai.browsers
  if (aiConfig.browsers) {
    for (const [browserName, browserConfig] of Object.entries(
      aiConfig.browsers,
    )) {
      compileBrowserResources(browserName, browserConfig, context, template)
      stats.browser++
    }
  }

  // Fourth pass: Compile codeInterpreters from ai.codeInterpreters
  if (aiConfig.codeInterpreters) {
    for (const [ciName, ciConfig] of Object.entries(
      aiConfig.codeInterpreters,
    )) {
      compileCodeInterpreterResources(ciName, ciConfig, context, template)
      stats.codeInterpreter++
    }
  }

  // Fifth pass: Compile runtime agents from ai.agents
  const agents = aiConfig.agents || {}
  for (const [name, runtimeConfig] of Object.entries(agents)) {
    // Determine which gateway (if any) this agent uses
    let agentGatewayLogicalId = null
    if (runtimeConfig.gateway && gatewayLogicalIds[runtimeConfig.gateway]) {
      // Agent explicitly specifies a gateway
      agentGatewayLogicalId = gatewayLogicalIds[runtimeConfig.gateway]
    } else if (!hasGateways && gatewayLogicalIds['_default']) {
      // No explicit gateway but default exists (backwards compat)
      agentGatewayLogicalId = gatewayLogicalIds['_default']
    }
    // If gateways exist but agent doesn't specify one, no gateway injection

    compileRuntimeResources(
      name,
      runtimeConfig,
      context,
      template,
      aiConfig.memory,
      agentGatewayLogicalId,
      builtImages,
    )
    stats.runtime++
    if (runtimeConfig.endpoints) {
      stats.endpoints += runtimeConfig.endpoints.length
    }
    // If runtime has inline memory, count it
    if (runtimeConfig.memory && typeof runtimeConfig.memory === 'object') {
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

  log.info(`Compiled AgentCore resources: ${resourceSummary.join(', ')}`)

  if (stats.endpoints > 0) {
    log.info(`  - ${stats.endpoints} runtime endpoint(s)`)
  }
  if (stats.tools > 0) {
    log.info(`  - ${stats.tools} tool(s)`)
  }

  return stats
}

/**
 * Collect all tools and gateway metadata
 *
 * @param {object} aiConfig - AI configuration (ai: block)
 * @returns {object} Object with sharedTools, hasTools, hasGateways
 */
export function collectAllTools(aiConfig) {
  const sharedTools = aiConfig.tools || {}
  const gateways = aiConfig.gateways || {}
  const hasGateways = Object.keys(gateways).length > 0
  const hasTools = Object.keys(sharedTools).length > 0

  return {
    sharedTools,
    hasTools,
    hasGateways,
  }
}

/**
 * Check if any tools in the given list use OAuth or API Key credential providers
 * Used to conditionally include Token Vault / Workload Identity / Secrets Manager
 * permissions in the gateway execution role.
 *
 * @param {string[]} toolNames - Array of tool names to check
 * @param {object} sharedTools - Map of tool names to their configs
 * @returns {boolean} True if any tool uses OAUTH or API_KEY credentials
 */
export function hasOAuthOrApiKeyTools(toolNames, sharedTools) {
  return toolNames.some((toolName) => {
    const tool = sharedTools[toolName]
    return (
      tool &&
      ['OAUTH', 'API_KEY'].includes(
        (tool.credentials?.type || '').toUpperCase(),
      )
    )
  })
}

/**
 * Collect gateway configurations with their tool assignments
 * Returns a map of gateway names to their configs (with normalized authorizer)
 *
 * @param {object} aiConfig - AI configuration (ai: block)
 * @returns {object} Map of gateway names to normalized configs
 */
export function collectGateways(aiConfig) {
  const gateways = aiConfig.gateways || {}
  const result = {}

  for (const [gatewayName, gatewayConfig] of Object.entries(gateways)) {
    result[gatewayName] = {
      ...gatewayConfig,
      tools: gatewayConfig.tools || [],
      // Normalize authorizer (string -> object form)
      authorizer: normalizeAuthorizer(gatewayConfig.authorizer),
    }
  }

  return result
}

/**
 * Normalize authorizer config from string shorthand to object form
 * Also normalizes case to uppercase for CFN compatibility
 *
 * @param {string|object} authorizer - 'AWS_IAM' or { type: 'CUSTOM_JWT', jwt: {...} }
 * @returns {object} - { type: 'AWS_IAM' } or { type: 'CUSTOM_JWT', jwt: {...} }
 */
export function normalizeAuthorizer(authorizer) {
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
 * Compile the auto-created default Gateway for tools (backwards compatibility)
 * Used when ai.tools exists but ai.gateways does not
 *
 * @param {object} context - Compilation context
 * @param {object} template - CloudFormation template
 * @param {object} sharedTools - Map of tool names to their configs (for credential detection)
 * @returns {string} Gateway logical ID
 */
export function compileToolsGateway(context, template, sharedTools = {}) {
  const gatewayConfig = {
    // Detect if any tools use OAuth/API Key credential providers
    hasCredentialProviders: hasOAuthOrApiKeyTools(
      Object.keys(sharedTools),
      sharedTools,
    ),
  }
  const logicalId = getGatewayLogicalId()
  const tags = mergeTags(context.defaultTags, gatewayConfig.tags)

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
 * Compile a named Gateway from ai.gateways
 *
 * @param {string} gatewayName - Gateway name from config
 * @param {object} gatewayConfig - Gateway configuration (with normalized authorizer)
 * @param {object} context - Compilation context
 * @param {object} template - CloudFormation template
 * @returns {string} Gateway logical ID
 */
export function compileNamedGateway(
  gatewayName,
  gatewayConfig,
  context,
  template,
) {
  const logicalId = getGatewayLogicalId(gatewayName)
  const tags = mergeTags(context.defaultTags, gatewayConfig.tags)

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
 *
 * @param {string} toolName - Tool name
 * @param {object} toolConfig - Tool configuration
 * @param {string} gatewayLogicalId - Gateway logical ID
 * @param {object} context - Compilation context
 * @param {object} template - CloudFormation template
 * @param {string} serviceDir - Service directory path
 * @param {string} [gatewayName] - Optional gateway name for unique logical ID (multi-gateway)
 */
export function compileToolResource(
  toolName,
  toolConfig,
  gatewayLogicalId,
  context,
  template,
  serviceDir,
  gatewayName,
) {
  // When same tool is in multiple gateways, include gateway name in logical ID
  const logicalId = gatewayName
    ? `${getLogicalId(toolName, 'Tool')}${pascalCase(gatewayName)}`
    : getLogicalId(toolName, 'Tool')

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
 *
 * @param {string} name - Runtime name
 * @param {object} config - Runtime configuration
 * @param {object} builtImages - Map of runtime names to built Docker images
 * @returns {string|null} Container image URI or null
 */
export function resolveContainerImage(name, config, builtImages) {
  const artifactImage = config.artifact?.image

  // If artifact.image is a string, resolve named ECR image references or use as direct URI
  if (typeof artifactImage === 'string') {
    return builtImages[artifactImage] || artifactImage
  }

  // If artifact.image is an object (build config), check if we built it
  if (typeof artifactImage === 'object' && artifactImage !== null) {
    if (builtImages[name]) {
      return builtImages[name]
    }
  }

  // Check for buildpacks-built image (no artifact config specified)
  // This handles the auto-detection case where buildpacks were used
  if (builtImages[name]) {
    return builtImages[name]
  }

  return null
}

/**
 * Compile Runtime and RuntimeEndpoint resources
 *
 * @param {string} name - Runtime name
 * @param {object} config - Runtime configuration
 * @param {object} context - Service context
 * @param {object} template - CloudFormation template
 * @param {object} [sharedMemories] - Shared memory definitions for reference resolution
 * @param {string} [gatewayLogicalId] - Gateway logical ID for env var injection (if agent has tools)
 * @param {object} builtImages - Map of runtime names to built Docker images
 */
export function compileRuntimeResources(
  name,
  config,
  context,
  template,
  sharedMemories = {},
  gatewayLogicalId = null,
  builtImages = {},
) {
  const logicalId = getLogicalId(name, 'Runtime')
  const tags = mergeTags(context.defaultTags, config.tags)

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
      compileMemoryResources(
        inlineMemoryName,
        config.memory,
        context,
        template,
        name,
      )
    }
  }

  // Resolve container image
  const containerImage = resolveContainerImage(name, config, builtImages)

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
      // Normalize runtime to artifact.runtime for compiler (maps e.g. python3.12 → PYTHON_3_12)
      ...(config.runtime && { runtime: normalizeRuntime(config.runtime) }),
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
 *
 * @param {string} name - Memory name
 * @param {object} config - Memory configuration (supports user-friendly property names)
 * @param {object} context - Service context
 * @param {object} template - CloudFormation template
 * @param {string} [parentRuntimeName] - If memory is inline on a runtime, the runtime name
 */
export function compileMemoryResources(
  name,
  config,
  context,
  template,
  parentRuntimeName,
) {
  const logicalId = getLogicalId(name, 'Memory')
  const tags = mergeTags(context.defaultTags, config.tags)

  // Generate IAM role if not provided or if role is a customization object
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
 *
 * @param {string} name - Browser name
 * @param {object} config - Browser configuration
 * @param {object} context - Service context
 * @param {object} template - CloudFormation template
 */
export function compileBrowserResources(name, config, context, template) {
  const logicalId = getLogicalId(name, 'Browser')
  const tags = mergeTags(context.defaultTags, config.tags)

  // Generate IAM role if not provided or if role is a customization object
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
 *
 * @param {string} name - CodeInterpreter name
 * @param {object} config - CodeInterpreter configuration
 * @param {object} context - Service context
 * @param {object} template - CloudFormation template
 */
export function compileCodeInterpreterResources(
  name,
  config,
  context,
  template,
) {
  const logicalId = getLogicalId(name, 'CodeInterpreter')
  const tags = mergeTags(context.defaultTags, config.tags)

  // Generate IAM role if not provided or if role is a customization object
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
