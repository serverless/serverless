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

    app: { type: 'string' },
    org: { type: 'string' },
    custom: { type: 'object', properties: {} },
    plugins: { type: 'array', items: { type: 'string' } },
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
              items: {}, // event plugins push their schemas to this array
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
      properties: {
        name: { enum: [] },
      },
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

    layers: { type: 'object' },
  },
};

module.exports = schema;
