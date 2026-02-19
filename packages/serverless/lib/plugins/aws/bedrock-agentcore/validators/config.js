'use strict'

/**
 * Runtime configuration validators for AgentCore resources.
 *
 * These validators perform semantic validation on the configuration
 * (e.g., checking if referenced resources exist, validating business rules).
 * This is different from schema.js which defines JSON Schema for YAML syntax validation.
 *
 * All validator functions receive a `throwError` function as their last parameter
 * to throw errors in the Serverless Framework format.
 */

import { detectTargetType } from '../compilers/gatewayTarget.js'

// Reserved keys at agents level (not treated as runtime agent definitions)
const RESERVED_AGENT_KEYS = [
  'memory',
  'tools',
  'gateways',
  'browsers',
  'codeInterpreters',
]

/**
 * Validate gateway configuration
 *
 * @param {string} gatewayName - Gateway name
 * @param {object} gatewayConfig - Gateway configuration
 * @param {object} sharedTools - Available shared tools for reference validation
 * @param {function} throwError - Function to throw formatted errors
 */
export function validateGatewayConfig(
  gatewayName,
  gatewayConfig,
  sharedTools,
  throwError,
) {
  // Validate tools references
  if (gatewayConfig.tools) {
    if (!Array.isArray(gatewayConfig.tools)) {
      throwError(
        `Gateway '${gatewayName}' tools must be an array of tool names`,
      )
    }

    for (const toolName of gatewayConfig.tools) {
      if (typeof toolName !== 'string') {
        throwError(
          `Gateway '${gatewayName}' tool reference must be a string, got ${typeof toolName}`,
        )
      }
      if (!sharedTools[toolName]) {
        throwError(
          `Gateway '${gatewayName}' references undefined tool '${toolName}'. Define it in ai.tools first.`,
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
        throwError(
          `Gateway '${gatewayName}' has invalid authorizer type '${authorizer}'. Valid types: ${validTypes.join(', ')}`,
        )
      }
      if (normalizedType === 'CUSTOM_JWT') {
        throwError(
          `Gateway '${gatewayName}' with CUSTOM_JWT authorizer requires jwt configuration. Use object form: authorizer: { type: 'custom_jwt', jwt: { discoveryUrl: '...' } }`,
        )
      }
    } else if (typeof authorizer === 'object') {
      const normalizedType = authorizer.type?.toUpperCase()
      if (!normalizedType || !validTypes.includes(normalizedType)) {
        throwError(
          `Gateway '${gatewayName}' has invalid authorizer.type. Valid types: ${validTypes.join(', ')}`,
        )
      }
      // Validate JWT config is present when type is CUSTOM_JWT
      if (normalizedType === 'CUSTOM_JWT' && !authorizer.jwt) {
        throwError(
          `Gateway '${gatewayName}' with CUSTOM_JWT authorizer requires jwt configuration`,
        )
      }
      if (authorizer.jwt && !authorizer.jwt.discoveryUrl) {
        throwError(
          `Gateway '${gatewayName}' jwt configuration requires discoveryUrl`,
        )
      }
    }
  }
}

/**
 * Validate runtime agent configuration
 *
 * @param {string} name - Runtime name
 * @param {object} config - Runtime configuration
 * @param {object} sharedMemory - Available shared memory definitions
 * @param {object} sharedGateways - Available gateways
 * @param {function} throwError - Function to throw formatted errors
 * @param {function} validateMemory - Function to validate memory config (for inline memory)
 */
export function validateRuntime(
  name,
  config,
  sharedMemory,
  sharedGateways,
  throwError,
  validateMemory,
) {
  // Check deployment type: code (handler) or container (artifact.image)
  const hasHandler = config.handler !== undefined
  const hasArtifactImage = config.artifact?.image !== undefined

  // Mutual exclusivity: cannot have both handler and artifact.image
  if (hasHandler && hasArtifactImage) {
    throwError(
      `Runtime '${name}' cannot specify both 'handler' and 'artifact.image'. Use 'handler' for code deployment or 'artifact.image' for container deployment.`,
    )
  }

  // If no handler and no artifact.image specified, buildpacks auto-detection will be used
  // This is valid - DockerClient will build using buildpacks from the service directory

  // Validate artifact.s3 requires handler (code deployment)
  if (config.artifact?.s3 && !hasHandler && !hasArtifactImage) {
    throwError(
      `Runtime '${name}' with 'artifact.s3' requires 'handler' to be specified for code deployment.`,
    )
  }

  // Validate artifact.s3 requires both bucket and key
  if (config.artifact?.s3) {
    if (!config.artifact.s3.bucket) {
      throwError(
        `Runtime '${name}' artifact.s3 requires 'bucket' to be specified.`,
      )
    }
    if (!config.artifact.s3.key) {
      throwError(
        `Runtime '${name}' artifact.s3 requires 'key' to be specified.`,
      )
    }
  }

  // Validate requestHeaders configuration
  if (config.requestHeaders) {
    if (config.requestHeaders.allowlist) {
      if (!Array.isArray(config.requestHeaders.allowlist)) {
        throwError(
          `Runtime '${name}' requestHeaders.allowlist must be an array of header names`,
        )
      }
      if (config.requestHeaders.allowlist.length > 20) {
        throwError(
          `Runtime '${name}' requestHeaders.allowlist cannot exceed 20 headers (got ${config.requestHeaders.allowlist.length})`,
        )
      }
      // Validate each header is a non-empty string
      for (const header of config.requestHeaders.allowlist) {
        if (typeof header !== 'string' || header.trim().length === 0) {
          throwError(
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
        throwError(
          `Runtime '${name}' references memory '${config.memory}' which is not defined in ai.memory`,
        )
      }
    } else if (typeof config.memory === 'object') {
      // Inline memory configuration - validate the config
      validateMemory(`${name}-memory`, config.memory, throwError)
    } else {
      throwError(
        `Runtime '${name}' memory must be either a string (reference to shared memory) or an object (inline memory config)`,
      )
    }
  }

  // Validate network mode: Runtime only supports PUBLIC and VPC (not SANDBOX)
  const validModes = ['PUBLIC', 'VPC']
  const networkMode = config.network?.mode?.toUpperCase()
  if (networkMode && !validModes.includes(networkMode)) {
    throwError(
      `Runtime '${name}' has invalid network.mode '${config.network.mode}'. Valid modes: ${validModes.join(', ')}`,
    )
  }

  if (networkMode === 'VPC') {
    if (!config.network.subnets || config.network.subnets.length === 0) {
      throwError(`Runtime '${name}' requires network.subnets when mode is VPC`)
    }
  }

  // Validate gateway configuration if present
  if (config.gateway) {
    if (typeof config.gateway !== 'string') {
      throwError(
        `Runtime '${name}' gateway must be a string reference to a gateway defined in ai.gateways`,
      )
    }
    // Only validate gateway reference if gateways are defined
    // If no gateways are defined but gateway property is set, that's an error
    if (Object.keys(sharedGateways).length === 0) {
      throwError(
        `Runtime '${name}' references gateway '${config.gateway}' but no gateways are defined in ai.gateways`,
      )
    }
    if (!sharedGateways[config.gateway]) {
      throwError(
        `Runtime '${name}' references undefined gateway '${config.gateway}'. Available gateways: ${Object.keys(sharedGateways).join(', ')}`,
      )
    }
  }
}

/**
 * Validate tool configuration
 *
 * @param {string} name - Tool name (for error messages)
 * @param {object} config - Tool configuration
 * @param {function} throwError - Function to throw formatted errors
 */
export function validateToolConfig(name, config, throwError) {
  // Detect tool type
  let toolType
  try {
    toolType = detectTargetType(config)
  } catch {
    throwError(
      `Tool '${name}' must have one of: function, openapi, smithy, or mcp`,
    )
  }

  // Validate function tools require toolSchema
  if (toolType === 'function' && !config.toolSchema) {
    throwError(`Tool '${name}' with function type requires toolSchema`)
  }

  // Validate MCP server URL pattern
  if (toolType === 'mcp') {
    const endpoint = config.mcp
    if (!endpoint || !endpoint.startsWith('https://')) {
      throwError(`Tool '${name}' mcp endpoint must be a valid https:// URL`)
    }
  }

  // Validate credentials if present
  if (config.credentials) {
    const validTypes = ['GATEWAY_IAM_ROLE', 'OAUTH', 'API_KEY']
    const normalizedType = config.credentials.type?.toUpperCase()
    if (normalizedType && !validTypes.includes(normalizedType)) {
      throwError(
        `Tool '${name}' credentials.type must be one of: ${validTypes.join(', ')}`,
      )
    }

    if (normalizedType === 'OAUTH') {
      if (!config.credentials.provider || !config.credentials.scopes) {
        throwError(
          `Tool '${name}' OAUTH credentials require provider and scopes`,
        )
      }
    }

    if (normalizedType === 'API_KEY') {
      if (!config.credentials.provider) {
        throwError(`Tool '${name}' API_KEY credentials require provider`)
      }
    }
  }
}

/**
 * Validate memory configuration (used for both inline and shared memory definitions)
 *
 * @param {string} name - Memory name (for error messages)
 * @param {object} config - Memory configuration
 * @param {function} throwError - Function to throw formatted errors
 */
export function validateMemoryConfig(name, config, throwError) {
  // Validate expiration (maps to EventExpiryDuration)
  // CFN schema: minimum 3, maximum 365 days
  if (config.expiration !== undefined) {
    const duration = config.expiration
    if (typeof duration !== 'number' || duration < 3 || duration > 365) {
      throwError(
        `Memory '${name}' expiration must be a number between 3 and 365 days`,
      )
    }
  }

  // Validate encryptionKey if present
  if (config.encryptionKey !== undefined) {
    if (typeof config.encryptionKey !== 'string') {
      throwError(`Memory '${name}' encryptionKey must be a string (ARN)`)
    }
  }

  // Validate strategies if present
  if (config.strategies !== undefined) {
    if (!Array.isArray(config.strategies)) {
      throwError(`Memory '${name}' strategies must be an array`)
    }
  }
}

/**
 * Validate browser configuration
 *
 * @param {string} name - Browser name
 * @param {object} config - Browser configuration
 * @param {function} throwError - Function to throw formatted errors
 */
export function validateBrowser(name, config, throwError) {
  const validModes = ['PUBLIC', 'VPC']
  const networkMode = config.network?.mode?.toUpperCase()
  if (networkMode && !validModes.includes(networkMode)) {
    throwError(
      `Browser '${name}' has invalid network.mode '${config.network.mode}'. Valid modes: ${validModes.join(', ')}`,
    )
  }

  if (networkMode === 'VPC') {
    if (!config.network.subnets || config.network.subnets.length === 0) {
      throwError(`Browser '${name}' requires network.subnets when mode is VPC`)
    }
  }

  // Validate recording configuration
  if (config.recording) {
    if (config.recording.s3Location) {
      if (!config.recording.s3Location.bucket) {
        throwError(
          `Browser '${name}' recording.s3Location must have a 'bucket' property`,
        )
      }
      if (!config.recording.s3Location.prefix) {
        throwError(
          `Browser '${name}' recording.s3Location must have a 'prefix' property`,
        )
      }
    }
  }
}

/**
 * Validate code interpreter configuration
 *
 * @param {string} name - CodeInterpreter name
 * @param {object} config - CodeInterpreter configuration
 * @param {function} throwError - Function to throw formatted errors
 */
export function validateCodeInterpreter(name, config, throwError) {
  const validModes = ['PUBLIC', 'SANDBOX', 'VPC']
  const networkMode = config.network?.mode?.toUpperCase()
  if (networkMode && !validModes.includes(networkMode)) {
    throwError(
      `CodeInterpreter '${name}' has invalid network.mode '${config.network.mode}'. Valid modes: ${validModes.join(', ')}`,
    )
  }

  // Validate VPC configuration when VPC mode is specified
  if (networkMode === 'VPC') {
    if (!config.network.subnets || config.network.subnets.length === 0) {
      throwError(
        `CodeInterpreter '${name}' requires network.subnets when mode is VPC`,
      )
    }
  }
}

/**
 * Check if a key is a reserved agent key (not a runtime agent)
 *
 * @param {string} key - Key to check
 * @returns {boolean} True if key is reserved
 */
export function isReservedAgentKey(key) {
  return RESERVED_AGENT_KEYS.includes(key)
}

/**
 * Get list of reserved agent keys
 *
 * @returns {string[]} Array of reserved keys
 */
export function getReservedAgentKeys() {
  return [...RESERVED_AGENT_KEYS]
}
