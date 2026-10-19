'use strict'

import { caseInsensitive, getEntryIamSchema } from '../../provider.js'
import {
  APPLICATION_LOG_LEVELS,
  RATE_LIMIT_VALUES,
  RUNTIME_PATTERN,
  SYSTEM_LOG_LEVELS,
  URL_AUTHORIZERS,
} from '../constants.js'

/** Web app keys: letters, digits, `-` and `_`, ending in a letter or digit. */
const WEB_APP_KEY_PATTERN = '^[a-zA-Z0-9-_]*[a-zA-Z0-9]$'

/** Tag keys, as in the provider's `awsResourceTags` definition. */
const RESOURCE_TAG_KEY_PATTERN = '^(?!aws:)[\\w./=+:\\-_\\x20]{1,128}$'

/**
 * Schema of one `webApps.<name>` entry. Closed: unknown keys are rejected.
 * Values that pass through to CloudFormation reuse the provider's definitions,
 * which accept intrinsics.
 */
const webAppConfigSchema = {
  type: 'object',
  properties: {
    entry: {
      description: `The file that starts the HTTP server, relative to the service directory (or the path inside a package.artifact zip).
@example entry: src/server.ts`,
      type: 'string',
      minLength: 1,
    },
    runtime: {
      description: `Lambda runtime: Node.js 24 or newer. Defaults to provider.runtime when that is nodejs24.x or newer, else nodejs24.x.
@default 'nodejs24.x'`,
      type: 'string',
      pattern: RUNTIME_PATTERN,
    },
    name: {
      description: `Lambda function name override: letters, digits, hyphens and underscores, up to 64 characters.
@default '<service>-<stage>-<key>'`,
      type: 'string',
      pattern: '^[a-zA-Z0-9-_]+$',
      maxLength: 64,
    },
    description: {
      description: `Web function description.`,
      type: 'string',
      maxLength: 256,
    },
    timeout: {
      description: `Request timeout in seconds (3-900).
@default provider.timeout when set, otherwise 30`,
      type: 'integer',
      minimum: 3,
      maximum: 900,
    },
    maxConcurrency: {
      description: `Concurrent requests per execution environment (1-128).`,
      type: 'integer',
      minimum: 1,
      maximum: 128,
    },
    environment: {
      description: `Environment variables, merged over provider.environment.`,
      $ref: '#/definitions/awsLambdaEnvironment',
    },
    logs: {
      description: `Log levels. Case-insensitive.`,
      type: 'object',
      properties: {
        applicationLogLevel: {
          anyOf: APPLICATION_LOG_LEVELS.map(caseInsensitive),
        },
        systemLogLevel: {
          anyOf: SYSTEM_LOG_LEVELS.map(caseInsensitive),
        },
      },
      additionalProperties: false,
    },
    logRetentionInDays: {
      description: `CloudWatch Logs retention period in days for both log groups.`,
      $ref: '#/definitions/awsLogRetentionInDays',
    },
    logDataProtectionPolicy: {
      description: `CloudWatch Logs data protection policy for both log groups. Overrides provider.logDataProtectionPolicy.`,
      $ref: '#/definitions/awsLogDataProtectionPolicy',
    },
    role: {
      description: `Execution role: an ARN, a role name, or a CloudFormation intrinsic.`,
      anyOf: [
        { $ref: '#/definitions/awsLambdaRole' },
        { $ref: '#/definitions/awsCfFunction' },
        { $ref: '#/definitions/awsCfIf' },
      ],
    },
    iam: getEntryIamSchema('web app'),
    vpc: {
      description: `VPC configuration. Overrides provider.vpc.`,
      $ref: '#/definitions/awsLambdaVpcConfig',
    },
    kmsKeyArn: {
      description: `KMS key ARN for environment encryption.`,
      $ref: '#/definitions/awsKmsArn',
    },
    tags: {
      description: `Resource tags, merged over provider.tags. Values may be CloudFormation intrinsics.`,
      type: 'object',
      // Keys as in awsResourceTags; values also accept intrinsics, which pass
      // through to the web function's Tags.
      patternProperties: {
        [RESOURCE_TAG_KEY_PATTERN]: {
          anyOf: [
            { type: 'string', maxLength: 256 },
            { $ref: '#/definitions/awsCfFunction' },
            { $ref: '#/definitions/awsCfIf' },
          ],
        },
      },
      additionalProperties: false,
    },
    package: {
      description: `Packaging overrides.`,
      type: 'object',
      properties: {
        patterns: { type: 'array', items: { type: 'string' } },
        artifact: { type: 'string' },
      },
      additionalProperties: false,
    },
    build: {
      description: `Build strategy, or \`false\` to skip building this web app.
@example build: false`,
      // Copied from the function `build` schema: the `false` branch comes
      // first and uses `const` (value equality, no coercion), because the
      // schema is compiled with ajv's `coerceTypes: 'array'` and a leading
      // `type: 'string'` branch would rewrite `false` to the string "false".
      anyOf: [{ const: false }, { type: 'string' }],
    },
    url: {
      description: `The web app's endpoint: \`true\` (public, the default) or its settings. A web app always has an endpoint, so \`false\` is not accepted.`,
      anyOf: [
        { const: true },
        {
          type: 'object',
          properties: {
            authorizer: {
              description: `Case-insensitive.`,
              anyOf: URL_AUTHORIZERS.map(caseInsensitive),
            },
            // An intrinsic passes through to the endpoint
            maxEnvironments: {
              anyOf: [
                { type: 'integer', minimum: 2, maximum: 10000 },
                { $ref: '#/definitions/awsCfFunction' },
              ],
            },
            rateLimit: {
              anyOf: [
                { enum: RATE_LIMIT_VALUES },
                { $ref: '#/definitions/awsCfFunction' },
              ],
            },
          },
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['entry'],
  additionalProperties: false,
}

/**
 * Define JSON Schema validation for the `webApps` top-level configuration.
 *
 * @param {object} serverless - Serverless framework instance
 */
export function defineWebAppsSchema(serverless) {
  if (!serverless.configSchemaHandler) return
  serverless.configSchemaHandler.defineTopLevelProperty('webApps', {
    type: 'object',
    patternProperties: { [WEB_APP_KEY_PATTERN]: webAppConfigSchema },
    additionalProperties: false,
  })
}

export { webAppConfigSchema }
