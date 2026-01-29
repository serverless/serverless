'use strict'

/**
 * AWS::BedrockAgentCore::CodeInterpreterCustom CloudFormation Schema
 *
 * Required Properties:
 *   - Name: string (SandboxName pattern)
 *   - NetworkConfiguration: { NetworkMode: PUBLIC|SANDBOX|VPC (required), VpcConfig? }
 *     - VpcConfig: { Subnets (required), SecurityGroups (required) }
 *
 * Optional Properties:
 *   - Description: string
 *   - ExecutionRoleArn: string, IAM role ARN pattern
 *   - Tags: map<string, string>
 *
 * Read-Only Properties:
 *   - CodeInterpreterId, CodeInterpreterArn, Status, FailureReason, CreatedAt, LastUpdatedAt
 *
 * Create-Only Properties:
 *   - Name, Description, NetworkConfiguration, ExecutionRoleArn
 *
 * Network Modes: PUBLIC, SANDBOX (default), VPC
 * Status: CREATING, CREATE_FAILED, READY, DELETING, DELETE_FAILED, DELETED
 */

import { getResourceName, getLogicalId } from '../utils/naming.js'

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
 * Build network configuration for CodeInterpreterCustom
 * CodeInterpreter supports: PUBLIC, SANDBOX (default), VPC
 */
export function buildCodeInterpreterNetworkConfiguration(network = {}) {
  // Normalize mode to uppercase, default to SANDBOX
  const networkMode = (network.mode || 'SANDBOX').toUpperCase()

  const config = {
    NetworkMode: networkMode,
  }

  // VPC mode: expect subnets and securityGroups directly on network object
  if (networkMode === 'VPC' && network.subnets) {
    config.VpcConfig = {
      Subnets: network.subnets,
      SecurityGroups: network.securityGroups || [],
    }
  }

  return config
}

/**
 * Compile a CodeInterpreterCustom resource to CloudFormation
 */
export function compileCodeInterpreter(name, config, context, tags) {
  const { serviceName, stage } = context
  const resourceName = getResourceName(serviceName, name, stage)
  const roleLogicalId = `${getLogicalId(name, 'CodeInterpreter')}Role`

  const networkConfig = buildCodeInterpreterNetworkConfiguration(config.network)

  return {
    Type: 'AWS::BedrockAgentCore::CodeInterpreterCustom',
    Properties: {
      Name: resourceName,
      NetworkConfiguration: networkConfig,
      ExecutionRoleArn: resolveRole(config.role, roleLogicalId),
      ...(config.description && { Description: config.description }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
