const functionNamePattern = '^[a-zA-Z0-9-_]+$'
const stagePattern = '^[a-zA-Z0-9-]+$'

const schema = {
  type: 'object',
  properties: {
    /**
     * Org Name
     * Alphanumeric, lowercase only
     * Validation copied from Serverless Platform as of 01/2024
     * Except for the min length, which was 5, but is now 2
     */
    org: {
      description: `Serverless Platform organization name.`,
      type: 'string',
      pattern: '^[a-z0-9]*$',
      minLength: 2,
      maxLength: 39,
    },
    /**
     * App Name
     * Alphanumeric, lowercase only, hyphens allowed,
     * cannot start or end with hyphen, no double hyphens
     * Validation copied from Serverless Platform as of 01/2024
     * Except for the min length, which was 5, but is now 2
     */
    app: {
      description: `Serverless Platform application name.`,
      type: 'string',
      pattern: '^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$',
      minLength: 2,
      maxLength: 39,
    },
    /**
     * Outputs
     * Can be string, number, boolean, array, or object
     * For use with the Serverless Platform's Outputs feature
     */
    outputs: {
      description: `Service outputs accessible by other services via the Serverless Platform.`,
      type: 'object',
      additionalProperties: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'array' },
          { type: 'object' },
        ],
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
    configValidationMode: {
      description: `Config validation strictness: 'warn', 'error', or 'off'.`,
      enum: ['error', 'warn', 'off'],
    },
    // Deprecated
    console: { anyOf: [{ type: 'boolean' }, { type: 'object' }] },
    custom: {
      description: `Custom variables accessible via \${self:custom.xxx}.`,
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
      description: `How to handle deprecation warnings.`,
      enum: ['error', 'warn', 'warn:summary'],
    },
    disabledDeprecations: {
      description: `Array of deprecation codes to suppress.
@example ['LAMBDA_HASHING_VERSION_V2']`,
      anyOf: [
        { const: '*' },
        {
          type: 'array',
          items: { $ref: '#/definitions/errorCode' },
        },
      ],
    },
    build: {
      description: `Native build configuration for TypeScript/JavaScript bundling.
@since v4
@see https://www.serverless.com/framework/docs/providers/aws/guide/building
@example
build:
  esbuild:
    bundle: true`,
      anyOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {},
        },
      ],
    },
    frameworkVersion: {
      type: 'string',
      description: `Serverless Framework version constraint (e.g., '3', '>=2.0.0 <4.0.0').
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#root-properties
@example '4'`,
    },
    functions: {
      description: `Function definitions for the service.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions
@example
functions:
  hello:
    handler: handler.hello`,
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
    licenseKey: {
      description: `Serverless Framework license key.
@since v4
@see https://www.serverless.com/framework/docs/guides/license-keys
@example '\${env:SERVERLESS_LICENSE_KEY}'`,
      type: 'string',
    },
    package: {
      description: `Packaging configuration for deployment artifacts.`,
      type: 'object',
      properties: {
        artifact: {
          description: `Path to a pre-built deployment artifact.
@see https://www.serverless.com/framework/docs/providers/aws/guide/packaging#artifact
@example '.serverless/my-artifact.zip'`,
          type: 'string',
        },
        exclude: {
          description: `Glob patterns of files to exclude.
@deprecated Use patterns instead.`,
          type: 'array',
          items: { type: 'string' },
        },
        excludeDevDependencies: {
          description: `Whether to exclude devDependencies from the package.
@see https://www.serverless.com/framework/docs/providers/aws/guide/packaging#development-dependencies
@default true`,
          type: 'boolean',
        },
        include: {
          description: `Glob patterns of files to include.
@deprecated Use patterns instead.`,
          type: 'array',
          items: { type: 'string' },
        },
        individually: {
          description: `Package each function as an individual artifact.
@see https://www.serverless.com/framework/docs/providers/aws/guide/packaging#packaging-functions-separately
@default false`,
          type: 'boolean',
        },
        path: {
          description: `Path to a pre-existing package directory.`,
          type: 'string',
        },
        patterns: {
          description: `Glob patterns for including/excluding files (prefix with ! to exclude).
@see https://www.serverless.com/framework/docs/providers/aws/guide/packaging#patterns
@example ['!node_modules/**', 'src/**']`,
          type: 'array',
          items: { type: 'string' },
        },
      },
      additionalProperties: false,
    },
    params: {
      description: `Stage-specific parameters accessible via \${param:xxx}.
@deprecated Use stages instead.`,
      type: 'object',
      patternProperties: {
        [stagePattern]: {
          type: 'object',
        },
      },
      additionalProperties: false,
    },
    stages: {
      description: `Stage-specific configuration for parameters, observability, and integrations.
@since v4
@see https://www.serverless.com/framework/docs/guides/stages
@example
stages:
  default:
    params:
      tableName: users`,
      type: 'object',
      patternProperties: {
        [stagePattern]: {
          type: 'object',
          properties: {
            observability: {
              anyOf: [
                { type: 'boolean' },
                { enum: ['axiom', 'dashboard'] },
                {
                  type: 'object',
                  properties: {
                    provider: { enum: ['axiom', 'dashboard'] },
                    dataset: { type: 'string' },
                  },
                  required: ['provider'],
                  additionalProperties: false,
                },
              ],
            },
            resolvers: {
              type: 'object',
            },
          },
        },
      },
      additionalProperties: false,
    },
    plugins: {
      description: `Plugins to extend Serverless functionality.
@see https://www.serverless.com/framework/docs/guides/plugins/creating-plugins
@example ['serverless-offline', 'serverless-webpack']`,
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
      description: `AWS provider configuration.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml
@example
provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1`,
      type: 'object',
      properties: {
        // "name" is configured as const by loaded provider
      },
      required: ['name'],
      additionalProperties: false,
    },
    service: {
      $ref: '#/definitions/serviceName',
      description: `Service name or configuration object.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml
@example service: my-service`,
    },
    state: {
      anyOf: [
        {
          type: 'object',
          properties: {
            resolver: { type: 'string' },
          },
          additionalProperties: false,
          required: ['resolver'],
        },
        { type: 'string' },
      ],
    },
    useDotenv: {
      description: `Enable loading environment variables from .env files.`,
      const: true,
    },
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
    serviceName: {
      type: 'string',
      pattern: '^[a-zA-Z][0-9a-zA-Z-]+$',
      description: `Service name value used by the framework to group and namespace resources.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml`,
    },
    stage: { type: 'string', pattern: stagePattern },
  },
}

export default schema
