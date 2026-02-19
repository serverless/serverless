'use strict'

import fs from 'fs'
import path from 'path'
import { getGatewayTargetName } from '../utils/naming.js'

/**
 * AWS::BedrockAgentCore::GatewayTarget CloudFormation Schema
 *
 * Required Properties:
 *   - Name: string, pattern: ([0-9a-zA-Z][-]?){1,100}
 *   - CredentialProviderConfigurations: array (minItems: 1, maxItems: 1)
 *     - CredentialProviderType: enum GATEWAY_IAM_ROLE|OAUTH|API_KEY
 *     - CredentialProvider?: oneOf { OauthCredentialProvider, ApiKeyCredentialProvider }
 *   - TargetConfiguration: oneOf { Mcp }
 *     - Mcp: oneOf { OpenApiSchema, SmithyModel, Lambda, McpServer }
 *
 * Tool Types (new simplified syntax):
 *   - function: -> Mcp.Lambda (requires toolSchema)
 *   - openapi: -> Mcp.OpenApiSchema
 *   - smithy: -> Mcp.SmithyModel
 *   - mcp: -> Mcp.McpServer
 */

/**
 * Detect target type from tool configuration keys
 * @param {object} config - Tool configuration
 * @returns {string} Target type: 'function' | 'openapi' | 'smithy' | 'mcp'
 */
export function detectTargetType(config) {
  if (config.function) return 'function'
  if (config.openapi) return 'openapi'
  if (config.smithy) return 'smithy'
  if (config.mcp) return 'mcp'
  throw new Error(
    'Tool configuration must have one of: function, openapi, smithy, or mcp',
  )
}

/**
 * Check if a string value looks like a file path
 * @param {string} value - String to check
 * @returns {boolean} True if value appears to be a file path
 */
export function isFilePath(value) {
  if (!value || typeof value !== 'string') return false
  if (/^https?:\/\//i.test(value)) return false
  return (
    value.startsWith('.') ||
    value.startsWith('/') ||
    value.endsWith('.yml') ||
    value.endsWith('.yaml') ||
    value.endsWith('.json') ||
    value.endsWith('.smithy')
  )
}

/**
 * Read file contents for inline payload
 * @param {string} filePath - Path to file (relative to serviceDir)
 * @param {string} serviceDir - Service directory path
 * @returns {string} File contents
 */
export function readFileContents(filePath, serviceDir) {
  const absolutePath = path.resolve(serviceDir, filePath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Tool schema/spec file not found: ${filePath}`)
  }
  return fs.readFileSync(absolutePath, 'utf-8')
}

/**
 * Build credential provider configuration for the gateway target
 * New simplified structure:
 *   credentials: { type: OAUTH, provider, scopes, ... }
 *
 * Property mapping:
 *   - provider -> ProviderArn (Token Vault ARN)
 *   - location -> CredentialLocation
 *   - parameterName -> CredentialParameterName
 *   - prefix -> CredentialPrefix
 *   - grantType -> GrantType
 */
export function buildCredentialProviderConfigurations(credentials) {
  if (!credentials) {
    return [{ CredentialProviderType: 'GATEWAY_IAM_ROLE' }]
  }

  // Normalize type to uppercase
  const credentialType = (credentials.type || 'GATEWAY_IAM_ROLE').toUpperCase()

  const config = {
    CredentialProviderType: credentialType,
  }

  if (credentialType === 'OAUTH') {
    if (!credentials.provider || !credentials.scopes) {
      throw new Error('OAUTH credentials require provider and scopes')
    }
    // Normalize grantType to uppercase
    const grantType = credentials.grantType?.toUpperCase()
    config.CredentialProvider = {
      OauthCredentialProvider: {
        ProviderArn: credentials.provider,
        Scopes: credentials.scopes,
        ...(grantType && { GrantType: grantType }),
        ...(credentials.defaultReturnUrl && {
          DefaultReturnUrl: credentials.defaultReturnUrl,
        }),
        ...(credentials.customParameters && {
          CustomParameters: credentials.customParameters,
        }),
      },
    }
  }

  if (credentialType === 'API_KEY') {
    if (!credentials.provider) {
      throw new Error('API_KEY credentials require provider')
    }
    // Normalize location to uppercase
    const location = credentials.location?.toUpperCase()
    config.CredentialProvider = {
      ApiKeyCredentialProvider: {
        ProviderArn: credentials.provider,
        ...(location && {
          CredentialLocation: location,
        }),
        ...(credentials.parameterName && {
          CredentialParameterName: credentials.parameterName,
        }),
        ...(credentials.prefix && {
          CredentialPrefix: credentials.prefix,
        }),
      },
    }
  }

  return [config]
}

/**
 * Transform JSON Schema to CloudFormation SchemaDefinition
 * Input uses camelCase, output uses PascalCase for CloudFormation
 */
export function transformSchemaToCloudFormation(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema
  }

  const cfSchema = {}

  if (schema.type) {
    cfSchema.Type = schema.type
  }

  if (schema.description) {
    cfSchema.Description = schema.description
  }

  if (schema.properties) {
    cfSchema.Properties = {}
    for (const [key, value] of Object.entries(schema.properties)) {
      cfSchema.Properties[key] = transformSchemaToCloudFormation(value)
    }
  }

  if (schema.required) {
    cfSchema.Required = schema.required
  }

  if (schema.items) {
    cfSchema.Items = transformSchemaToCloudFormation(schema.items)
  }

  if (schema.enum) {
    cfSchema.Enum = schema.enum
  }

  return cfSchema
}

/**
 * Resolve function reference to Lambda ARN
 * @param {string|object} functionRef - Function name or { name, arn } object
 * @returns {string|object} Lambda ARN or Fn::GetAtt reference
 */
export function resolveFunctionArn(functionRef) {
  // Direct ARN
  if (typeof functionRef === 'object' && functionRef.arn) {
    return functionRef.arn
  }

  // Function name (string or object.name)
  const functionName =
    typeof functionRef === 'string' ? functionRef : functionRef.name

  if (!functionName) {
    throw new Error('Function tool requires function name or ARN')
  }

  // Convert function name to Serverless Framework logical ID
  // Following Serverless Framework naming convention:
  // 1. Replace dashes with 'Dash' and underscores with 'Underscore'
  // 2. Uppercase only the first character (preserves camelCase)
  // e.g., 'hello' -> 'HelloLambdaFunction'
  //       'my-function' -> 'MyDashfunctionLambdaFunction'
  //       'timeApi' -> 'TimeApiLambdaFunction'
  const normalizedName = functionName
    .replace(/-/g, 'Dash')
    .replace(/_/g, 'Underscore')
  const functionLogicalId =
    normalizedName.charAt(0).toUpperCase() +
    normalizedName.slice(1) +
    'LambdaFunction'

  return { 'Fn::GetAtt': [functionLogicalId, 'Arn'] }
}

/**
 * Resolve tool schema from file path or inline array
 * @param {string|array} toolSchema - File path or inline tool definitions
 * @param {string} serviceDir - Service directory path
 * @returns {object} CFN ToolSchema object
 */
export function resolveToolSchema(toolSchema, serviceDir) {
  if (!toolSchema) {
    throw new Error('Function tool requires toolSchema')
  }

  // File path reference
  if (typeof toolSchema === 'string') {
    const contents = readFileContents(toolSchema, serviceDir)
    // Parse JSON file contents
    let parsed
    try {
      parsed = JSON.parse(contents)
    } catch {
      throw new Error(`Failed to parse toolSchema file as JSON: ${toolSchema}`)
    }
    // Ensure it's an array
    const tools = Array.isArray(parsed) ? parsed : [parsed]
    return {
      InlinePayload: tools.map((tool) => ({
        Name: tool.name,
        Description: tool.description,
        InputSchema: transformSchemaToCloudFormation(tool.inputSchema),
        ...(tool.outputSchema && {
          OutputSchema: transformSchemaToCloudFormation(tool.outputSchema),
        }),
      })),
    }
  }

  // Inline array
  if (Array.isArray(toolSchema)) {
    return {
      InlinePayload: toolSchema.map((tool) => ({
        Name: tool.name,
        Description: tool.description,
        InputSchema: transformSchemaToCloudFormation(tool.inputSchema),
        ...(tool.outputSchema && {
          OutputSchema: transformSchemaToCloudFormation(tool.outputSchema),
        }),
      })),
    }
  }

  throw new Error(
    'toolSchema must be a file path string or array of tool definitions',
  )
}

/**
 * Build Lambda target configuration
 * New syntax: { function: 'functionName' | { name, arn }, toolSchema: [...] | 'file.json' }
 */
export function buildLambdaTarget(config, serviceDir) {
  const lambdaArn = resolveFunctionArn(config.function)
  const toolSchema = resolveToolSchema(config.toolSchema, serviceDir)

  return {
    Mcp: {
      Lambda: {
        LambdaArn: lambdaArn,
        ToolSchema: toolSchema,
      },
    },
  }
}

/**
 * Build OpenAPI target configuration
 * New syntax: { openapi: 'openapi.yml' | 'inline yaml/json string' }
 */
export function buildOpenApiTarget(config, serviceDir) {
  const openapiValue = config.openapi

  let inlinePayload
  if (isFilePath(openapiValue)) {
    inlinePayload = readFileContents(openapiValue, serviceDir)
  } else {
    inlinePayload = openapiValue
  }

  return {
    Mcp: {
      OpenApiSchema: {
        InlinePayload: inlinePayload,
      },
    },
  }
}

/**
 * Build Smithy target configuration
 * New syntax: { smithy: 'model.smithy' | 'inline smithy string' }
 */
export function buildSmithyTarget(config, serviceDir) {
  const smithyValue = config.smithy

  let inlinePayload
  if (isFilePath(smithyValue)) {
    inlinePayload = readFileContents(smithyValue, serviceDir)
  } else {
    inlinePayload = smithyValue
  }

  return {
    Mcp: {
      SmithyModel: {
        InlinePayload: inlinePayload,
      },
    },
  }
}

/**
 * Build MCP Server target configuration
 * New syntax: { mcp: 'https://...' }
 */
export function buildMcpServerTarget(config) {
  const endpoint = config.mcp

  if (!endpoint || !endpoint.startsWith('https://')) {
    throw new Error('MCP server endpoint must be a valid https:// URL')
  }

  return {
    Mcp: {
      McpServer: {
        Endpoint: endpoint,
      },
    },
  }
}

/**
 * Build target configuration based on detected type
 */
export function buildTargetConfiguration(config, serviceDir) {
  const targetType = detectTargetType(config)

  switch (targetType) {
    case 'function':
      return buildLambdaTarget(config, serviceDir)
    case 'openapi':
      return buildOpenApiTarget(config, serviceDir)
    case 'smithy':
      return buildSmithyTarget(config, serviceDir)
    case 'mcp':
      return buildMcpServerTarget(config)
    default:
      throw new Error(`Unknown tool type: ${targetType}`)
  }
}

/**
 * Compile a GatewayTarget resource to CloudFormation
 * @param {string} toolName - Tool name
 * @param {object} config - Tool configuration
 * @param {string} gatewayLogicalId - Gateway logical ID for reference
 * @param {string} serviceDir - Service directory path
 * @returns {object} CloudFormation resource
 */
export function compileGatewayTarget(
  toolName,
  config,
  gatewayLogicalId,
  serviceDir,
) {
  const resourceName = getGatewayTargetName(toolName)

  const credentialConfigs = buildCredentialProviderConfigurations(
    config.credentials,
  )
  const targetConfig = buildTargetConfiguration(config, serviceDir)

  return {
    Type: 'AWS::BedrockAgentCore::GatewayTarget',
    DependsOn: [gatewayLogicalId],
    Properties: {
      Name: resourceName,
      GatewayIdentifier: {
        'Fn::GetAtt': [gatewayLogicalId, 'GatewayIdentifier'],
      },
      CredentialProviderConfigurations: credentialConfigs,
      TargetConfiguration: targetConfig,
      ...(config.description && { Description: config.description }),
    },
  }
}

// Legacy exports for backward compatibility (will be removed)
export {
  buildLambdaTarget as buildLambdaTargetConfiguration,
  buildOpenApiTarget as buildOpenApiTargetConfiguration,
  buildSmithyTarget as buildSmithyTargetConfiguration,
}
