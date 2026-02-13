import memoize from 'memoizee'
import validate from './lib/validate.js'
import compileRestApi from './lib/rest-api.js'
import compileRequestValidators from './lib/request-validator.js'
import compileApiKeys from './lib/api-keys.js'
import compileUsagePlan from './lib/usage-plan.js'
import compileUsagePlanKeys from './lib/usage-plan-keys.js'
import compileResources from './lib/resources.js'
import compileCors from './lib/cors.js'
import compileMethods from './lib/method/index.js'
import compileAuthorizers from './lib/authorizers.js'
import compileDeployment from './lib/deployment.js'
import compilePermissions from './lib/permissions.js'
import compileStage from './lib/stage.js'
import getMethodAuthorization from './lib/method/authorization.js'
import getMethodIntegration from './lib/method/integration.js'
import getMethodResponses from './lib/method/responses.js'

function caseInsensitive(str) {
  return { type: 'string', regexp: new RegExp(`^${str}$`, 'i').toString() }
}

const contentHandlingSchema = {
  enum: ['CONVERT_TO_BINARY', 'CONVERT_TO_TEXT'],
}

const allowedMethods = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'OPTIONS',
  'HEAD',
  'DELETE',
  'ANY',
]
const methodPattern = new RegExp(`^(?:\\*|${allowedMethods.join('|')})$`, 'i')
const methodPathPattern = new RegExp(
  `^(?:\\*|(${allowedMethods.join('|')}) (\\/\\S*))$`,
  'i',
)

const requestParametersSchema = {
  description: `Request parameter mapping configuration.`,
  type: 'object',
  additionalProperties: {
    anyOf: [
      { type: 'boolean' },
      {
        description: `Request parameter object with mapping metadata.`,
        type: 'object',
        properties: {
          required: { type: 'boolean' },
          mappedValue: { $ref: '#/definitions/awsCfInstruction' },
        },
        additionalProperties: false,
      },
    ],
  },
}

const authorizerSchema = {
  description: `HTTP event authorizer configuration.`,
  anyOf: [
    { type: 'string' },
    {
      description: `Detailed authorizer configuration object.`,
      type: 'object',
      properties: {
        arn: { $ref: '#/definitions/awsArn' },
        authorizerId: { $ref: '#/definitions/awsCfInstruction' },
        claims: { type: 'array', items: { type: 'string' } },
        identitySource: {
          description: `Identity source expression for the authorizer.
@default 'method.request.header.Authorization'`,
          type: 'string',
        },
        identityValidationExpression: { type: 'string' },
        managedExternally: { type: 'boolean' },
        name: { type: 'string' },
        resultTtlInSeconds: {
          description: `Authorizer cache TTL in seconds (0-3600).
@default 300`,
          type: 'integer',
          minimum: 0,
          maximum: 3600,
        },
        scopes: {
          description: `OAuth scopes required for access.`,
          type: 'array',
          items: {
            anyOf: [
              { type: 'string' },
              { $ref: '#/definitions/awsCfInstruction' },
            ],
          },
        },
        type: {
          description: `Authorizer type.
@example 'token'`,
          anyOf: [
            'token',
            'cognito_user_pools',
            'request',
            'aws_iam',
            'custom',
          ].map(caseInsensitive),
        },
      },
      required: [],
      additionalProperties: false,
    },
  ],
}

const corsSchema = {
  description: `CORS configuration for REST API events.`,
  anyOf: [
    { type: 'boolean' },
    {
      description: `Detailed CORS options.`,
      type: 'object',
      properties: {
        allowCredentials: { type: 'boolean' },
        cacheControl: { type: 'string' },
        headers: { type: 'array', items: { type: 'string' } },
        maxAge: { type: 'integer', minimum: 1 },
        methods: { type: 'array', items: { enum: allowedMethods } },
        origin: { type: 'string' },
        origins: {
          description: `Allowed origin list.
@example ['https://example.com']`,
          type: 'array',
          items: { type: 'string' },
        },
      },
      additionalProperties: false,
    },
  ],
}

const requestSchema = {
  description: `Request integration mapping configuration.`,
  type: 'object',
  properties: {
    contentHandling: contentHandlingSchema,
    method: { type: 'string', regexp: methodPattern.toString() },
    parameters: {
      description: `Request parameter mappings by location.`,
      type: 'object',
      properties: {
        querystrings: requestParametersSchema,
        headers: requestParametersSchema,
        paths: requestParametersSchema,
      },
      additionalProperties: false,
    },
    passThrough: { enum: ['NEVER', 'WHEN_NO_MATCH', 'WHEN_NO_TEMPLATES'] },
    schemas: {
      description: `Request body schemas by content-type.
@example { 'application/json': 'schemaId' }`,
      type: 'object',
      additionalProperties: { anyOf: [{ type: 'object' }, { type: 'string' }] },
    },
    template: {
      description: `Request templates keyed by content-type.`,
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    uri: { $ref: '#/definitions/awsCfInstruction' },
  },
  additionalProperties: false,
}

const responseSchema = {
  description: `Response integration mapping configuration.`,
  type: 'object',
  properties: {
    contentHandling: contentHandlingSchema,
    headers: {
      description: `Response header mappings.`,
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    template: { type: 'string' },
    transferMode: {
      description: `Streaming transfer mode.`,
      anyOf: ['BUFFERED', 'STREAM'].map(caseInsensitive),
    },
    statusCodes: {
      description: `Response mappings keyed by status code.`,
      type: 'object',
      propertyNames: {
        description: `Three-digit HTTP status code key.`,
        type: 'string',
        pattern: '^\\d{3}$',
      },
      additionalProperties: {
        description: `Per-status-code response mapping.`,
        type: 'object',
        properties: {
          headers: {
            description: `Headers added to this status response.`,
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          pattern: { type: 'string' },
          template: {
            description: `Response template string or map keyed by content-type.`,
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
            ],
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
}

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'http', {
      description: `REST API Gateway event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway
@example
http:
  path: users/{id}
  method: get`,
      anyOf: [
        { type: 'string', regexp: methodPathPattern.toString() },
        {
          type: 'object',
          properties: {
            async: {
              description: `Invoke Lambda asynchronously.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#using-asynchronous-integration`,
              type: 'boolean',
            },
            authorizer: {
              ...authorizerSchema,
              description: `Custom/Cognito/IAM authorizer configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#http-endpoints-with-custom-authorizers`,
            },
            connectionId: {
              description: `VPC Link connection id.`,
              $ref: '#/definitions/awsCfInstruction',
            },
            connectionType: {
              description: `Connection type for integration.`,
              anyOf: ['vpc-link', 'VPC_LINK'].map(caseInsensitive),
            },
            cors: {
              ...corsSchema,
              description: `CORS configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#enabling-cors`,
            },
            integration: {
              description: `API Gateway integration type.
@default 'lambda-proxy'
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#lambda-integration`,
              anyOf: [
                'LAMBDA_PROXY',
                'LAMBDA-PROXY',
                'LAMBDA',
                'AWS',
                'AWS_PROXY',
                'AWS-PROXY',
                'HTTP',
                'HTTP_PROXY',
                'HTTP-PROXY',
                'MOCK',
              ].map(caseInsensitive),
            },
            method: {
              description: `HTTP method.
@example 'get'`,
              type: 'string',
              regexp: methodPattern.toString(),
            },
            operationId: {
              description: `OpenAPI operation id.`,
              type: 'string',
            },
            path: {
              description: `HTTP route path.
@example 'users/{id}'`,
              type: 'string',
              regexp: /^(?:\*|\/?\S*)$/.toString(),
            },
            private: {
              description: `Require API key for this route.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#setting-api-keys-for-your-rest-api`,
              type: 'boolean',
            },
            request: {
              ...requestSchema,
              description: `Request mapping and validation configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#request-schema-validators`,
            },
            response: {
              ...responseSchema,
              description: `Response mapping configuration.`,
            },
            timeoutInMillis: {
              description: `Integration timeout in milliseconds.`,
              type: 'integer',
              minimum: 50,
            },
          },
          required: ['path', 'method'],
          additionalProperties: false,
        },
      ],
    })

    // used for the generated method logical ids (GET, PATCH, PUT, DELETE, OPTIONS, ...)
    this.apiGatewayMethodLogicalIds = []

    Object.assign(
      this,
      validate,
      compileRestApi,
      compileApiKeys,
      compileUsagePlan,
      compileUsagePlanKeys,
      compileResources,
      compileCors,
      compileMethods,
      compileRequestValidators,
      compileAuthorizers,
      compileDeployment,
      compilePermissions,
      compileStage,
      getMethodAuthorization,
      getMethodIntegration,
      getMethodResponses,
    )

    this.createRequestValidator = memoize(
      this.createRequestValidator.bind(this),
    )

    this.hooks = {
      'package:compileEvents': async () => {
        this.validated = this.validate()

        if (this.validated.events.length === 0) {
          return Promise.resolve()
        }

        return Promise.resolve(this)
          .then(() => this.compileRestApi())
          .then(() => this.compileResources())
          .then(() => this.compileCors())
          .then(() => this.compileMethods())
          .then(() => this.compileRequestValidators())
          .then(() => this.compileAuthorizers())
          .then(() => this.compileDeployment())
          .then(() => this.compileApiKeys())
          .then(() => this.compileUsagePlan())
          .then(() => this.compileUsagePlanKeys())
          .then(() => this.compilePermissions())
          .then(() => this.compileStage())
      },

      // TODO should be removed once AWS fixes the CloudFormation problems using a separate Stage
      'after:deploy:deploy': async () => {
        // Dynamically import the module
        const module = await import('../../../../lib/get-service-state.js')
        // Access the default export and then the getServiceState method
        const getServiceState = module.default.getServiceState.bind(this)
        const state = getServiceState.call(this)
        this.state = state
        const moduleTwo = await import('./lib/hack/update-stage.js')
        const updateStage = moduleTwo.default.updateStage.bind(this)
        return updateStage.call(this)
      },

      // TODO should be removed once AWS fixes the removal via CloudFormation
      'before:remove:remove': async () => {
        const {
          default: { validate: globalValidate },
        } = await import('../../../../lib/validate.js')
        const {
          default: { disassociateUsagePlan },
        } = await import('./lib/hack/disassociate-usage-plan.js')

        return Promise.resolve()
          .then(() => globalValidate.call(this))
          .then(() => disassociateUsagePlan.call(this))
      },
    }
  }
}

export default AwsCompileApigEvents
