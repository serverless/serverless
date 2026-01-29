'use strict'

/**
 * AWS::BedrockAgentCore::Memory CloudFormation Schema
 *
 * User-friendly property names -> CFN properties:
 *   - expiration -> EventExpiryDuration (7-365 days, default: 30)
 *   - encryptionKey -> EncryptionKeyArn
 *   - strategies -> MemoryStrategies
 *   - description -> Description
 *   - role -> MemoryExecutionRoleArn (accepts ARN, logical name, or CF intrinsic)
 *   - tags -> Tags
 *
 * Memory Strategy Types (use as typed union):
 *   - SemanticMemoryStrategy: { Name, Description?, Namespaces? }
 *   - SummaryMemoryStrategy: { Name, Description?, Namespaces? }
 *   - UserPreferenceMemoryStrategy: { Name, Description?, Namespaces? }
 *   - CustomMemoryStrategy: { Name, Description?, Namespaces?, Configuration? }
 *   - EpisodicMemoryStrategy: { Name, Description?, Namespaces?, ReflectionConfiguration? }
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
 *
 * @param {string} name - The memory name
 * @param {object} config - Memory configuration
 * @param {object} context - Service context
 * @param {object} tags - Tags to apply
 * @param {string} [parentRuntimeName] - If memory is inline on a runtime, the runtime name
 */
export function compileMemory(name, config, context, tags, parentRuntimeName) {
  const { serviceName, stage } = context
  const resourceName = getResourceName(serviceName, name, stage)
  const roleLogicalId = `${getLogicalId(name, 'Memory')}Role`

  const strategies = buildMemoryStrategies(config.strategies)

  // Default expiration to 30 days if not specified
  const expiration = config.expiration || 30

  return {
    Type: 'AWS::BedrockAgentCore::Memory',
    Properties: {
      Name: resourceName,
      EventExpiryDuration: expiration,
      ...(config.description && { Description: config.description }),
      ...(config.encryptionKey && {
        EncryptionKeyArn: config.encryptionKey,
      }),
      MemoryExecutionRoleArn: resolveRole(config.role, roleLogicalId),
      ...(strategies && { MemoryStrategies: strategies }),
      ...(Object.keys(tags).length > 0 && { Tags: tags }),
    },
  }
}
