'use strict'

/**
 * Utility functions for resolving IAM role configurations to CloudFormation values.
 *
 * Used by all compiler modules (runtime, memory, gateway, browser, codeInterpreter)
 * to consistently handle role references in various formats:
 * - ARN strings
 * - Logical name strings (references to other CloudFormation resources)
 * - CloudFormation intrinsic functions (Ref, Fn::GetAtt, Fn::ImportValue, etc.)
 * - Role customization objects (statements, managedPolicies, etc.)
 */

/**
 * Resolve role configuration to CloudFormation value
 *
 * Supports:
 *   - ARN string: used directly (e.g., 'arn:aws:iam::123456789012:role/MyRole')
 *   - Logical name string: converted to Fn::GetAtt (e.g., 'MyRoleResource')
 *   - Object (CF intrinsic like Fn::GetAtt, Fn::ImportValue): used directly
 *   - Undefined/null: falls back to generated role
 *   - Customization object (statements, managedPolicies): uses generated role
 *
 * @param {string|object|undefined} role - Role configuration
 * @param {string} generatedRoleLogicalId - Logical ID of the auto-generated role
 * @returns {string|object} CloudFormation role ARN value
 */
export function resolveRole(role, generatedRoleLogicalId) {
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
