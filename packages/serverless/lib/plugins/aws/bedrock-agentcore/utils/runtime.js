'use strict'

/**
 * Runtime normalization utilities
 *
 * Maps Lambda-style runtime identifiers (e.g. python3.12) to
 * CloudFormation-style identifiers (e.g. PYTHON_3_12) used by
 * the BedrockAgentCore Runtime resource.
 */

const RUNTIME_MAP = {
  'python3.10': 'PYTHON_3_10',
  'python3.11': 'PYTHON_3_11',
  'python3.12': 'PYTHON_3_12',
  'python3.13': 'PYTHON_3_13',
}

/**
 * Normalize a Lambda-style runtime identifier to CloudFormation format.
 * Handles case-insensitive input (e.g. 'Python3.12' or 'PYTHON3.12').
 *
 * @param {string} runtime - Runtime identifier (e.g. 'python3.12')
 * @returns {string} CloudFormation runtime enum (e.g. 'PYTHON_3_12')
 */
export function normalizeRuntime(runtime) {
  const key = runtime?.toLowerCase()
  return RUNTIME_MAP[key] || runtime
}
