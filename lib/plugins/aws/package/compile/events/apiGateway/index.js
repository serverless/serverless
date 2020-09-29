'use strict';

/* eslint-disable global-require */

const BbPromise = require('bluebird');

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

function mapOfType(schema) {
  return {
    type: 'object',
    additionalProperties: schema,
  };
}

function arrayOrSingle(schema) {
  return {
    oneOf: [schema, { type: 'array', items: schema }],
  };
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
        required: ['required'],
        additionalProperties: false,
      },
    ],
  },
};

const contentHandlingSchema = { enum: ['CONVERT_TO_BINARY', 'CONVERT_TO_TEXT'] };

const httpMethods = ['get', 'post', 'put', 'patch', 'options', 'head', 'delete', 'any'];

class AwsCompileApigEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'http', {
      anyOf: [
        { regexp: { pattern: `^(${httpMethods.join('|')}) [\\S]+`, flags: 'i' } },
        {
          type: 'object',
          properties: {
            connectionType: { enum: ['vpc-link', 'VPC_LINK'] },
            connectionId: { type: 'string' },
            cors: {
              oneOf: [
                { type: 'boolean' },
                {
                  type: 'object',
                  properties: {
                    origin: { type: 'string' },
                    origins: { type: 'array', items: { type: 'string' } },
                    allowCredentials: { type: 'boolean' },
                    headers: arrayOrSingle({ type: 'string' }),
                    maxAge: { type: 'integer', minimum: 0 },
                  },
                  required: [],
                  oneOf: [{ required: 'origin' }, { required: 'origins' }],
                  additionalProperties: false,
                },
              ],
            },
            integration: {
              enum: extendWithUppercase([
                'lambda_proxy',
                'lambda',
                'aws',
                'aws_proxy',
                'http',
                'http_proxy',
                'mock',
              ]),
            },
            method: {
              enum: extendWithUppercase(httpMethods),
            },
            path: { type: 'string' },
            operationId: { type: 'string' },
            async: { type: 'boolean' },
            private: { type: 'boolean' },
            request: {
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
                  required: [],
                  additionalProperties: false,
                },
                schema: mapOfType({ type: ['object', 'string'] }),
                template: mapOfType({ type: ['string', 'null'] }),
                passThrough: { enum: ['NEVER', 'WHEN_NO_MATCH', 'WHEN_NO_TEMPLATES'] },
                uri: { type: 'string' },
                method: { enum: httpMethods },
              },
              required: [],
              additionalProperties: false,
            },
            response: {
              type: 'object',
              properties: {
                contentHandling: contentHandlingSchema,
                headers: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
                template: { type: 'string' },
                statusCodes: mapOfType({
                  type: 'object',
                  properties: {
                    pattern: { type: 'string' },
                    template: {
                      oneOf: [{ type: 'string' }, mapOfType({ type: 'string' })],
                    },
                  },
                  additionalProperties: false,
                }),
              },
              required: [],
              additionalProperties: false,
            },
            authorizer: {
              oneOf: [
                { type: 'string' },
                { enum: extendWithUppercase(['aws_iam']) },
                { $ref: '#/definitions/awsArn' },
                {
                  type: 'object',
                  properties: {
                    type: {
                      enum: extendWithUppercase([
                        'token',
                        'cognito_user_pools',
                        'request',
                        'aws_iam',
                      ]),
                    },
                    authorizerId: {
                      oneOf: [{ type: 'string' }, { $ref: '#/definitions/awsCfRef' }],
                    },
                    arn: { $ref: '#/definitions/awsArn' },
                    resultTtlInSeconds: { type: 'integer', maximum: 3600 },
                    claims: { type: 'array', items: { type: 'string' } }, // https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
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
            },
          },
          allOf: [
            {
              if: {
                properties: { integration: { enum: extendWithUppercase(['http', 'http_proxy']) } },
              },
              then: {
                properties: {
                  request: {
                    required: ['uri'],
                  },
                },
              },
            },
            {
              if: { properties: { connectionType: { enum: ['vpc-link', 'VPC_LINK'] } } },
              then: {
                request: {
                  required: ['connectionId'],
                },
              },
            },
            {
              if: {
                properties: {
                  cognito_user_pools: {
                    properties: { type: extendWithUppercase(['cognito_user_pools']) },
                  },
                },
              },
              then: {
                authorizer: {
                  required: ['name'],
                },
              },
            },
          ],
          required: ['path'],
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
