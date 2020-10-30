'use strict';

const functionNamePattern = '^[a-zA-Z0-9-_]+$';

const schema = {
  type: 'object',
  properties: {
    /*
     * Modes for config validation:
     *  - error: the error is thrown
     *  - warn: logs error to console without throwing an error
     *  - off: disables validation at all
     *
     *  The default is `warn`, and will be set to `error` in v2
     */
    configValidationMode: { enum: ['error', 'warn', 'off'] },
    custom: {
      type: 'object',
      properties: {},
      required: [],
      // User is free to add any properties for its own purpose
    },
    disabledDeprecations: {
      anyOf: [
        { const: '*' },
        {
          type: 'array',
          items: { $ref: '#/definitions/errorCode' },
        },
      ],
    },
    enableLocalInstallationFallback: { type: 'boolean' },
    frameworkVersion: { type: 'string' },
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
    /*
     * Provider specific properties are extended in respected provider plugins.
     */
    provider: {
      type: 'object',
      properties: {
        // "name" is configured as const by loaded provider
      },
      required: ['name'],
      additionalProperties: false,
    },
    service: {
      type: 'object',
      properties: {
        name: { pattern: '^[a-zA-Z][0-9a-zA-Z-]+$' },
        awsKmsKeyArn: { $ref: '#/definitions/awsKmsArn' },
      },
      additionalProperties: false,
    },
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
