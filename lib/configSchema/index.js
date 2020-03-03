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
    plugins: {
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
    },
    resources: {
      anyOf: [{ type: 'null' }, { type: 'object' }],
    },
    functions: {
      type: 'object',
      patternProperties: {
        [functionNamePattern]: {
          type: 'object',
          properties: {
            handler: { type: 'string' },
            name: { type: 'string' }, // name property is added by service class
            events: {
              type: 'array',
              items: {}, // schema for each event is defined by plugins
            },
          },
          required: ['handler'],

          // TODO: Set this 'additionalProperties' to 'false' after the schema
          // for all function's properties is defined. For example, props like
          // provisionedConcurrency, memorySize, reservedConcurrency, runtime, etc.
          // should be described in this schema.
          additionalProperties: true,
        },
      },
      additionalProperties: false,
    },
    provider: {
      type: 'object',
      properties: {
        name: {
          enum: [
            'aws',
            'azure',
            'tencent',
            'google',
            'knative',
            'aliyun',
            'cloudflare',
            'fn',
            'kubeless',
            'openwhisk',
            'spotinst',
          ],
        },
      },
      // additionalProperties: false,
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
    layers: {
      anyOf: [{ type: 'object' }, { type: 'null' }],
    },
    outputs: { type: 'null' }, // outputs is deprecated
  },
  additionalProperties: false,
};

module.exports = schema;
