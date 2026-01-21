'use strict'

import _ from 'lodash'

/**
 * Normalize a name to PascalCase (first letter uppercase)
 * Follows the same pattern as lib/plugins/aws/lib/naming.js
 */
export function normalizeName(name) {
  return `${_.upperFirst(name)}`
}

/**
 * Normalize a name removing all non-alphanumeric characters
 */
export function normalizeNameToAlphaNumericOnly(name) {
  return normalizeName(name.replace(/[^0-9A-Za-z]/g, ''))
}

/**
 * Get a normalized resource name that handles dashes and underscores
 * Similar to getNormalizedResourceName in lib/plugins/aws/lib/naming.js
 */
export function getNormalizedResourceName(resourceName) {
  return normalizeName(
    resourceName.replace(/-/g, 'Dash').replace(/_/g, 'Underscore'),
  )
}

/**
 * Generate a resource name for Runtime, Memory, Browser, CodeInterpreter
 * AgentCore pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}
 * Uses underscores, max 48 characters
 */
export function getResourceName(serviceName, name, stage) {
  const baseName = `${serviceName}_${name}_${stage}`
    .replace(/-/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')

  // Ensure it starts with a letter
  const safeName = /^[a-zA-Z]/.test(baseName) ? baseName : `A${baseName}`

  return safeName.substring(0, 48)
}

/**
 * Generate a resource name for Gateway and GatewayTarget
 * Pattern: ^([0-9a-zA-Z][-]?){1,100}$
 * Uses hyphens, max 100 characters
 */
export function getGatewayResourceName(serviceName, name, stage) {
  return `${serviceName}-${name}-${stage}`
    .replace(/[^0-9a-zA-Z-]/g, '-')
    .replace(/--+/g, '-')
    .substring(0, 100)
}

/**
 * Generate a resource name for GatewayTarget (target name only)
 * Pattern: ^([0-9a-zA-Z][-]?){1,100}$
 */
export function getGatewayTargetName(targetName) {
  return targetName
    .replace(/[^0-9a-zA-Z-]/g, '-')
    .replace(/--+/g, '-')
    .substring(0, 100)
}

/**
 * Generate a resource name for WorkloadIdentity
 * Pattern: [A-Za-z0-9_.-]+
 * Uses hyphens (converted from underscores), max 255 characters
 */
export function getWorkloadIdentityName(serviceName, name, stage) {
  return getResourceName(serviceName, name, stage).replace(/_/g, '-')
}

/**
 * Generate a CloudFormation logical ID from the agent name and resource type
 * Uses getNormalizedResourceName to properly handle dashes/underscores
 */
export function getLogicalId(name, resourceType) {
  return `${getNormalizedResourceName(name)}${resourceType}`
}

/**
 * Generate a CloudFormation logical ID for nested resources
 */
export function getNestedLogicalId(parentName, childName, resourceType) {
  return `${getNormalizedResourceName(parentName)}${getNormalizedResourceName(childName)}${resourceType}`
}

/**
 * Sanitize a name for use in CloudFormation (alphanumeric only)
 */
export function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '')
}
