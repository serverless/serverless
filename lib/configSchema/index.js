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
      anyOf: [{ type: 'null' }, { type: 'array', items: { type: 'string' } }],
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
              items: {}, // schema for each event is extended by plugins
            },
          },
          required: ['handler'],

          /*
           * Schema for function properties is extended by a provider plugin.
           * For example, in the context of AWS provider props like
           * provisionedConcurrency, memorySize, reservedConcurrency, etc.
           * should be extended by awsProvider plugin.
           */
          additionalProperties: true,
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
        name: {
          enum: [
            'fn',
            'aws',
            'azure',
            'aliyun',
            'google',
            'tencent',
            'knative',
            'spotinst',
            'kubeless',
            'openwhisk',
            'cloudflare',
          ],
        },
      },
      required: ['name'],
      additionalProperties: false,
    },

    package: {
      type: 'object',
      properties: {
        individually: { type: 'boolean' },
        path: { type: 'string' }, // I assume this is string as this property was addded automatically
        artifact: { type: 'string' },
        exclude: { type: 'array', items: { type: 'string' } },
        include: { type: 'array', items: { type: 'string' } },
        excludeDevDependencies: { type: 'boolean' },
      },
      additionalProperties: false,
    },

    layers: {
      anyOf: [{ type: 'null' }, { type: 'object' }],
    },

    outputs: { type: 'null' }, // outputs is deprecated
  },

  // There is no need in this property becase userConfig object received
  // from service.validate() already has list of predefined root properties
  //
  // additionalProperties: false,
};

module.exports = schema;
