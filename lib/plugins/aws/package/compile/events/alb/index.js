'use strict';

const BbPromise = require('bluebird');

const validate = require('./lib/validate');
const compileTargetGroups = require('./lib/target-groups');
const compileListenerRules = require('./lib/listener-rules');
const compilePermissions = require('./lib/permissions');

function defineArray(schema, options = {}) {
  return { type: 'array', items: schema, ...options };
}
const IP_V4_CIDR = '^([0-9]{1,3}\\.){3}[0-9]{1,3}\\/([0-9]|[1-2][0-9]|3[0-2])$';
const IP_V6_CIDR =
  '^s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]d|1dd|[1-9]?d)(.(25[0-5]|2[0-4]d|1dd|[1-9]?d)){3}))|:)))(%.+)?s*(\\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))$';

const ALB_HTTP_HEADER_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 40 },
    values: defineArray({ type: 'string', maxLength: 128 }, { uniqueItems: true }),
  },
  additionalProperties: false,
  required: ['name', 'values'],
};

class AwsCompileAlbEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, compileTargetGroups, compileListenerRules, compilePermissions);

    this.hooks = {
      'package:compileEvents': async () => {
        return BbPromise.try(() => {
          this.validated = this.validate();
          if (this.validated.events.length === 0) return;

          this.compileTargetGroups();
          this.compileListenerRules();
          this.compilePermissions();
        });
      },
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'alb', {
      type: 'object',
      properties: {
        authorizer: defineArray({ type: 'string' }),
        conditions: {
          type: 'object',
          properties: {
            header: {
              anyOf: [defineArray(ALB_HTTP_HEADER_SCHEMA), ALB_HTTP_HEADER_SCHEMA],
            },
            host: defineArray(
              {
                type: 'string',
                pattern: '^[A-Za-z0-9*?.-]+$',
                maxLength: 128,
              },
              { uniqueItems: true }
            ),
            ip: defineArray(
              {
                anyOf: [
                  { type: 'string', pattern: IP_V4_CIDR },
                  { type: 'string', pattern: IP_V6_CIDR },
                ],
              },
              { uniqueItems: true }
            ),
            method: defineArray(
              { type: 'string', pattern: '^[A-Z_-]+$', maxLength: 40 },
              { uniqueItems: true }
            ),
            path: defineArray(
              {
                type: 'string',
                pattern: '^([A-Za-z0-9*?_.$/~"\'@:+-]|&amp;)+$',
                maxLength: 128,
              },
              { uniqueItems: true }
            ),
            query: {
              type: 'object',
              additionalProperties: defineArray(
                { type: 'string', maxLength: 128 },
                { uniqueItems: true }
              ),
              propertyNames: { type: 'string', maxLength: 128 },
            },
          },
          additionalProperties: false,
        },
        healthCheck: {
          anyOf: [
            { type: 'boolean' },
            {
              type: 'object',
              properties: {
                healthyThresholdCount: { type: 'integer', minimum: 2, maximum: 10 },
                intervalSeconds: { type: 'integer', minimum: 5, maximum: 300 },
                matcher: {
                  type: 'object',
                  properties: {
                    httpCode: { type: 'string', pattern: '^\\d{3}(-\\d{3})?(,\\d{3}(-\\d{3})?)*$' },
                  },
                  additionalProperties: false,
                },
                path: { type: 'string', minLength: 1, maxLength: 1024 },
                timeoutSeconds: { type: 'integer', minimum: 2, maximum: 120 },
                unhealthyThresholdCount: { type: 'integer', minimum: 2, maximum: 10 },
              },
              additionalProperties: false,
            },
          ],
        },
        listenerArn: {
          anyOf: [{ $ref: '#/definitions/awsAlbListenerArn' }, { $ref: '#/definitions/awsCfRef' }],
        },
        multiValueHeaders: { type: 'boolean' },
        priority: { type: 'integer', minimum: 1, maximum: 50000 },
        targetGroupName: {
          type: 'string',
          minLength: 1,
          maxLength: 32,
          pattern: '^[a-zA-Z0-9-]+$',
        },
      },
      required: ['listenerArn', 'priority', 'conditions'],
      additionalProperties: false,
    });
  }
}

module.exports = AwsCompileAlbEvents;
