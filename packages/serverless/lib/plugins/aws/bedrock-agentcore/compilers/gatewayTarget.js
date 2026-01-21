'use strict'

/**
 * AWS::BedrockAgentCore::GatewayTarget CloudFormation Schema
 *
 * Required Properties:
 *   - Name: string, pattern: ([0-9a-zA-Z][-]?){1,100}
 *   - CredentialProviderConfigurations: array (minItems: 1, maxItems: 1)
 *     - CredentialProviderType: enum GATEWAY_IAM_ROLE|OAUTH|API_KEY
 *     - CredentialProvider?: oneOf { OauthCredentialProvider, ApiKeyCredentialProvider }
 *       - OauthCredentialProvider: { ProviderArn (required), Scopes (required), GrantType?,
 *           DefaultReturnUrl?, CustomParameters? }
 *       - ApiKeyCredentialProvider: { ProviderArn (required), CredentialParameterName?,
 *           CredentialPrefix?, CredentialLocation?: HEADER|QUERY_PARAMETER }
 *   - TargetConfiguration: oneOf { Mcp }
 *     - Mcp: oneOf { OpenApiSchema, SmithyModel, Lambda, McpServer }
 *       - Lambda: { LambdaArn (required), ToolSchema (required): { S3 | InlinePayload } }
 *       - OpenApiSchema/SmithyModel: { S3?: { Uri, BucketOwnerAccountId? }, InlinePayload?: string }
 *       - McpServer: { Endpoint: string (https://*) }
 *
 * Optional Properties:
 *   - GatewayIdentifier: string (create-only)
 *   - Description: string, maxLength: 200
 *   - MetadataConfiguration: { AllowedRequestHeaders?, AllowedQueryParameters?, AllowedResponseHeaders? }
 *
 * Read-Only Properties:
 *   - CreatedAt, GatewayArn, LastSynchronizedAt, Status, StatusReasons, TargetId, UpdatedAt
 *
 * ToolDefinition (for Lambda InlinePayload):
 *   - Name (required), Description (required), InputSchema (required), OutputSchema?
 *
 * SchemaDefinition:
 *   - Type: string|number|object|array|boolean|integer (required)
 *   - Properties?, Required?, Items?, Description?
 */

import { getGatewayTargetName } from '../utils/naming.js'

/**
 * Build credential provider configuration for the gateway target
 * Structure: CredentialProviderConfiguration contains:
 * - CredentialProviderType: GATEWAY_IAM_ROLE | OAUTH | API_KEY
 * - CredentialProvider (optional): contains ApiKeyCredentialProvider or OauthCredentialProvider
 */
export function buildCredentialProviderConfigurations(credProvider) {
  if (!credProvider) {
    return [
      {
        CredentialProviderType: 'GATEWAY_IAM_ROLE',
      },
    ]
  }

  const config = {
    CredentialProviderType: credProvider.type || 'GATEWAY_IAM_ROLE',
  }

  if (credProvider.type === 'OAUTH' && credProvider.oauthConfig) {
    config.CredentialProvider = {
      OauthCredentialProvider: {
        ProviderArn: credProvider.oauthConfig.providerArn,
        Scopes: credProvider.oauthConfig.scopes,
        ...(credProvider.oauthConfig.grantType && {
          GrantType: credProvider.oauthConfig.grantType,
        }),
        ...(credProvider.oauthConfig.defaultReturnUrl && {
          DefaultReturnUrl: credProvider.oauthConfig.defaultReturnUrl,
        }),
        ...(credProvider.oauthConfig.customParameters && {
          CustomParameters: credProvider.oauthConfig.customParameters,
        }),
      },
    }
  }

  if (credProvider.type === 'API_KEY' && credProvider.apiKeyConfig) {
    config.CredentialProvider = {
      ApiKeyCredentialProvider: {
        ProviderArn: credProvider.apiKeyConfig.providerArn,
        ...(credProvider.apiKeyConfig.credentialLocation && {
          CredentialLocation: credProvider.apiKeyConfig.credentialLocation,
        }),
        ...(credProvider.apiKeyConfig.credentialParameterName && {
          CredentialParameterName:
            credProvider.apiKeyConfig.credentialParameterName,
        }),
        ...(credProvider.apiKeyConfig.credentialPrefix && {
          CredentialPrefix: credProvider.apiKeyConfig.credentialPrefix,
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
 * Build Lambda target configuration
 */
export function buildLambdaTargetConfiguration(target, _context) {
  let functionArn = target.functionArn

  if (target.functionName && !functionArn) {
    const functionLogicalId =
      target.functionName
        .split(/[-_]/)
        .map(
          (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
        )
        .join('') + 'LambdaFunction'

    functionArn = { 'Fn::GetAtt': [functionLogicalId, 'Arn'] }
  }

  const lambdaConfig = {
    LambdaArn: functionArn,
  }

  if (target.toolSchema) {
    const toolSchema = {}

    if (target.toolSchema.inlinePayload) {
      toolSchema.InlinePayload = target.toolSchema.inlinePayload.map(
        (tool) => ({
          Name: tool.name,
          Description: tool.description,
          InputSchema: transformSchemaToCloudFormation(tool.inputSchema),
          ...(tool.outputSchema && {
            OutputSchema: transformSchemaToCloudFormation(tool.outputSchema),
          }),
        }),
      )
    }

    if (target.toolSchema.s3) {
      toolSchema.S3 = {
        Uri:
          target.toolSchema.s3.uri ||
          `s3://${target.toolSchema.s3.bucket}/${target.toolSchema.s3.key}`,
        ...(target.toolSchema.s3.bucketOwnerAccountId && {
          BucketOwnerAccountId: target.toolSchema.s3.bucketOwnerAccountId,
        }),
      }
    }

    lambdaConfig.ToolSchema = toolSchema
  }

  return {
    Mcp: {
      Lambda: lambdaConfig,
    },
  }
}

/**
 * Build OpenAPI target configuration
 */
export function buildOpenApiTargetConfiguration(target) {
  const openApiConfig = {}

  if (target.s3) {
    openApiConfig.S3 = {
      Uri: target.s3.uri || `s3://${target.s3.bucket}/${target.s3.key}`,
      ...(target.s3.bucketOwnerAccountId && {
        BucketOwnerAccountId: target.s3.bucketOwnerAccountId,
      }),
    }
  }

  if (target.inlinePayload) {
    openApiConfig.InlinePayload = target.inlinePayload
  }

  return {
    Mcp: {
      OpenApiSchema: openApiConfig,
    },
  }
}

/**
 * Build Smithy target configuration
 */
export function buildSmithyTargetConfiguration(target) {
  const smithyConfig = {}

  if (target.s3) {
    smithyConfig.S3 = {
      Uri: target.s3.uri || `s3://${target.s3.bucket}/${target.s3.key}`,
      ...(target.s3.bucketOwnerAccountId && {
        BucketOwnerAccountId: target.s3.bucketOwnerAccountId,
      }),
    }
  }

  if (target.inlinePayload) {
    smithyConfig.InlinePayload = target.inlinePayload
  }

  return {
    Mcp: {
      SmithyModel: smithyConfig,
    },
  }
}

/**
 * Build target configuration based on target type
 */
export function buildTargetConfiguration(target, context) {
  const targetType = target.type || 'lambda'

  switch (targetType.toLowerCase()) {
    case 'lambda':
      return buildLambdaTargetConfiguration(target, context)
    case 'openapi':
      return buildOpenApiTargetConfiguration(target)
    case 'smithy':
      return buildSmithyTargetConfiguration(target)
    default:
      throw new Error(`Unknown gateway target type: ${targetType}`)
  }
}

/**
 * Compile a GatewayTarget resource to CloudFormation
 */
export function compileGatewayTarget(
  gatewayName,
  targetName,
  config,
  gatewayLogicalId,
  context,
) {
  const resourceName = getGatewayTargetName(targetName)

  const credentialConfigs = buildCredentialProviderConfigurations(
    config.credentialProvider,
  )
  const targetConfig = buildTargetConfiguration(config, context)

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
