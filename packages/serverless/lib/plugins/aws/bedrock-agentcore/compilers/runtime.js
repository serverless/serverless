'use strict'

/**
 * AWS::BedrockAgentCore::Runtime CloudFormation Schema
 *
 * Required Properties:
 *   - AgentRuntimeName: string, pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}
 *   - AgentRuntimeArtifact: object
 *     - ContainerConfiguration: { ContainerUri: string }
 *     - CodeConfiguration: { Code: { S3: { Bucket, Prefix, VersionId? } }, Runtime: enum, EntryPoint: string[] }
 *   - RoleArn: string, pattern: arn:aws(-[^:]+)?:iam::([0-9]{12})?:role/.+
 *   - NetworkConfiguration: { NetworkMode: PUBLIC|VPC, NetworkModeConfig?: { Subnets, SecurityGroups } }
 *
 * Optional Properties:
 *   - Description: string, maxLength: 1200
 *   - AuthorizerConfiguration: { CustomJWTAuthorizer: { DiscoveryUrl, AllowedAudience?, AllowedClients? } }
 *   - LifecycleConfiguration: { IdleRuntimeSessionTimeout?: 60-28800, MaxLifetime?: 60-28800 }
 *   - ProtocolConfiguration: enum MCP|HTTP|A2A
 *   - EnvironmentVariables: map<string, string>, maxProperties: 50
 *   - RequestHeaderConfiguration: { RequestHeaderAllowlist: string[] }
 *   - Tags: map<string, string>
 *
 * Read-Only Properties:
 *   - AgentRuntimeArn, AgentRuntimeId, AgentRuntimeVersion, Status, CreatedAt, LastUpdatedAt,
 *     WorkloadIdentityDetails, FailureReason
 *
 * Network Modes: PUBLIC, VPC
 * Managed Runtimes: PYTHON_3_10, PYTHON_3_11, PYTHON_3_12, PYTHON_3_13
 */

import { getResourceName, getLogicalId } from '../utils/naming.js'

/**
 * Build the artifact configuration for the runtime
 * Supports:
 * - ContainerConfiguration (artifact.image as string)
 * - CodeConfiguration with user-specified S3 (s3.bucket + s3.key)
 * - CodeConfiguration with deployment bucket (entryPoint only, no s3.bucket)
 */
function buildArtifact(artifact, options = {}) {
  // Container deployment: artifact.image is a string (pre-built or resolved URI)
  if (typeof artifact.image === 'string') {
    return {
      ContainerConfiguration: {
        ContainerUri: artifact.image,
      },
    }
  }

  // User-specified S3 bucket (manual management)
  if (artifact.s3?.bucket) {
    const codeConfig = {
      Code: {
        S3: {
          Bucket: artifact.s3.bucket,
          Prefix: artifact.s3.key,
          ...(artifact.s3.versionId && { VersionId: artifact.s3.versionId }),
        },
      },
      EntryPoint: artifact.entryPoint || ['main.py'],
      Runtime: artifact.runtime || 'PYTHON_3_13',
    }
    return {
      CodeConfiguration: codeConfig,
    }
  }

  // Code deployment using deployment bucket (automatic packaging)
  if (artifact.entryPoint) {
    const { artifactKey, deploymentBucket } = options

    if (!artifactKey) {
      throw new Error(
        'Code deployment requires artifact to be packaged first. ' +
          'Make sure the agent was packaged before compilation.',
      )
    }

    // Use custom deployment bucket if specified, otherwise reference auto-generated one
    const bucketRef = deploymentBucket
      ? deploymentBucket
      : { Ref: 'ServerlessDeploymentBucket' }

    const codeConfig = {
      Code: {
        S3: {
          Bucket: bucketRef,
          Prefix: artifactKey,
        },
      },
      EntryPoint: artifact.entryPoint,
      Runtime: artifact.runtime || 'PYTHON_3_13',
    }
    return {
      CodeConfiguration: codeConfig,
    }
  }

  throw new Error(
    'Artifact must specify either image (container URI), s3 (bucket+key), or entryPoint (code deployment)',
  )
}

/**
 * Build network configuration for the runtime
 * Uses NetworkModeConfig with VpcConfig for VPC mode
 * Supports flattened network config: mode, subnets, securityGroups
 */
function buildNetworkConfiguration(network = {}) {
  // Normalize mode to uppercase, default to PUBLIC
  const networkMode = (network.mode || 'PUBLIC').toUpperCase()

  const config = {
    NetworkMode: networkMode,
  }

  // VPC mode: expect subnets and securityGroups directly on network object
  if (networkMode === 'VPC' && network.subnets) {
    config.NetworkModeConfig = {
      Subnets: network.subnets,
      SecurityGroups: network.securityGroups || [],
    }
  }

  return config
}

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
 * Build authorizer configuration for the runtime
 */
function buildAuthorizerConfiguration(authorizer) {
  if (!authorizer?.jwt) {
    return null
  }

  const jwtConfig = authorizer.jwt

  if (!jwtConfig.discoveryUrl) {
    throw new Error('JWT authorizer requires discoveryUrl')
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
 * Build lifecycle configuration for the runtime
 * Properties:
 * - IdleRuntimeSessionTimeout: 60-28800 seconds (default 900)
 * - MaxLifetime: 60-28800 seconds (default 28800)
 */
function buildLifecycleConfiguration(lifecycle) {
  if (!lifecycle) {
    return null
  }

  return {
    ...(lifecycle.idleRuntimeSessionTimeout !== undefined && {
      IdleRuntimeSessionTimeout: lifecycle.idleRuntimeSessionTimeout,
    }),
    ...(lifecycle.maxLifetime !== undefined && {
      MaxLifetime: lifecycle.maxLifetime,
    }),
  }
}

/**
 * Build protocol configuration for the runtime
 */
/**
 * Build protocol configuration for the runtime
 * For Runtime, ProtocolConfiguration is just a string enum: HTTP, MCP, or A2A
 * @param {object|string} protocol - Protocol configuration object or string
 * @returns {string|null} Protocol type string (uppercase) or null
 */
function buildProtocolConfiguration(protocol) {
  if (!protocol) {
    return null
  }
  // Handle object format: { type: 'MCP' }
  if (typeof protocol === 'object' && protocol.type) {
    return protocol.type.toUpperCase()
  }
  // Handle string shorthand: protocol: 'HTTP'
  if (typeof protocol === 'string') {
    return protocol.toUpperCase()
  }
  return null
}

/**
 * Build environment variables for the runtime
 */
function buildEnvironmentVariables(environment) {
  if (!environment || Object.keys(environment).length === 0) {
    return null
  }
  return environment
}

/**
 * Build request header configuration for the runtime
 */
function buildRequestHeaderConfiguration(requestHeaders) {
  if (
    !requestHeaders ||
    !requestHeaders.allowlist ||
    requestHeaders.allowlist.length === 0
  ) {
    return null
  }

  return {
    RequestHeaderAllowlist: requestHeaders.allowlist,
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
    // Fall back to generated role
    return { 'Fn::GetAtt': [generatedRoleLogicalId, 'Arn'] }
  }
  if (typeof role === 'string') {
    // String can be ARN or logical ID
    if (role.startsWith('arn:')) {
      return role
    }
    // Treat as logical name reference
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
      // CloudFormation intrinsic - use as-is
      return role
    }
    // Otherwise it's a customization object - use generated role
    return { 'Fn::GetAtt': [generatedRoleLogicalId, 'Arn'] }
  }
  return { 'Fn::GetAtt': [generatedRoleLogicalId, 'Arn'] }
}

/**
 * Compile a Runtime resource to CloudFormation
 *
 * @param {string} name - Agent name
 * @param {object} config - Agent configuration
 * @param {object} context - Service context (serviceName, stage, artifactDirectoryName)
 * @param {object} tags - Tags to apply
 */
export function compileRuntime(name, config, context, tags) {
  const { serviceName, stage, artifactDirectoryName, deploymentBucket } =
    context
  const resourceName = getResourceName(serviceName, name, stage)
  const roleLogicalId = `${getLogicalId(name, 'Runtime')}Role`

  // Determine artifact options for code deployment
  const artifactOptions = {}

  // Check if this is code deployment (entryPoint without s3.bucket or image)
  const artifactConfig = config.artifact || {}
  const isCodeDeployment =
    artifactConfig.entryPoint &&
    !artifactConfig.s3?.bucket &&
    typeof artifactConfig.image !== 'string'

  if (isCodeDeployment && config.package?.artifact) {
    // Build the S3 key from artifact directory and artifact filename
    const artifactFileName = config.package.artifact.replace(
      /^\.serverless\//,
      '',
    )
    artifactOptions.artifactKey = artifactDirectoryName
      ? `${artifactDirectoryName}/${artifactFileName}`
      : artifactFileName
    // Pass deployment bucket (string if custom, undefined if auto-generated)
    artifactOptions.deploymentBucket = deploymentBucket
  }

  const artifact = buildArtifact(config.artifact, artifactOptions)
  const networkConfig = buildNetworkConfiguration(config.network)
  const authorizerConfig = buildAuthorizerConfiguration(config.authorizer)
  const lifecycleConfig = buildLifecycleConfiguration(config.lifecycle)
  const protocolConfig = buildProtocolConfiguration(config.protocol)
  const envVars = buildEnvironmentVariables(config.environment)
  const requestHeaderConfig = buildRequestHeaderConfiguration(
    config.requestHeaders,
  )

  return {
    Type: 'AWS::BedrockAgentCore::Runtime',
    Properties: {
      AgentRuntimeName: resourceName,
      AgentRuntimeArtifact: artifact,
      NetworkConfiguration: networkConfig,
      RoleArn: resolveRole(config.role, roleLogicalId),
      ...(config.description && { Description: config.description }),
      ...(authorizerConfig && { AuthorizerConfiguration: authorizerConfig }),
      ...(lifecycleConfig && { LifecycleConfiguration: lifecycleConfig }),
      ...(protocolConfig && { ProtocolConfiguration: protocolConfig }),
      ...(envVars && { EnvironmentVariables: envVars }),
      ...(requestHeaderConfig && {
        RequestHeaderConfiguration: requestHeaderConfig,
      }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}

export {
  buildArtifact,
  buildNetworkConfiguration,
  buildAuthorizerConfiguration,
  buildLifecycleConfiguration,
  buildProtocolConfiguration,
  buildEnvironmentVariables,
  buildRequestHeaderConfiguration,
  resolveRole,
}
