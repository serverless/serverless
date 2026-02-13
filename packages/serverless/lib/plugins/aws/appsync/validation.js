import Ajv from 'ajv'
import ajvErrors from 'ajv-errors'
import addFormats from 'ajv-formats'
import { timeUnits } from './utils.js'

const AUTH_TYPES = [
  'AMAZON_COGNITO_USER_POOLS',
  'AWS_LAMBDA',
  'OPENID_CONNECT',
  'AWS_IAM',
  'API_KEY',
]

const DATASOURCE_TYPES = [
  'AMAZON_DYNAMODB',
  'AMAZON_OPENSEARCH_SERVICE',
  'AWS_LAMBDA',
  'HTTP',
  'NONE',
  'RELATIONAL_DATABASE',
  'AMAZON_EVENTBRIDGE',
]

export const appSyncSchema = {
  type: 'object',
  description: `Schema for \`appSync\` top-level configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/appsync`,
  definitions: {
    stringOrIntrinsicFunction: {
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          required: [],
          additionalProperties: true,
        },
      ],
      errorMessage: 'must be a string or a CloudFormation intrinsic function',
    },
    lambdaFunctionConfig: {
      description: `Lambda resolver/authorizer reference.
@remarks Exactly one of \`functionName\`, \`functionArn\`, or \`function\` must be provided.`,
      oneOf: [
        {
          type: 'object',
          properties: {
            functionName: { type: 'string' },
            functionAlias: { type: 'string' },
          },
          required: ['functionName'],
        },
        {
          type: 'object',
          properties: {
            functionArn: {
              $ref: '#/definitions/stringOrIntrinsicFunction',
            },
          },
          required: ['functionArn'],
        },
        {
          type: 'object',
          properties: {
            function: { type: 'object' },
          },
          required: ['function'],
        },
      ],
      errorMessage:
        'must specify functionName, functionArn or function (all exclusives)',
    },
    auth: {
      type: 'object',
      title: 'Authentication',
      description: `Authentication type and definition.
@see https://www.serverless.com/framework/docs/providers/aws/events/appsync`,
      properties: {
        type: {
          type: 'string',
          enum: AUTH_TYPES,
          errorMessage: `must be one of ${AUTH_TYPES.join(', ')}`,
        },
      },
      if: { properties: { type: { const: 'AMAZON_COGNITO_USER_POOLS' } } },
      then: {
        properties: { config: { $ref: '#/definitions/cognitoAuth' } },
        required: ['config'],
      },
      else: {
        if: { properties: { type: { const: 'AWS_LAMBDA' } } },
        then: {
          properties: { config: { $ref: '#/definitions/lambdaAuth' } },
          required: ['config'],
        },
        else: {
          if: { properties: { type: { const: 'OPENID_CONNECT' } } },
          then: {
            properties: { config: { $ref: '#/definitions/oidcAuth' } },
            required: ['config'],
          },
        },
      },
      required: ['type'],
    },
    cognitoAuth: {
      type: 'object',
      properties: {
        userPoolId: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        awsRegion: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        defaultAction: {
          type: 'string',
          enum: ['ALLOW', 'DENY'],
          errorMessage: 'must be "ALLOW" or "DENY"',
        },
        appIdClientRegex: { $ref: '#/definitions/stringOrIntrinsicFunction' },
      },
      required: ['userPoolId'],
    },
    lambdaAuth: {
      type: 'object',
      oneOf: [{ $ref: '#/definitions/lambdaFunctionConfig' }],
      properties: {
        // Note: functionName and functionArn are already defined in #/definitions/lambdaFunctionConfig
        // But if not also defined here, TypeScript shows an error.
        functionName: { type: 'string' },
        functionArn: { type: 'string' },
        identityValidationExpression: { type: 'string' },
        authorizerResultTtlInSeconds: { type: 'number' },
      },
      required: [],
    },
    oidcAuth: {
      type: 'object',
      properties: {
        issuer: { type: 'string' },
        clientId: { type: 'string' },
        iatTTL: { type: 'number' },
        authTTL: { type: 'number' },
      },
      required: ['issuer'],
    },
    iamAuth: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          const: 'AWS_IAM',
        },
      },
      required: ['type'],
      errorMessage: 'must be a valid IAM config',
    },
    apiKeyAuth: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          const: 'API_KEY',
        },
      },
      required: ['type'],
      errorMessage: 'must be a valid API_KEY config',
    },
    visibilityConfig: {
      type: 'object',
      properties: {
        cloudWatchMetricsEnabled: { type: 'boolean' },
        name: { type: 'string' },
        sampledRequestsEnabled: { type: 'boolean' },
      },
      required: [],
    },
    wafRule: {
      anyOf: [
        { type: 'string', enum: ['throttle', 'disableIntrospection'] },
        {
          type: 'object',
          properties: {
            disableIntrospection: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                priority: { type: 'integer' },
                visibilityConfig: { $ref: '#/definitions/visibilityConfig' },
              },
            },
          },
          required: ['disableIntrospection'],
        },
        {
          type: 'object',
          properties: {
            throttle: {
              oneOf: [
                { type: 'integer', minimum: 100 },
                {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    action: {
                      type: 'string',
                      enum: ['Allow', 'Block'],
                    },
                    aggregateKeyType: {
                      type: 'string',
                      enum: ['IP', 'FORWARDED_IP'],
                    },
                    limit: { type: 'integer', minimum: 100 },
                    priority: { type: 'integer' },
                    scopeDownStatement: { type: 'object' },
                    forwardedIPConfig: {
                      type: 'object',
                      properties: {
                        headerName: {
                          type: 'string',
                          pattern: '^[a-zA-Z0-9-]+$',
                        },
                        fallbackBehavior: {
                          type: 'string',
                          enum: ['MATCH', 'NO_MATCH'],
                        },
                      },
                      required: ['headerName', 'fallbackBehavior'],
                    },
                    visibilityConfig: {
                      $ref: '#/definitions/visibilityConfig',
                    },
                  },
                  required: [],
                },
              ],
            },
          },
          required: ['throttle'],
        },
        { $ref: '#/definitions/customWafRule' },
      ],
      errorMessage: 'must be a valid WAF rule',
    },
    customWafRule: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        priority: { type: 'number' },
        action: {
          type: 'string',
          enum: ['Allow', 'Block', 'Count', 'Captcha'],
        },
        statement: { type: 'object', required: [] },
        visibilityConfig: { $ref: '#/definitions/visibilityConfig' },
      },
      required: ['name', 'statement'],
    },
    substitutions: {
      type: 'object',
      additionalProperties: {
        $ref: '#/definitions/stringOrIntrinsicFunction',
      },
      required: [],
      errorMessage: 'must be a valid substitutions definition',
    },
    environment: {
      type: 'object',
      additionalProperties: {
        $ref: '#/definitions/stringOrIntrinsicFunction',
      },
      required: [],
      errorMessage: 'must be a valid environment definition',
    },
    dataSource: {
      description: `Data source configuration reference used by resolvers.`,
      if: { type: 'object' },
      then: { $ref: '#/definitions/dataSourceConfig' },
      else: {
        type: 'string',
        errorMessage: 'must be a string or data source definition',
      },
    },
    resolverConfig: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['UNIT', 'PIPELINE'],
          errorMessage: 'must be "UNIT" or "PIPELINE"',
        },
        type: { type: 'string' },
        field: { type: 'string' },
        maxBatchSize: { type: 'number', minimum: 1, maximum: 2000 },
        code: { type: 'string' },
        request: { type: 'string' },
        response: { type: 'string' },
        sync: { $ref: '#/definitions/syncConfig' },
        substitutions: { $ref: '#/definitions/substitutions' },
        caching: { $ref: '#/definitions/resolverCachingConfig' },
      },
      if: { properties: { kind: { const: 'UNIT' } }, required: ['kind'] },
      then: {
        properties: {
          dataSource: { $ref: '#/definitions/dataSource' },
        },
        required: ['dataSource'],
      },
      else: {
        properties: {
          functions: {
            type: 'array',
            items: { $ref: '#/definitions/pipelineFunction' },
          },
        },
        required: ['functions'],
      },
      required: [],
    },
    resolverConfigMap: {
      type: 'object',
      patternProperties: {
        // Type.field keys, type and field are not required
        '^[_A-Za-z][_0-9A-Za-z]*\\.[_A-Za-z][_0-9A-Za-z]*$': {
          $ref: '#/definitions/resolverConfig',
        },
      },
      additionalProperties: {
        // Other keys, type and field are required
        allOf: [
          { $ref: '#/definitions/resolverConfig' },
          { type: 'object', required: ['type', 'field'] },
        ],
        errorMessage: {
          required: {
            type: 'resolver definitions that do not specify Type.field in the key must specify the type and field as properties',
            field:
              'resolver definitions that do not specify Type.field in the key must specify the type and field as properties',
          },
        },
      },
      required: [],
    },
    pipelineFunctionConfig: {
      type: 'object',
      properties: {
        dataSource: { $ref: '#/definitions/dataSource' },
        description: { type: 'string' },
        request: { type: 'string' },
        response: { type: 'string' },
        sync: { $ref: '#/definitions/syncConfig' },
        maxBatchSize: { type: 'number', minimum: 1, maximum: 2000 },
        substitutions: { $ref: '#/definitions/substitutions' },
      },
      required: ['dataSource'],
    },
    pipelineFunction: {
      if: { type: 'object' },
      then: { $ref: '#/definitions/pipelineFunctionConfig' },
      else: {
        type: 'string',
        errorMessage: 'must be a string or function definition',
      },
    },
    pipelineFunctionConfigMap: {
      type: 'object',
      additionalProperties: {
        if: { type: 'object' },
        then: { $ref: '#/definitions/pipelineFunctionConfig' },
        else: {
          type: 'string',
          errorMessage: 'must be a string or an object',
        },
      },
      required: [],
    },
    resolverCachingConfig: {
      oneOf: [
        { type: 'boolean' },
        {
          type: 'object',
          properties: {
            ttl: { type: 'integer', minimum: 1, maximum: 3600 },
            keys: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: [],
        },
      ],
      errorMessage: 'must be a valid resolver caching config',
    },
    syncConfig: {
      type: 'object',
      if: { properties: { conflictHandler: { const: ['LAMBDA'] } } },
      then: { $ref: '#/definitions/lambdaFunctionConfig' },
      properties: {
        functionArn: { type: 'string' },
        functionName: { type: 'string' },
        conflictDetection: { type: 'string', enum: ['VERSION', 'NONE'] },
        conflictHandler: {
          type: 'string',
          enum: ['LAMBDA', 'OPTIMISTIC_CONCURRENCY', 'AUTOMERGE'],
        },
      },
      required: [],
    },
    iamRoleStatements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          Effect: { type: 'string', enum: ['Allow', 'Deny'] },
          Action: { type: 'array', items: { type: 'string' } },
          Resource: {
            oneOf: [
              { $ref: '#/definitions/stringOrIntrinsicFunction' },
              {
                type: 'array',
                items: { $ref: '#/definitions/stringOrIntrinsicFunction' },
              },
            ],
            errorMessage: 'contains invalid resolver definitions',
          },
        },
        required: ['Effect', 'Action', 'Resource'],
        errorMessage: 'must be a valid IAM role statement',
      },
    },
    dataSourceConfig: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: DATASOURCE_TYPES,
          errorMessage: `must be one of ${DATASOURCE_TYPES.join(', ')}`,
        },
        description: { type: 'string' },
      },
      if: { properties: { type: { const: 'AMAZON_DYNAMODB' } } },
      then: {
        properties: { config: { $ref: '#/definitions/dataSourceDynamoDb' } },
        required: ['config'],
      },
      else: {
        if: { properties: { type: { const: 'AWS_LAMBDA' } } },
        then: {
          properties: {
            config: { $ref: '#/definitions/datasourceLambdaConfig' },
          },
          required: ['config'],
        },
        else: {
          if: { properties: { type: { const: 'HTTP' } } },
          then: {
            properties: {
              config: { $ref: '#/definitions/dataSourceHttpConfig' },
            },
            required: ['config'],
          },
          else: {
            if: {
              properties: {
                type: { const: 'AMAZON_OPENSEARCH_SERVICE' },
              },
            },
            then: {
              properties: {
                config: { $ref: '#/definitions/datasourceEsConfig' },
              },
              required: ['config'],
            },
            else: {
              if: { properties: { type: { const: 'RELATIONAL_DATABASE' } } },
              then: {
                properties: {
                  config: {
                    $ref: '#/definitions/datasourceRelationalDbConfig',
                  },
                },
                required: ['config'],
              },
              else: {
                if: { properties: { type: { const: 'AMAZON_EVENTBRIDGE' } } },
                then: {
                  properties: {
                    config: {
                      $ref: '#/definitions/datasourceEventBridgeConfig',
                    },
                  },
                  required: ['config'],
                },
              },
            },
          },
        },
      },
      required: ['type'],
    },
    dataSourceHttpConfig: {
      type: 'object',
      properties: {
        endpoint: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        serviceRoleArn: {
          $ref: '#/definitions/stringOrIntrinsicFunction',
        },
        iamRoleStatements: {
          $ref: '#/definitions/iamRoleStatements',
        },
        authorizationConfig: {
          type: 'object',
          properties: {
            authorizationType: {
              type: 'string',
              enum: ['AWS_IAM'],
              errorMessage: 'must be AWS_IAM',
            },
            awsIamConfig: {
              type: 'object',
              properties: {
                signingRegion: {
                  $ref: '#/definitions/stringOrIntrinsicFunction',
                },
                signingServiceName: {
                  $ref: '#/definitions/stringOrIntrinsicFunction',
                },
              },
              required: ['signingRegion'],
            },
          },
          required: ['authorizationType', 'awsIamConfig'],
        },
      },
      required: ['endpoint'],
    },
    dataSourceDynamoDb: {
      type: 'object',
      properties: {
        tableName: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        useCallerCredentials: { type: 'boolean' },
        serviceRoleArn: {
          $ref: '#/definitions/stringOrIntrinsicFunction',
        },
        region: {
          $ref: '#/definitions/stringOrIntrinsicFunction',
        },
        iamRoleStatements: {
          $ref: '#/definitions/iamRoleStatements',
        },
        versioned: { type: 'boolean' },
        deltaSyncConfig: {
          type: 'object',
          properties: {
            deltaSyncTableName: { type: 'string' },
            baseTableTTL: { type: 'integer' },
            deltaSyncTableTTL: { type: 'integer' },
          },
          required: ['deltaSyncTableName'],
        },
      },
      required: ['tableName'],
    },
    datasourceRelationalDbConfig: {
      type: 'object',
      properties: {
        region: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        relationalDatabaseSourceType: {
          type: 'string',
          enum: ['RDS_HTTP_ENDPOINT'],
        },
        serviceRoleArn: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        dbClusterIdentifier: {
          $ref: '#/definitions/stringOrIntrinsicFunction',
        },
        databaseName: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        schema: { type: 'string' },
        awsSecretStoreArn: {
          $ref: '#/definitions/stringOrIntrinsicFunction',
        },
        iamRoleStatements: {
          $ref: '#/definitions/iamRoleStatements',
        },
      },
      required: ['awsSecretStoreArn', 'dbClusterIdentifier'],
    },
    datasourceLambdaConfig: {
      type: 'object',
      oneOf: [
        {
          $ref: '#/definitions/lambdaFunctionConfig',
        },
      ],
      properties: {
        functionName: { type: 'string' },
        functionArn: {
          $ref: '#/definitions/stringOrIntrinsicFunction',
        },
        serviceRoleArn: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        iamRoleStatements: { $ref: '#/definitions/iamRoleStatements' },
      },
      required: [],
    },
    datasourceEsConfig: {
      type: 'object',
      oneOf: [
        {
          oneOf: [
            {
              type: 'object',
              properties: {
                endpoint: { $ref: '#/definitions/stringOrIntrinsicFunction' },
              },
              required: ['endpoint'],
            },
            {
              type: 'object',
              properties: {
                domain: { $ref: '#/definitions/stringOrIntrinsicFunction' },
              },
              required: ['domain'],
            },
          ],
          errorMessage: 'must have a endpoint or domain (but not both)',
        },
      ],
      properties: {
        endpoint: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        domain: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        region: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        serviceRoleArn: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        iamRoleStatements: { $ref: '#/definitions/iamRoleStatements' },
      },
      required: [],
    },
    datasourceEventBridgeConfig: {
      type: 'object',
      properties: {
        eventBusArn: { $ref: '#/definitions/stringOrIntrinsicFunction' },
      },
      required: ['eventBusArn'],
    },
  },
  properties: {
    name: { type: 'string' },
    authentication: { $ref: '#/definitions/auth' },
    schema: {
      anyOf: [
        {
          type: 'string',
        },
        {
          type: 'array',
          items: { type: 'string' },
        },
      ],
      errorMessage: 'must be a valid schema config',
    },
    domain: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        useCloudFormation: { type: 'boolean' },
        retain: { type: 'boolean' },
        name: {
          type: 'string',
          pattern: '^([a-z][a-z0-9+-]*\\.)+[a-z][a-z0-9]*$',
          errorMessage: 'must be a valid domain name',
        },
        certificateArn: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        hostedZoneId: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        hostedZoneName: {
          type: 'string',
          pattern: '^([a-z][a-z0-9+-]*\\.)+[a-z][a-z0-9]*\\.$',
          errorMessage:
            'must be a valid zone name. Note: you must include a trailing dot (eg: `example.com.`)',
        },
        route53: { type: 'boolean' },
      },
      required: ['name'],
      if: {
        anyOf: [
          {
            not: { properties: { useCloudFormation: { const: false } } },
          },
          { not: { required: ['useCloudFormation'] } },
        ],
      },
      then: {
        anyOf: [
          { required: ['certificateArn'] },
          { required: ['hostedZoneId'] },
        ],
        errorMessage:
          'when using CloudFormation, you must provide either certificateArn or hostedZoneId.',
      },
    },
    xrayEnabled: { type: 'boolean' },
    visibility: {
      type: 'string',
      enum: ['GLOBAL', 'PRIVATE'],
      errorMessage: 'must be "GLOBAL" or "PRIVATE"',
    },
    introspection: { type: 'boolean' },
    queryDepthLimit: { type: 'integer', minimum: 1, maximum: 75 },
    resolverCountLimit: { type: 'integer', minimum: 1, maximum: 1000 },
    substitutions: { $ref: '#/definitions/substitutions' },
    environment: { $ref: '#/definitions/environment' },
    waf: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
      },
      if: {
        required: ['arn'],
      },
      then: {
        properties: {
          arn: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        },
      },
      else: {
        properties: {
          name: { type: 'string' },
          defaultAction: {
            type: 'string',
            enum: ['Allow', 'Block'],
            errorMessage: "must be 'Allow' or 'Block'",
          },
          description: { type: 'string' },
          rules: {
            type: 'array',
            items: { $ref: '#/definitions/wafRule' },
          },
        },
        required: ['rules'],
      },
    },
    tags: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    caching: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        behavior: {
          type: 'string',
          enum: ['FULL_REQUEST_CACHING', 'PER_RESOLVER_CACHING'],
          errorMessage:
            "must be one of 'FULL_REQUEST_CACHING', 'PER_RESOLVER_CACHING'",
        },
        type: {
          enum: [
            'SMALL',
            'MEDIUM',
            'LARGE',
            'XLARGE',
            'LARGE_2X',
            'LARGE_4X',
            'LARGE_8X',
            'LARGE_12X',
          ],
          errorMessage:
            "must be one of 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'LARGE_2X', 'LARGE_4X', 'LARGE_8X', 'LARGE_12X'",
        },
        ttl: { type: 'integer', minimum: 1, maximum: 3600 },
        atRestEncryption: { type: 'boolean' },
        transitEncryption: { type: 'boolean' },
      },
      required: ['behavior'],
    },
    additionalAuthentications: {
      type: 'array',
      items: { $ref: '#/definitions/auth' },
    },
    apiKeys: {
      type: 'array',
      items: {
        if: { type: 'object' },
        then: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            expiresAfter: {
              type: ['string', 'number'],
              pattern: `^(\\d+)(${Object.keys(timeUnits).join('|')})?$`,
              errorMessage: 'must be a valid duration.',
            },
            expiresAt: {
              type: 'string',
              format: 'iso-date-time',
              errorMessage: 'must be a valid date-time',
            },
            wafRules: {
              type: 'array',
              items: { $ref: '#/definitions/wafRule' },
            },
          },
          required: ['name'],
        },
        else: {
          type: 'string',
        },
      },
    },
    logging: {
      type: 'object',
      properties: {
        roleArn: { $ref: '#/definitions/stringOrIntrinsicFunction' },
        level: {
          type: 'string',
          enum: ['ALL', 'INFO', 'DEBUG', 'ERROR', 'NONE'],
          errorMessage:
            "must be one of 'ALL', 'INFO', 'DEBUG', 'ERROR' or 'NONE'",
        },
        retentionInDays: { type: 'integer' },
        excludeVerboseContent: { type: 'boolean' },
        enabled: { type: 'boolean' },
      },
      required: ['level'],
    },
    dataSources: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: { $ref: '#/definitions/dataSourceConfig' },
        },
        {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: { $ref: '#/definitions/dataSourceConfig' },
          },
        },
      ],
      errorMessage: 'contains invalid data source definitions',
    },
    resolvers: {
      oneOf: [
        { $ref: '#/definitions/resolverConfigMap' },
        {
          type: 'array',
          items: { $ref: '#/definitions/resolverConfigMap' },
        },
      ],
      errorMessage: 'contains invalid resolver definitions',
    },
    pipelineFunctions: {
      oneOf: [
        {
          $ref: '#/definitions/pipelineFunctionConfigMap',
        },
        {
          type: 'array',
          items: {
            $ref: '#/definitions/pipelineFunctionConfigMap',
          },
        },
      ],
      errorMessage: 'contains invalid pipeline function definitions',
    },
    esbuild: {
      oneOf: [
        {
          type: 'object',
        },
        { const: false },
      ],
      errorMessage: 'must be an esbuild config object or false',
    },
  },
  required: ['name', 'authentication'],
  additionalProperties: {
    not: true,
    errorMessage: 'invalid (unknown) property',
  },
}

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true })
ajvErrors(ajv)
addFormats(ajv)

const validator = ajv.compile(appSyncSchema)

export const validateConfig = (data) => {
  const isValid = validator(data)
  if (isValid === false && validator.errors) {
    throw new AppSyncValidationError(
      validator.errors
        .filter((error) => !['if', 'oneOf', 'anyOf'].includes(error.keyword))
        .map((error) => {
          return {
            path: error.instancePath,
            message: error.message || 'unknown error',
          }
        }),
    )
  }

  return isValid
}

export class AppSyncValidationError extends Error {
  constructor(validationErrors) {
    super(
      validationErrors
        .map((error) => `${error.path}: ${error.message}`)
        .join('\n'),
    )
    this.validationErrors = validationErrors
    Object.setPrototypeOf(this, AppSyncValidationError.prototype)
  }
}
