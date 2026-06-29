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
 * A single lifecycle hook value: `true` to enable with the default timeout, or
 * an object with a custom `{ timeout }`. Mirrors what compilers/image.js reads.
 */
const hookValue = {
  anyOf: [
    { type: 'boolean' },
    {
      type: 'object',
      additionalProperties: false,
      properties: { timeout: { type: 'number', minimum: 1 } },
    },
  ],
}

/**
 * An IAM role customization (iam.buildRole / iam.executionRole): either an
 * existing role ARN string, or an object adding inline `statements` and/or
 * `managedPolicies` to the generated role. Mirrors iam/policies.js.
 */
const roleCustomization = {
  anyOf: [
    // An existing role ARN string.
    { type: 'string' },
    // Extend the generated role with extra statements / managed policies /
    // a permissions boundary.
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        statements: { type: 'array', items: { type: 'object' } },
        managedPolicies: { type: 'array', items: { type: 'string' } },
        permissionsBoundary: { type: 'string' },
      },
    },
    // A CloudFormation intrinsic that resolves to an existing role ARN
    // (skips role generation): Ref / Fn::GetAtt / Fn::ImportValue / Fn::Sub.
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        Ref: {},
        'Fn::GetAtt': {},
        'Fn::ImportValue': {},
        'Fn::Sub': {},
      },
    },
  ],
}

/**
 * Per-filter alarm threshold overrides (observability.alarms.thresholds.<filter>).
 * Mirrors DEFAULT_THRESHOLD in compilers/observability.js.
 */
const thresholdConfig = {
  type: 'object',
  additionalProperties: false,
  properties: {
    threshold: { type: 'number' },
    period: { type: 'number' },
    evaluationPeriods: { type: 'number' },
    datapointsToAlarm: { type: 'number' },
    comparisonOperator: { type: 'string' },
    treatMissingData: { type: 'string' },
  },
}

/**
 * Per-sandbox configuration schema.
 * artifact is required; memory must be one of the supported MiB values.
 */
const sandboxConfigSchema = {
  type: 'object',
  properties: {
    artifact: { type: 'string' },
    memory: { enum: [512, 1024, 2048, 4096, 8192] },
    description: { type: 'string' },
    environment: { type: 'object', additionalProperties: { type: 'string' } },
    osCapabilities: {
      type: 'array',
      items: { anyOf: ['all'].map(caseInsensitive) },
    },
    hooks: {
      type: 'object',
      additionalProperties: false,
      properties: {
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        // Image (build-time) hooks.
        ready: hookValue,
        validate: hookValue,
        // Runtime (per-instance) hooks.
        run: hookValue,
        resume: hookValue,
        suspend: hookValue,
        terminate: hookValue,
      },
    },
    vpc: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subnets: { type: 'array', items: { type: 'string' } },
        securityGroups: { type: 'array', items: { type: 'string' } },
        protocol: { anyOf: ['ipv4', 'dualstack'].map(caseInsensitive) },
      },
    },
    iam: {
      type: 'object',
      additionalProperties: false,
      properties: {
        buildRole: roleCustomization,
        executionRole: roleCustomization,
      },
    },
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
              properties: {
                notify: {},
                thresholds: {
                  type: 'object',
                  additionalProperties: thresholdConfig,
                },
              },
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
