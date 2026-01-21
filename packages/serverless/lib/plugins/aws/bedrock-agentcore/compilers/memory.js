'use strict'

/**
 * AWS::BedrockAgentCore::Memory CloudFormation Schema
 *
 * Required Properties:
 *   - Name: string, pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}
 *   - EventExpiryDuration: integer, 7-365 days
 *
 * Optional Properties:
 *   - Description: string
 *   - EncryptionKeyArn: string, ARN format
 *   - MemoryExecutionRoleArn: string, ARN format
 *   - MemoryStrategies: array of MemoryStrategy (oneOf):
 *     - SemanticMemoryStrategy: { Name, Description?, Namespaces? }
 *     - SummaryMemoryStrategy: { Name, Description?, Namespaces? }
 *     - UserPreferenceMemoryStrategy: { Name, Description?, Namespaces? }
 *     - CustomMemoryStrategy: { Name, Description?, Namespaces?, Configuration? }
 *     - EpisodicMemoryStrategy: { Name, Description?, Namespaces?, ReflectionConfiguration? }
 *   - Tags: map<string, string>
 *
 * Read-Only Properties:
 *   - MemoryArn, MemoryId, Status, CreatedAt, UpdatedAt, FailureReason
 *
 * Create-Only Properties:
 *   - Name, EncryptionKeyArn
 *
 * Memory Strategy Types: SEMANTIC, SUMMARIZATION, USER_PREFERENCE, CUSTOM, EPISODIC
 */

import { getResourceName, getLogicalId } from '../utils/naming.js'

/**
 * Build memory strategies configuration
 * Strategies should use the typed union format:
 * - SemanticMemoryStrategy
 * - SummaryMemoryStrategy
 * - UserPreferenceMemoryStrategy
 * - CustomMemoryStrategy
 * - EpisodicMemoryStrategy
 */
export function buildMemoryStrategies(strategies) {
  if (!strategies || strategies.length === 0) {
    return null
  }

  return strategies
}

/**
 * Compile a Memory resource to CloudFormation
 */
export function compileMemory(name, config, context, tags) {
  const { serviceName, stage } = context
  const resourceName = getResourceName(serviceName, name, stage)
  const roleLogicalId = `${getLogicalId(name, 'Memory')}Role`

  const strategies = buildMemoryStrategies(config.strategies)
  const eventExpiryDuration = config.eventExpiryDuration || 30

  return {
    Type: 'AWS::BedrockAgentCore::Memory',
    Properties: {
      Name: resourceName,
      EventExpiryDuration: eventExpiryDuration,
      ...(config.description && { Description: config.description }),
      ...(config.encryptionKeyArn && {
        EncryptionKeyArn: config.encryptionKeyArn,
      }),
      ...(!config.roleArn && {
        MemoryExecutionRoleArn: { 'Fn::GetAtt': [roleLogicalId, 'Arn'] },
      }),
      ...(config.roleArn && { MemoryExecutionRoleArn: config.roleArn }),
      ...(strategies && { MemoryStrategies: strategies }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
