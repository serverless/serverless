'use strict';

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

const packageSchema = {
  type: 'object',
  properties: {
    individually: { type: 'boolean' },
    path: { type: 'string' },
    artifact: { type: 'string' },
    exclude: { type: 'array', items: { type: 'string' } },
    include: { type: 'array', items: { type: 'string' } },
    excludeDevDependencies: { type: 'boolean' },
  },
  additionalProperties: false,
};

const schema = {
  type: 'object',
  properties: {
    service: {
      type: 'object',
      properties: {
        name: { pattern: '^[a-zA-Z][0-9a-zA-Z-]+$' },
        awsKmsKeyArn: { $ref: '#/definitions/awsKmsArn' },
      },
      additionalProperties: false,
    },
    frameworkVersion: { type: 'string' },
    disabledDeprecations: {
      anyOf: [
        { const: '*' },
        { $ref: '#/definitions/errorCode' },
        {
          type: 'array',
          items: { $ref: '#/definitions/errorCode' },
        },
      ],
    },
    enableLocalInstallationFallback: { type: 'boolean' },

    custom: {
      type: 'object',
      properties: {},
      required: [],
      // User is free to add any properties for its own purpose
    },
    plugins: {
      anyOf: [
        {
          type: 'object',
          properties: {
            localPath: { type: 'string' },
            modules: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
          required: ['modules'],
        },
        { type: 'array', items: { type: 'string' } },
      ],
    },

    functions: {
      type: 'object',
      patternProperties: {
        [functionNamePattern]: {
          type: 'object',
          properties: {
            name: { type: 'string' }, // name property is added by service class
            events: {
              type: 'array',
              items: {
                /*
                 * `anyOf` array by JSON schema spec cannot be empty, threfore we start
                 * with one dummy item as workaround to ensure it validates against
                 * any undefined function events.
                 */
                anyOf: [
                  {
                    type: 'object',
                    properties: { __schemaWorkaround__: { const: null } },
                    required: ['__schemaWorkaround__'],
                    additionalProperties: false,
                  },
                ],
              },
            },
          },

          /*
           * Schema for function properties is extended by a provider plugin.
           * For example, in the context of AWS provider props like
           * provisionedConcurrency, memorySize, reservedConcurrency, etc.
           * should be extended by awsProvider plugin.
           */
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },

    /*
     * Provider specific properties are extended in respected provider plugins.
     */
    provider: {
      type: 'object',
      properties: {},
      required: ['name'],
      additionalProperties: false,
    },

    package: packageSchema,

    layers: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          allowedAccounts: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'integer', minimum: 100000000000, maximum: 999999999999 },
                { type: 'string', pattern: '^\\d{12}$' },
                { const: '*' },
              ],
            },
          },
          compatibleRuntimes: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          description: { type: 'string', maxLength: 256 },
          licenseInfo: { type: 'string', maxLength: 512 },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 140,
            pattern:
              '^((arn:[a-zA-Z0-9-]+:lambda:[a-zA-Z0-9-]+:\\d{12}:layer:[a-zA-Z0-9-_]+)|[a-zA-Z0-9-_]+)$',
          },
          package: packageSchema,
          path: { type: 'string' },
          retain: { type: 'boolean' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },

    /*
     * Modes for config validation:
     *  - error: the error is thrown
     *  - warn: logs error to console without throwing an error
     *  - off: disables validation at all
     *
     *  The default is `warn`, and will be set to `error` in v2
     */
    configValidationMode: { enum: ['error', 'warn', 'off'] },
  },
  additionalProperties: false,
  required: ['provider', 'service'],
  definitions: {
    // TODO: awsKmsArn definition to be moved to lib/plugins/aws/provider/awsProvider.js once service.awsKmsKeyArn removed with v3.0.0, see https://github.com/serverless/serverless/issues/8261
    // TODO: awsKmsArn to include #/definitions/awsCfFunction instead of type: object as one of the possible definition, see https://github.com/serverless/serverless/issues/8261
    awsKmsArn: {
      anyOf: [{ type: 'object' }, { type: 'string', pattern: '^arn:aws[a-z-]*:kms' }],
    },
    errorCode: {
      type: 'string',
      pattern: '^[A-Z0-9_]+$',
    },
    functionName: {
      type: 'string',
      pattern: functionNamePattern,
    },
  },
};

module.exports = schema;
