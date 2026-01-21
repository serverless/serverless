'use strict'

/**
 * AWS::BedrockAgentCore::Gateway CloudFormation Schema
 *
 * Required Properties:
 *   - Name: string, pattern: ([0-9a-zA-Z][-]?){1,100}
 *   - AuthorizerType: enum CUSTOM_JWT|AWS_IAM|NONE
 *   - ProtocolType: enum MCP
 *   - RoleArn: string, ARN pattern
 *
 * Optional Properties:
 *   - Description: string, maxLength: 200
 *   - AuthorizerConfiguration: oneOf { CustomJWTAuthorizer }
 *     - CustomJWTAuthorizer: { DiscoveryUrl (required), AllowedAudience?, AllowedClients?,
 *         AllowedScopes?, CustomClaims? }
 *   - ProtocolConfiguration: oneOf { Mcp }
 *     - Mcp: { SupportedVersions?, Instructions?, SearchType?: SEMANTIC }
 *   - ExceptionLevel: enum DEBUG
 *   - KmsKeyArn: string, KMS key ARN pattern
 *   - InterceptorConfigurations: array of { Interceptor, InterceptionPoints, InputConfiguration? }
 *   - Tags: map<string, string>
 *
 * Read-Only Properties:
 *   - CreatedAt, GatewayArn, GatewayIdentifier, GatewayUrl, Status, StatusReasons, UpdatedAt,
 *     WorkloadIdentityDetails
 */

import { getLogicalId, getGatewayResourceName } from '../utils/naming.js'

/**
 * Build authorizer configuration for the gateway
 */
export function buildGatewayAuthorizerConfiguration(authConfig) {
  if (!authConfig || !authConfig.customJwtAuthorizer) {
    return null
  }

  const jwtConfig = authConfig.customJwtAuthorizer

  if (!jwtConfig.discoveryUrl) {
    throw new Error('Gateway CustomJWTAuthorizer requires discoveryUrl')
  }

  return {
    CustomJWTAuthorizer: {
      DiscoveryUrl: jwtConfig.discoveryUrl,
      ...(jwtConfig.allowedAudience && {
        AllowedAudience: jwtConfig.allowedAudience,
      }),
      ...(jwtConfig.allowedClients && {
        AllowedClients: jwtConfig.allowedClients,
      }),
      ...(jwtConfig.allowedScopes && {
        AllowedScopes: jwtConfig.allowedScopes,
      }),
      ...(jwtConfig.customClaims && { CustomClaims: jwtConfig.customClaims }),
    },
  }
}

/**
 * Build protocol configuration for the gateway
 * CFN structure: { Mcp: { SupportedVersions?, Instructions?, SearchType? } }
 */
export function buildGatewayProtocolConfiguration(protocolConfig) {
  if (!protocolConfig || !protocolConfig.mcp) {
    return null
  }

  const mcpConfig = protocolConfig.mcp

  return {
    Mcp: {
      ...(mcpConfig.supportedVersions && {
        SupportedVersions: mcpConfig.supportedVersions,
      }),
      ...(mcpConfig.instructions && { Instructions: mcpConfig.instructions }),
      ...(mcpConfig.searchType && { SearchType: mcpConfig.searchType }),
    },
  }
}

/**
 * Compile a Gateway resource to CloudFormation
 */
export function compileGateway(name, config, context, tags) {
  const { serviceName, stage } = context
  const resourceName = getGatewayResourceName(serviceName, name, stage)

  const roleLogicalId = `${getLogicalId(name, 'Gateway')}Role`

  const authorizerType = config.authorizerType || 'AWS_IAM'
  const protocolType = config.protocolType || 'MCP'

  const authConfig = buildGatewayAuthorizerConfiguration(
    config.authorizerConfiguration,
  )
  const protocolConfig = buildGatewayProtocolConfiguration(
    config.protocolConfiguration,
  )

  return {
    Type: 'AWS::BedrockAgentCore::Gateway',
    Properties: {
      Name: resourceName,
      AuthorizerType: authorizerType,
      ProtocolType: protocolType,
      RoleArn: config.roleArn || { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      ...(config.description && { Description: config.description }),
      ...(authConfig && { AuthorizerConfiguration: authConfig }),
      ...(protocolConfig && { ProtocolConfiguration: protocolConfig }),
      ...(config.kmsKeyArn && { KmsKeyArn: config.kmsKeyArn }),
      ...(config.exceptionLevel && { ExceptionLevel: config.exceptionLevel }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
