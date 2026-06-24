'use strict'

/**
 * Helper function for case-insensitive enum matching in JSON Schema.
 * Creates a schema that matches the string case-insensitively.
 * Copied from bedrock-agentcore/validators/schema.js
 *
 * @param {string} str - The string value to match
 * @returns {object} JSON Schema object with case-insensitive regex
 */
function caseInsensitive(str) {
  // Escape regex metacharacters so literals match exactly — without this the
  // '.' in values like 'python3.13' would act as a wildcard.
  const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return { type: 'string', regexp: new RegExp(`^${escaped}$`, 'i').toString() }
}

/**
 * Per-sandbox configuration schema.
 * artifact is required; memory must be one of the supported MiB values.
 */
const sandboxConfigSchema = {
  type: 'object',
  properties: {
    artifact: { type: 'string' },
    name: { type: 'string', maxLength: 64, pattern: '^[a-zA-Z0-9-_]+$' },
    memory: { enum: [512, 1024, 2048, 4096, 8192] },
    description: { type: 'string' },
    environment: { type: 'object', additionalProperties: { type: 'string' } },
    osCapabilities: {
      type: 'array',
      items: { anyOf: ['all'].map(caseInsensitive) },
    },
    hooks: { type: 'object' },
    vpc: {
      type: 'object',
      properties: {
        subnets: { type: 'array', items: { type: 'string' } },
        securityGroups: { type: 'array', items: { type: 'string' } },
        protocol: { anyOf: ['ipv4', 'dualstack'].map(caseInsensitive) },
      },
    },
    iam: { type: 'object' },
    observability: {
      anyOf: [
        { type: 'boolean' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            logs: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                retentionDays: { type: 'number' },
                logGroup: { type: 'string' },
              },
            },
            metrics: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean' },
                filters: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
            },
            alarms: {
              type: 'object',
              additionalProperties: false,
              properties: { notify: {}, thresholds: { type: 'object' } },
            },
            dashboard: {
              type: 'object',
              additionalProperties: false,
              properties: { enabled: { type: 'boolean' } },
            },
          },
        },
      ],
    },
    tags: { type: 'object', additionalProperties: { type: 'string' } },
  },
  required: ['artifact'],
  additionalProperties: false,
}

/**
 * Define JSON Schema validation for the 'sandboxes' top-level configuration.
 *
 * @param {object} serverless - Serverless framework instance
 */
export function defineSandboxesSchema(serverless) {
  if (!serverless.configSchemaHandler) return
  serverless.configSchemaHandler.defineTopLevelProperty('sandboxes', {
    type: 'object',
    additionalProperties: sandboxConfigSchema,
  })
}

export { sandboxConfigSchema, caseInsensitive }
