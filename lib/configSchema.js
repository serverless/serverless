'use strict';

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

const schema = {
  type: 'object',
  properties: {
    service: {
      type: 'object',
      properties: {
        name: { pattern: '^[a-zA-Z][0-9a-zA-Z-]+$' },
        awsKmsKeyArn: { pattern: '^arn:(aws[a-zA-Z-]*)?:kms:[a-z0-9-]+-\\d+:\\d{12}:[^\\s]+$' },
      },
      additionalProperties: false,
    },

    custom: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: true, // user is free to add properties that he or she wants
    },
    plugins: { type: 'array', items: { type: 'string' } },

    // TODO: Complete schema, see https://github.com/serverless/serverless/issues/8014
    resources: { type: 'object' },

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

    package: {
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
    },

    // TODO: Complete schema, see https://github.com/serverless/serverless/issues/8015
    layers: { type: 'object' },

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
  requiredProperties: ['provider', 'service'],
  definitions: {
    awsArn: {
      type: 'string',
      pattern: '^arn:',
    },
  },
};

module.exports = schema;
