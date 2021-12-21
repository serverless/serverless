'use strict';

/* eslint-disable global-require */

const BbPromise = require('bluebird');
const _ = require('lodash');
const memoize = require('memoizee');

const validate = require('./lib/validate');
const compileRestApi = require('./lib/restApi');
const compileRequestValidators = require('./lib/requestValidator');
const compileApiKeys = require('./lib/apiKeys');
const compileUsagePlan = require('./lib/usagePlan');
const compileUsagePlanKeys = require('./lib/usagePlanKeys');
const compileResources = require('./lib/resources');
const compileCors = require('./lib/cors');
const compileMethods = require('./lib/method/index');
const compileAuthorizers = require('./lib/authorizers');
const compileDeployment = require('./lib/deployment');
const compilePermissions = require('./lib/permissions');
const compileStage = require('./lib/stage');
const getMethodAuthorization = require('./lib/method/authorization');
const getMethodIntegration = require('./lib/method/integration');
const getMethodResponses = require('./lib/method/responses');

function caseInsensitive(str) {
  return { type: 'string', regexp: new RegExp(`^${str}$`, 'i').toString() };
}

const contentHandlingSchema = { enum: ['CONVERT_TO_BINARY', 'CONVERT_TO_TEXT'] };

const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'HEAD', 'DELETE', 'ANY'];
const methodPattern = new RegExp(`^(?:\\*|${allowedMethods.join('|')})$`, 'i');
const methodPathPattern = new RegExp(`^(?:\\*|(${allowedMethods.join('|')}) (\\/\\S*))$`, 'i');

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
};

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
        scopes: { type: 'array', items: { type: 'string' } },
        type: {
          anyOf: ['token', 'cognito_user_pools', 'request', 'aws_iam', 'custom'].map(
            caseInsensitive
          ),
        },
      },
      required: [],
      additionalProperties: false,
    },
  ],
};

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
};

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
    schema: {
      type: 'object',
      additionalProperties: { anyOf: [{ type: 'object' }, { type: 'string' }] },
    },
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
};

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
};

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'http', {
      anyOf: [
        { type: 'string', regexp: methodPathPattern.toString() },
        {
          type: 'object',
          properties: {
            async: { type: 'boolean' },
            authorizer: authorizerSchema,
            connectionId: { $ref: '#/definitions/awsCfInstruction' },
            connectionType: { anyOf: ['vpc-link', 'VPC_LINK'].map(caseInsensitive) },
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
          },
          required: ['path', 'method'],
          additionalProperties: false,
        },
      ],
    });

    // used for the generated method logical ids (GET, PATCH, PUT, DELETE, OPTIONS, ...)
    this.apiGatewayMethodLogicalIds = [];

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
      getMethodResponses
    );

    this.createRequestValidator = memoize(this.createRequestValidator.bind(this));

    this.hooks = {
      'initialize': () => {
        if (
          this.serverless.service.provider.name === 'aws' &&
          (this.serverless.service.provider.apiKeys ||
            this.serverless.service.provider.resourcePolicy ||
            this.serverless.service.provider.usagePlan)
        ) {
          this.serverless._logDeprecation(
            'AWS_API_GATEWAY_SPECIFIC_KEYS',
            'Starting with next major version, API Gateway-specific configuration keys ' +
              '"apiKeys", "resourcePolicy" and "usagePlan" will be relocated from "provider" ' +
              'to "provider.apiGateway"'
          );
        }

        if (
          this.serverless.service.provider.name === 'aws' &&
          Object.values(this.serverless.service.functions).some(({ events }) =>
            events.some(({ http }) => _.get(http, 'request.schema'))
          )
        ) {
          this.serverless._logDeprecation(
            'AWS_API_GATEWAY_SCHEMAS',
            'Starting with next major version, "http.request.schema" property will be replaced by "http.request.schemas".'
          );
        }

        if (
          this.serverless.service.provider.name === 'aws' &&
          Object.values(this.serverless.service.functions).some(({ events }) =>
            events.some(({ http }) => {
              return (
                http &&
                _.isObject(http.authorizer) &&
                http.authorizer.type &&
                http.authorizer.type.toUpperCase() === 'REQUEST' &&
                http.authorizer.identitySource === undefined &&
                http.authorizer.resultTtlInSeconds === 0
              );
            })
          )
        ) {
          this.serverless._logDeprecation(
            'AWS_API_GATEWAY_DEFAULT_IDENTITY_SOURCE',
            'Starting with v3.0.0, "functions[].events[].http.authorizer.identitySource" will no longer be set to "method.request.header.Authorization" by default for authorizers of "request" type with caching disabled ("resultTtlInSeconds" set to "0").\nIf you want to keep this setting, please set it explicitly in your configuration. If you do not want this to be set, please set it explicitly to "null".'
          );
        }

        if (
          this.serverless.service.provider.name === 'aws' &&
          this.serverless.service.provider.apiGateway &&
          this.serverless.service.provider.apiGateway.restApiId &&
          this.serverless.service.provider.tracing &&
          this.serverless.service.provider.tracing.apiGateway != null
        ) {
          this.serverless._logDeprecation(
            'AWS_API_GATEWAY_NON_APPLICABLE_SETTINGS',
            'When external API Gateway resource is imported via ' +
              '`provider.apiGateway.restApiId`, property ' +
              '"provider.tracing.apiGateway" will be ignored.'
          );
        }
        if (
          this.serverless.service.provider.name === 'aws' &&
          this.serverless.service.provider.apiGateway &&
          this.serverless.service.provider.apiGateway.restApiId &&
          this.serverless.service.provider.logs &&
          this.serverless.service.provider.logs.restApi != null
        ) {
          this.serverless._logDeprecation(
            'AWS_API_GATEWAY_NON_APPLICABLE_SETTINGS',
            'When external API Gateway resource is imported via ' +
              '`provider.apiGateway.restApiId`, property ' +
              '"provider.logs.restApi" will be ignored.'
          );
        }
      },
      'package:compileEvents': async () => {
        this.validated = this.validate();

        if (this.validated.events.length === 0) {
          return BbPromise.resolve();
        }

        return BbPromise.bind(this)
          .then(this.compileRestApi)
          .then(this.compileResources)
          .then(this.compileCors)
          .then(this.compileMethods)
          .then(this.compileRequestValidators)
          .then(this.compileAuthorizers)
          .then(this.compileDeployment)
          .then(this.compileApiKeys)
          .then(this.compileUsagePlan)
          .then(this.compileUsagePlanKeys)
          .then(this.compilePermissions)
          .then(this.compileStage);
      },

      // TODO should be removed once AWS fixes the CloudFormation problems using a separate Stage
      'after:deploy:deploy': async () => {
        const getServiceState = require('../../../../lib/getServiceState').getServiceState;

        const state = getServiceState.call(this);
        const updateStage = require('./lib/hack/updateStage').updateStage;

        this.state = state;
        return updateStage.call(this);
      },

      // TODO should be removed once AWS fixes the removal via CloudFormation
      'before:remove:remove': async () => {
        const globalValidate = require('../../../../lib/validate').validate;
        const disassociateUsagePlan =
          require('./lib/hack/disassociateUsagePlan').disassociateUsagePlan;

        return BbPromise.bind(this).then(globalValidate).then(disassociateUsagePlan);
      },
    };
  }
}

module.exports = AwsCompileApigEvents;
