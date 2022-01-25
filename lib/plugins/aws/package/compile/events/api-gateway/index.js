'use strict';

/* eslint-disable global-require */

const BbPromise = require('bluebird');
const memoize = require('memoizee');

const validate = require('./lib/validate');
const compileRestApi = require('./lib/rest-api');
const compileRequestValidators = require('./lib/request-validator');
const compileApiKeys = require('./lib/api-keys');
const compileUsagePlan = require('./lib/usage-plan');
const compileUsagePlanKeys = require('./lib/usage-plan-keys');
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
        const getServiceState = require('../../../../lib/get-service-state').getServiceState;

        const state = getServiceState.call(this);
        const updateStage = require('./lib/hack/update-stage').updateStage;

        this.state = state;
        return updateStage.call(this);
      },

      // TODO should be removed once AWS fixes the removal via CloudFormation
      'before:remove:remove': async () => {
        const globalValidate = require('../../../../lib/validate').validate;
        const disassociateUsagePlan =
          require('./lib/hack/disassociate-usage-plan').disassociateUsagePlan;

        return BbPromise.bind(this).then(globalValidate).then(disassociateUsagePlan);
      },
    };
  }
}

module.exports = AwsCompileApigEvents;
