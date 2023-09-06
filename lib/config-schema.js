'use strict';

const functionNamePattern = '^[a-zA-Z0-9-_]+$';
const stagePattern = '^[a-zA-Z0-9-]+$';

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
    // Deprecated
    console: { anyOf: [{ type: 'boolean' }, { type: 'object' }] },
    custom: {
      type: 'object',
      properties: {},
      required: [],
      // User is free to add any properties for its own purpose
    },
    dashboard: {
      type: 'object',
      properties: { disableMonitoring: { type: 'boolean' } },
      additionalProperties: false,
    },
    deprecationNotificationMode: {
      enum: ['error', 'warn', 'warn:summary'],
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
        artifact: { type: 'string' },
        exclude: { type: 'array', items: { type: 'string' } },
        excludeDevDependencies: { type: 'boolean' },
        include: { type: 'array', items: { type: 'string' } },
        individually: { type: 'boolean' },
        path: { type: 'string' },
        patterns: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    params: {
      type: 'object',
      patternProperties: {
        [stagePattern]: {
          type: 'object',
        },
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
    projectDir: {
      type: 'string',
      pattern: '^(\\.\\/?|(\\.\\/)?\\.\\.(\\/\\.\\.)*\\/?)$',
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
    service: { $ref: '#/definitions/serviceName' },
    useDotenv: { const: true },
    variablesResolutionMode: { type: 'string', enum: ['20210219', '20210326'] },
  },
  additionalProperties: false,
  required: ['provider', 'service'],
  definitions: {
    errorCode: {
      type: 'string',
      pattern: '^[A-Z0-9_]+$',
    },
    functionName: {
      type: 'string',
      pattern: functionNamePattern,
    },
    serviceName: { type: 'string', pattern: '^[a-zA-Z][0-9a-zA-Z-]+$' },
    stage: { type: 'string', pattern: stagePattern },
  },
};

module.exports = schema;
