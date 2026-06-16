'use strict'

/**
 * Runtime normalization utilities
 *
 * Maps Lambda-style runtime identifiers (e.g. python3.12) to
 * CloudFormation-style identifiers (e.g. PYTHON_3_12) used by
 * the BedrockAgentCore Runtime resource.
 */

import { SUPPORTED_AGENT_RUNTIMES } from '../validators/schema.js'

// Derived from the single supported-runtimes allowlist so the deploy mapping
// and the config/dev validation can never drift. The CloudFormation enum is a
// deterministic transform of the Lambda-style id, e.g. python3.14 -> PYTHON_3_14.
const RUNTIME_MAP = Object.fromEntries(
  SUPPORTED_AGENT_RUNTIMES.map((runtime) => [
    runtime,
    `PYTHON_${runtime.replace(/^python/, '').replace('.', '_')}`,
  ]),
)

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
