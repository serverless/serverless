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
  type: 'object',
  additionalProperties: {
    anyOf: [
      { type: 'boolean' },
      {
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
  anyOf: [
    { type: 'string' },
    {
      type: 'object',
      properties: {
        arn: { $ref: '#/definitions/awsArn' },
        authorizerId: { $ref: '#/definitions/awsCfInstruction' },
        claims: { type: 'array', items: { type: 'string' } },
        identitySource: { type: 'string' },
        identityValidationExpression: { type: 'string' },
        managedExternally: { type: 'boolean' },
        name: { type: 'string' },
        resultTtlInSeconds: { type: 'integer', minimum: 0, maximum: 3600 },
        scopes: {
          type: 'array',
          items: {
            anyOf: [
              { type: 'string' },
              { $ref: '#/definitions/awsCfInstruction' },
            ],
          },
        },
        type: {
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
  anyOf: [
    { type: 'boolean' },
    {
      type: 'object',
      properties: {
        allowCredentials: { type: 'boolean' },
        cacheControl: { type: 'string' },
        headers: { type: 'array', items: { type: 'string' } },
        maxAge: { type: 'integer', minimum: 1 },
        methods: { type: 'array', items: { enum: allowedMethods } },
        origin: { type: 'string' },
        origins: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      additionalProperties: false,
    },
  ],
}

const requestSchema = {
  type: 'object',
  properties: {
    contentHandling: contentHandlingSchema,
    method: { type: 'string', regexp: methodPattern.toString() },
    parameters: {
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
      type: 'object',
      additionalProperties: { anyOf: [{ type: 'object' }, { type: 'string' }] },
    },
    template: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    uri: { $ref: '#/definitions/awsCfInstruction' },
  },
  additionalProperties: false,
}

const responseSchema = {
  type: 'object',
  properties: {
    contentHandling: contentHandlingSchema,
    headers: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    template: { type: 'string' },
    statusCodes: {
      type: 'object',
      propertyNames: {
        type: 'string',
        pattern: '^\\d{3}$',
      },
      additionalProperties: {
        type: 'object',
        properties: {
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          pattern: { type: 'string' },
          template: {
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
      anyOf: [
        { type: 'string', regexp: methodPathPattern.toString() },
        {
          type: 'object',
          properties: {
            async: { type: 'boolean' },
            authorizer: authorizerSchema,
            connectionId: { $ref: '#/definitions/awsCfInstruction' },
            connectionType: {
              anyOf: ['vpc-link', 'VPC_LINK'].map(caseInsensitive),
            },
            cors: corsSchema,
            integration: {
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
            method: { type: 'string', regexp: methodPattern.toString() },
            operationId: { type: 'string' },
            path: { type: 'string', regexp: /^(?:\*|\/?\S*)$/.toString() },
            private: { type: 'boolean' },
            request: requestSchema,
            response: responseSchema,
            timeoutInMillis: { type: 'integer', minimum: 50 },
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
