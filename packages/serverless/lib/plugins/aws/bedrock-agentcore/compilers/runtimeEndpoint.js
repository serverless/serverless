'use strict'

/**
 * AWS::BedrockAgentCore::RuntimeEndpoint CloudFormation Schema
 *
 * Required Properties:
 *   - AgentRuntimeId: string, pattern: [a-zA-Z][a-zA-Z0-9_]{0,99}-[a-zA-Z0-9]{10}
 *   - Name: string, pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}, maxLength: 48
 *
 * Optional Properties:
 *   - AgentRuntimeVersion: string, pattern: ([1-9][0-9]{0,4})
 *   - Description: string, maxLength: 256
 *   - Tags: map<string, string>
 *
 * Read-Only Properties:
 *   - Id, AgentRuntimeEndpointArn, AgentRuntimeArn, Status, CreatedAt, LastUpdatedAt,
 *     FailureReason, TargetVersion, LiveVersion
 *
 * Create-Only Properties:
 *   - AgentRuntimeId, Name
 */

import { getResourceName } from '../utils/naming.js'

/**
 * Compile a RuntimeEndpoint resource to CloudFormation
 */
export function compileRuntimeEndpoint(
  agentName,
  endpointName,
  config,
  runtimeLogicalId,
  context,
  tags,
) {
  const { serviceName, stage } = context

  const resourceName = getResourceName(
    serviceName,
    `${agentName}_${endpointName}`,
    stage,
  )

  return {
    Type: 'AWS::BedrockAgentCore::RuntimeEndpoint',
    DependsOn: [runtimeLogicalId],
    Properties: {
      Name: resourceName,
      AgentRuntimeId: { 'Fn::GetAtt': [runtimeLogicalId, 'AgentRuntimeId'] },
      ...(config.version && { AgentRuntimeVersion: config.version }),
      ...(config.description && { Description: config.description }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
