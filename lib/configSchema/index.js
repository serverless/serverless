'use strict';

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

const schema = {
  type: 'object',
  properties: {
    app: { type: 'string' },
    org: { type: 'string' },
    service: {
      type: 'object',
      properties: {
        name: { pattern: '^[a-zA-Z][0-9a-zA-Z-]+$' },
      },
    },
    custom: { type: 'object', properties: {} },
    provider: {
      type: 'object',
      properties: {
        name: { enum: ['aws', 'azure'] },
      },
      // additionalProperties: false,
    },
    resources: { type: 'object', properties: {} },
    layers: {
      anyOf: [{ type: 'object' }, { type: 'null' }],
    },
    plugins: {
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
    },
    functions: {
      type: 'object',
      patternProperties: {
        [functionNamePattern]: {
          type: 'object',
          properties: {
            handler: { type: 'string' },
            name: { type: 'string' }, // added
            events: {
              type: 'array',
              items: {
                anyOf: [placeholderForEventSchema('s3'), placeholderForEventSchema('http')],
              },
            },
          },
          required: ['handler'],

          // TODO: Set additionalProperties to false after the schema
          // for all props is defined. For example, add schema for  props like
          // provisionedConcurrency, memorySize, reservedConcurrency, runtime,
          // etc.
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
    package: {
      type: 'object',
      properties: {
        individually: { type: 'boolean' },
        path: { type: 'string' }, // I assume this is sting as this property was addded automatically
        artifact: { type: 'string' },
        exclude: { type: 'array', items: { type: 'string' } },
        include: { type: 'array', items: { type: 'string' } },
        excludeDevDependencies: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

function placeholderForEventSchema(name) {
  return {
    type: 'object',
    properties: {
      [name]: {
        anyOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: {},
          },
        ],
      },
    },
    required: [name],
    additionalProperties: false,
  };
}

module.exports = schema;
