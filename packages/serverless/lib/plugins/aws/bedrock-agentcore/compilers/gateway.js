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
 * Transform custom claims from camelCase to PascalCase CFN format
 */
function transformCustomClaims(customClaims) {
  if (!customClaims || !Array.isArray(customClaims)) {
    return null
  }

  return customClaims.map((claim) => ({
    InboundTokenClaimName: claim.inboundTokenClaimName,
    InboundTokenClaimValueType: claim.inboundTokenClaimValueType,
    ...(claim.authorizingClaimMatchValue && {
      AuthorizingClaimMatchValue: {
        ClaimMatchOperator: claim.authorizingClaimMatchValue.claimMatchOperator,
        ...(claim.authorizingClaimMatchValue.claimMatchValue && {
          ClaimMatchValue: {
            ...(claim.authorizingClaimMatchValue.claimMatchValue
              .matchValueString && {
              MatchValueString:
                claim.authorizingClaimMatchValue.claimMatchValue
                  .matchValueString,
            }),
            ...(claim.authorizingClaimMatchValue.claimMatchValue
              .matchValueStringList && {
              MatchValueStringList:
                claim.authorizingClaimMatchValue.claimMatchValue
                  .matchValueStringList,
            }),
          },
        }),
      },
    }),
  }))
}

/**
 * Build authorizer configuration for the gateway
 */
export function buildGatewayAuthorizerConfiguration(authConfig) {
  if (!authConfig || !authConfig.jwt) {
    return null
  }

  const jwtConfig = authConfig.jwt

  if (!jwtConfig.discoveryUrl) {
    throw new Error('Gateway JWT authorizer requires discoveryUrl')
  }

  const transformedClaims = transformCustomClaims(jwtConfig.customClaims)

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
      ...(transformedClaims && {
        CustomClaims: transformedClaims,
      }),
    },
  }
}

/**
 * Build protocol configuration for the gateway
 *
 * Format:
 *   protocol:
 *     type: MCP
 *     supportedVersions: [...]
 *     instructions: "..."
 *     searchType: SEMANTIC
 *
 * CFN structure: { Mcp: { SupportedVersions?, Instructions?, SearchType? } }
 */
export function buildGatewayProtocolConfiguration(protocolConfig) {
  if (!protocolConfig) {
    return null
  }

  const hasContent =
    protocolConfig.supportedVersions ||
    protocolConfig.instructions ||
    protocolConfig.searchType
  if (!hasContent) {
    return null
  }

  return {
    Mcp: {
      ...(protocolConfig.supportedVersions && {
        SupportedVersions: protocolConfig.supportedVersions,
      }),
      ...(protocolConfig.instructions && {
        Instructions: protocolConfig.instructions,
      }),
      ...(protocolConfig.searchType && {
        SearchType: protocolConfig.searchType.toUpperCase(),
      }),
    },
  }
}

/**
 * Resolve role configuration to CloudFormation value
 * Supports:
 *   - ARN string: used directly
 *   - Logical name string: converted to Fn::GetAtt
 *   - Object (CF intrinsic like Fn::GetAtt, Fn::ImportValue): used directly
 *   - Undefined: falls back to generated role
 */
function resolveRole(role, generatedRoleLogicalId) {
  if (!role) {
    return { 'Fn::GetAtt': [generatedRoleLogicalId, 'Arn'] }
  }
  if (typeof role === 'string') {
    // String can be ARN or logical ID
    if (role.startsWith('arn:')) {
      return role
    }
    return { 'Fn::GetAtt': [role, 'Arn'] }
  }
  if (typeof role === 'object') {
    // Check if it's a CloudFormation intrinsic function
    if (
      role.Ref ||
      role['Fn::GetAtt'] ||
      role['Fn::ImportValue'] ||
      role['Fn::Sub'] ||
      role['Fn::Join']
    ) {
      return role
    }
    // Otherwise it's a customization object - use generated role
    return { 'Fn::GetAtt': [generatedRoleLogicalId, 'Arn'] }
  }
  return { 'Fn::GetAtt': [generatedRoleLogicalId, 'Arn'] }
}

/**
 * Compile a Gateway resource to CloudFormation
 *
 * Supported formats:
 *   authorizer: 'NONE' | 'AWS_IAM' | 'CUSTOM_JWT' | { type: 'CUSTOM_JWT', jwt: {...} }
 *   protocol: { type: 'MCP', instructions: ..., ... }
 *   role: 'arn:...' | { name, statements, managedPolicies, ... }
 *
 * @param {string} name - Gateway name
 * @param {object} config - Gateway configuration
 * @param {object} context - Serverless context (serviceName, stage)
 * @param {object} tags - Tags to apply
 * @param {string} [roleLogicalIdOverride] - Optional override for the role logical ID
 */
export function compileGateway(
  name,
  config,
  context,
  tags,
  roleLogicalIdOverride,
) {
  const { serviceName, stage } = context
  const resourceName = getGatewayResourceName(serviceName, name, stage)

  // Use provided roleLogicalId or generate one from name
  const roleLogicalId =
    roleLogicalIdOverride || `${getLogicalId(name, 'Gateway')}Role`

  // Handle authorizer configuration
  // Supports both string shorthand and object:
  //   authorizer: 'NONE'           (string shorthand)
  //   authorizer: { type: 'CUSTOM_JWT', jwt: {...} }  (object)
  let authorizerType
  let authConfig
  if (config.authorizer) {
    if (typeof config.authorizer === 'string') {
      // String shorthand (e.g., 'NONE', 'AWS_IAM')
      authorizerType = config.authorizer.toUpperCase()
    } else {
      // Authorizer object with type and jwt
      authorizerType = (config.authorizer.type || 'AWS_IAM').toUpperCase()
      if (config.authorizer.jwt) {
        authConfig = buildGatewayAuthorizerConfiguration({
          jwt: config.authorizer.jwt,
        })
      }
    }
  } else {
    // Default to AWS_IAM if not specified
    authorizerType = 'AWS_IAM'
  }

  // Handle protocol configuration
  let protocolType
  let protocolConfig
  if (config.protocol) {
    protocolType = (config.protocol.type || 'MCP').toUpperCase()
    protocolConfig = buildGatewayProtocolConfiguration(config.protocol)
  } else {
    // Default to MCP if not specified
    protocolType = 'MCP'
  }

  const role = config.role

  return {
    Type: 'AWS::BedrockAgentCore::Gateway',
    Properties: {
      Name: resourceName,
      AuthorizerType: authorizerType,
      ProtocolType: protocolType,
      RoleArn: resolveRole(role, roleLogicalId),
      ...(config.description && { Description: config.description }),
      ...(authConfig && { AuthorizerConfiguration: authConfig }),
      ...(protocolConfig && { ProtocolConfiguration: protocolConfig }),
      ...(config.kmsKey && { KmsKeyArn: config.kmsKey }),
      ...(config.exceptionLevel && {
        ExceptionLevel: config.exceptionLevel?.toUpperCase(),
      }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
