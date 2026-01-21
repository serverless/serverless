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
 * Build network configuration for CodeInterpreterCustom
 */
export function buildCodeInterpreterNetworkConfiguration(network = {}) {
  const networkMode = network.networkMode || 'SANDBOX'

  const config = {
    NetworkMode: networkMode,
  }

  if (networkMode === 'VPC' && network.vpcConfig) {
    config.VpcConfig = {
      Subnets: network.vpcConfig.subnets,
      SecurityGroups: network.vpcConfig.securityGroups,
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
      ...(config.roleArn
        ? { ExecutionRoleArn: config.roleArn }
        : { ExecutionRoleArn: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] } }),
      ...(config.description && { Description: config.description }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
