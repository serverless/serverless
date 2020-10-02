'use strict';

/* eslint-disable global-require */

const BbPromise = require('bluebird');
const _ = require('lodash');

const validate = require('./lib/validate');
const compileRestApi = require('./lib/restApi');
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

function extendWithUppercase(lowercaseItems) {
  return [...lowercaseItems, ...lowercaseItems.map(item => item.toUpperCase())];
}

const requestParametersSchema = {
  type: 'object',
  additionalProperties: {
    oneOf: [
      { type: 'boolean' },
      {
        type: 'object',
        properties: {
          required: { type: 'boolean' },
          mappedValue: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
  },
};

const contentHandlingSchema = { enum: ['CONVERT_TO_BINARY', 'CONVERT_TO_TEXT'] };

const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'HEAD', 'DELETE', 'ANY']);
const methodPattern = new RegExp(`^(?:\\*|${Array.from(allowedMethods).join('|')})$`, 'i');
const methodPathPattern = new RegExp(
  `^(?:\\*|(${Array.from(allowedMethods).join('|')}) (\\/\\S*))$`,
  'i'
);

const authorizerSchema = {
  oneOf: [
    { type: 'string' },
    { enum: extendWithUppercase(['aws_iam']) },
    { $ref: '#/definitions/awsArn' },
    {
      type: 'object',
      properties: {
        type: {
          enum: extendWithUppercase(['token', 'cognito_user_pools', 'request', 'aws_iam']),
        },
        authorizerId: {
          oneOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfRef' }],
        },
        arn: { $ref: '#/definitions/awsArn' },
        resultTtlInSeconds: { type: 'integer', maximum: 3600 },
        scopes: { type: 'array', items: { type: 'string' } },
        identitySource: { type: 'string' },
        identityValidationExpression: { type: 'string' },
        managedExternally: { type: 'boolean' },
        name: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
  ],
};

const corsSchema = {
  oneOf: [
    { type: 'boolean' },
    {
      type: 'object',
      properties: {
        allowCredentials: { type: 'boolean' },
        headers: { type: 'array', items: { type: 'string' } },
        maxAge: { type: 'integer', minimum: 0 },
      },
      oneOf: [
        { properties: { origin: { type: 'string' } } },
        {
          properties: {
            origins: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      ],
      additionalProperties: false,
    },
  ],
};

const requestSchema = {
  type: 'object',
  properties: {
    contentHandling: contentHandlingSchema,
    parameters: {
      type: 'object',
      properties: {
        querystrings: requestParametersSchema,
        headers: requestParametersSchema,
        paths: requestParametersSchema,
      },
      additionalProperties: false,
    },
    schema: {
      type: 'object',
      additionalProperties: { type: ['object', 'string'] },
    },
    template: {
      type: 'object',
      additionalProperties: { type: ['string', 'null'] },
    },
    passThrough: { enum: ['NEVER', 'WHEN_NO_MATCH', 'WHEN_NO_TEMPLATES'] },
    uri: { type: 'string' },
    method: { type: 'string', regexp: methodPattern.toString() },
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
      additionalProperties: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          template: {
            oneOf: [
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

const baseIntegrationSchema = {
  type: 'object',
  properties: {
    cors: corsSchema,
    method: { type: 'string', regexp: methodPattern.toString() },
    path: { type: 'string', regexp: /^(?:\*|\/\S*)$/.toString() },
    operationId: { type: 'string' },
    async: { type: 'boolean' },
    private: { type: 'boolean' },
    request: requestSchema,
    response: responseSchema,
    authorizer: authorizerSchema,
  },
  required: ['path', 'method'],
  additionalProperties: false,
};

const lambdaProxyIntegrationSchema = _.merge({}, baseIntegrationSchema, {
  properties: {
    integration: {
      enum: extendWithUppercase(['lambda_proxy']),
    },
  },
  required: ['integration'],
});

const mockIntegrationSchema = _.merge({}, baseIntegrationSchema, {
  properties: {
    integration: {
      enum: extendWithUppercase(['mock']),
    },
  },
  required: ['integration'],
});

const awsIntegrationSchema = _.merge({}, baseIntegrationSchema, {
  properties: {
    integration: {
      enum: extendWithUppercase(['aws', 'aws_proxy']),
    },
  },
  required: ['integration'],
});

const httpIntegrationSchema = _.merge({}, baseIntegrationSchema, {
  properties: {
    integration: {
      enum: extendWithUppercase(['http', 'http_proxy']),
    },
    request: {
      required: ['uri'],
    },
  },
  required: ['integration'],
});

const httpVpcLinkIntegrationSchema = _.merge({}, baseIntegrationSchema, {
  properties: {
    connectionType: { enum: ['vpc-link', 'VPC_LINK'] },
    connectionId: { type: 'string' },
    integration: {
      enum: extendWithUppercase(['http', 'http_proxy']),
    },
    request: {
      required: ['uri'],
    },
  },
  required: ['integration', 'connectionType', 'connectionId'],
});

const lambdaIntegrationSchema = _.merge({}, baseIntegrationSchema, {
  properties: {
    integration: {
      enum: extendWithUppercase(['lambda']),
    },
    authorizer: {
      properties: {
        claims: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['integration'],
});

const cognitoIntegrationSchema = _.merge({}, baseIntegrationSchema, {
  properties: {
    integration: {
      enum: extendWithUppercase(['cognito_user_pools']),
    },
    authorizer: {
      required: ['name'],
    },
  },
  required: ['integration'],
});

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'http', {
      oneOf: [
        { type: 'string', regexp: methodPathPattern.toString() },
        baseIntegrationSchema,
        awsIntegrationSchema,
        cognitoIntegrationSchema,
        httpIntegrationSchema,
        httpVpcLinkIntegrationSchema,
        lambdaIntegrationSchema,
        lambdaProxyIntegrationSchema,
        mockIntegrationSchema,
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
      compileAuthorizers,
      compileDeployment,
      compilePermissions,
      compileStage,
      getMethodAuthorization,
      getMethodIntegration,
      getMethodResponses
    );

    this.hooks = {
      'package:compileEvents': () => {
        this.validated = this.validate();

        if (this.validated.events.length === 0) {
          return BbPromise.resolve();
        }

        return BbPromise.bind(this)
          .then(this.compileRestApi)
          .then(this.compileResources)
          .then(this.compileCors)
          .then(this.compileMethods)
          .then(this.compileAuthorizers)
          .then(this.compileDeployment)
          .then(this.compileApiKeys)
          .then(this.compileUsagePlan)
          .then(this.compileUsagePlanKeys)
          .then(this.compilePermissions)
          .then(this.compileStage);
      },

      // TODO should be removed once AWS fixes the CloudFormation problems using a separate Stage
      'after:deploy:deploy': () => {
        const getServiceState = require('../../../../lib/getServiceState').getServiceState;

        const state = getServiceState.call(this);
        const updateStage = require('./lib/hack/updateStage').updateStage;

        this.state = state;
        return updateStage.call(this);
      },

      // TODO should be removed once AWS fixes the removal via CloudFormation
      'before:remove:remove': () => {
        // eslint-disable-next-line no-shadow
        const validate = require('../../../../lib/validate').validate;
        // eslint-disable-next-line max-len
        const disassociateUsagePlan = require('./lib/hack/disassociateUsagePlan')
          .disassociateUsagePlan;

        return BbPromise.bind(this)
          .then(validate)
          .then(disassociateUsagePlan);
      },
    };
  }
}

module.exports = AwsCompileApigEvents;
