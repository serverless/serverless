'use strict'

/**
 * AWS::BedrockAgentCore::WorkloadIdentity CloudFormation Schema
 *
 * Required Properties:
 *   - Name: string, pattern: [A-Za-z0-9_.-]+, minLength: 3, maxLength: 255
 *
 * Optional Properties:
 *   - AllowedResourceOauth2ReturnUrls: array of strings (URL pattern), maxLength: 2048 each
 *   - Tags: array of { Key (required), Value (required) }
 *     - Key: pattern: ^(?!aws:)[a-zA-Z+-=._:/]+$, maxLength: 128
 *     - Value: maxLength: 256
 *
 * Read-Only Properties:
 *   - WorkloadIdentityArn, CreatedTime, LastUpdatedTime
 *
 * Create-Only Properties:
 *   - Name
 *
 * Note: Tags use array format [{Key, Value}], not map format
 */

import { getWorkloadIdentityName } from '../utils/naming.js'

/**
 * Compile a WorkloadIdentity resource to CloudFormation
 */
export function compileWorkloadIdentity(name, config, context, tags) {
  const { serviceName, stage } = context
  const resourceName = getWorkloadIdentityName(serviceName, name, stage)

  // Convert tags object to array format for WorkloadIdentity
  const tagArray = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }))

  return {
    Type: 'AWS::BedrockAgentCore::WorkloadIdentity',
    Properties: {
      Name: resourceName,
      ...(config.oauth2ReturnUrls && {
        AllowedResourceOauth2ReturnUrls: config.oauth2ReturnUrls,
      }),
      ...(tagArray.length > 0 && { Tags: tagArray }),
    },
  }
}
