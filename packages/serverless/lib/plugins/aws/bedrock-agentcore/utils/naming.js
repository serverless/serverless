'use strict'

import _ from 'lodash'

/**
 * Naming utilities for AWS Bedrock AgentCore resources.
 *
 * AWS AgentCore has different naming requirements for different resource types:
 *
 * | Resource                              | Pattern                        | Separator | Max |
 * |---------------------------------------|--------------------------------|-----------|-----|
 * | Runtime, Memory, Browser, CodeInterp. | [a-zA-Z][a-zA-Z0-9_]{0,47}     | _         | 48  |
 * | Gateway, GatewayTarget                | ^([0-9a-zA-Z][-]?){1,100}$     | -         | 100 |
 * | WorkloadIdentity                      | [A-Za-z0-9_.-]+                | -         | 255 |
 *
 * CloudFormation Logical IDs must be alphanumeric, so we use the Serverless Framework
 * convention of replacing `-` with `Dash` and `_` with `Underscore`.
 */

/**
 * Normalize a resource name for CloudFormation logical IDs.
 * Replaces dashes with 'Dash' and underscores with 'Underscore', then capitalizes first letter.
 * Follows the same pattern as lib/plugins/aws/lib/naming.js
 *
 * @param {string} resourceName - The resource name to normalize
 * @returns {string} Normalized name for use in CloudFormation logical IDs
 * @example
 * getNormalizedResourceName('music-agent')     // 'MusicDashagent'
 * getNormalizedResourceName('chat_memory')     // 'ChatUnderscorememory'
 * getNormalizedResourceName('myAgent')         // 'MyAgent'
 */
export function getNormalizedResourceName(resourceName) {
  return _.upperFirst(
    resourceName.replace(/-/g, 'Dash').replace(/_/g, 'Underscore'),
  )
}

/**
 * Generate an AWS resource name for Runtime, Memory, Browser, and CodeInterpreter.
 * These resources require: [a-zA-Z][a-zA-Z0-9_]{0,47} (underscores, max 48 chars)
 *
 * @param {string} serviceName - The Serverless service name
 * @param {string} name - The resource name (agent name, memory name, etc.)
 * @param {string} stage - The deployment stage
 * @returns {string} AWS-compliant resource name
 * @example
 * getResourceName('music-service', 'my-agent', 'dev')
 * // 'music_service_my_agent_dev'
 */
export function getResourceName(serviceName, name, stage) {
  const baseName = `${serviceName}_${name}_${stage}`
    .replace(/-/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')

  // Ensure it starts with a letter (AWS requirement)
  const safeName = /^[a-zA-Z]/.test(baseName) ? baseName : `A${baseName}`

  return safeName.substring(0, 48)
}

/**
 * Generate an AWS resource name for Gateway and GatewayTarget.
 * These resources require: ^([0-9a-zA-Z][-]?){1,100}$ (hyphens, max 100 chars)
 *
 * @param {string} serviceName - The Serverless service name
 * @param {string} name - The gateway or target name
 * @param {string} stage - The deployment stage
 * @returns {string} AWS-compliant resource name
 * @example
 * getGatewayResourceName('music-service', 'spotify', 'dev')
 * // 'music-service-spotify-dev'
 */
export function getGatewayResourceName(serviceName, name, stage) {
  return `${serviceName}-${name}-${stage}`
    .replace(/[^0-9a-zA-Z-]/g, '-')
    .replace(/--+/g, '-')
    .substring(0, 100)
}

/**
 * Sanitize a GatewayTarget name to meet AWS requirements.
 * Pattern: ^([0-9a-zA-Z][-]?){1,100}$
 *
 * @param {string} targetName - The target name to sanitize
 * @returns {string} AWS-compliant target name
 * @example
 * getGatewayTargetName('get-playlist')  // 'get-playlist'
 * getGatewayTargetName('get_playlist')  // 'get-playlist'
 */
export function getGatewayTargetName(targetName) {
  return targetName
    .replace(/[^0-9a-zA-Z-]/g, '-')
    .replace(/--+/g, '-')
    .substring(0, 100)
}

/**
 * Generate an AWS resource name for WorkloadIdentity.
 * Pattern: [A-Za-z0-9_.-]+ (hyphens preferred for readability)
 *
 * @param {string} serviceName - The Serverless service name
 * @param {string} name - The agent name
 * @param {string} stage - The deployment stage
 * @returns {string} AWS-compliant WorkloadIdentity name
 * @example
 * getWorkloadIdentityName('music-service', 'my-agent', 'dev')
 * // 'music-service-my-agent-dev'
 */
export function getWorkloadIdentityName(serviceName, name, stage) {
  return getResourceName(serviceName, name, stage).replace(/_/g, '-')
}

/**
 * Generate a CloudFormation logical ID from the resource name and type.
 * Logical IDs must be alphanumeric, so special characters are converted.
 *
 * @param {string} name - The resource name
 * @param {string} resourceType - The resource type suffix (e.g., 'AgentRuntime', 'Memory')
 * @returns {string} CloudFormation logical ID
 * @example
 * getLogicalId('music-agent', 'AgentRuntime')  // 'MusicDashagentAgentRuntime'
 * getLogicalId('chat_memory', 'Memory')        // 'ChatUnderscorememoryMemory'
 */
export function getLogicalId(name, resourceType) {
  return `${getNormalizedResourceName(name)}${resourceType}`
}

/**
 * Generate a CloudFormation logical ID for nested/child resources.
 *
 * @param {string} parentName - The parent resource name
 * @param {string} childName - The child resource name
 * @param {string} resourceType - The resource type suffix
 * @returns {string} CloudFormation logical ID
 * @example
 * getNestedLogicalId('my-agent', 'default', 'RuntimeEndpoint')
 * // 'MyDashagentDefaultRuntimeEndpoint'
 */
export function getNestedLogicalId(parentName, childName, resourceType) {
  return `${getNormalizedResourceName(parentName)}${getNormalizedResourceName(childName)}${resourceType}`
}

/**
 * Convert a string to PascalCase (Start Case without spaces).
 * Follows the same pattern as lib/plugins/aws/lib/naming.js toStartCase().
 * Used for gateway names in logical IDs and export names.
 *
 * @param {string} name - The name to convert (kebab-case, snake_case, or camelCase)
 * @returns {string} PascalCase name
 * @example
 * pascalCase('spotify-gateway')  // 'SpotifyGateway'
 * pascalCase('my_gateway')       // 'MyGateway'
 * pascalCase('myGateway')        // 'MyGateway'
 */
export function pascalCase(name) {
  return _.startCase(name).replace(/\s+/g, '')
}

/**
 * Sanitize a name by removing all non-alphanumeric characters.
 *
 * @param {string} name - The name to sanitize
 * @returns {string} Sanitized name with only alphanumeric characters
 * @example
 * sanitizeName('my-agent_v2.0')  // 'myagentv20'
 * sanitizeName('MyAgent123')     // 'MyAgent123'
 */
export function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '')
}
