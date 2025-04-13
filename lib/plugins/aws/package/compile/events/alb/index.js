import pTry from 'p-try'
import validate from './lib/validate.js'
import compileTargetGroups from './lib/target-groups.js'
import compileListenerRules from './lib/listener-rules.js'
import compilePermissions from './lib/permissions.js'

function defineArray(schema, options = {}) {
  return { type: 'array', items: schema, ...options }
}

const ALB_HTTP_HEADER_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 40 },
    values: defineArray(
      { type: 'string', maxLength: 128 },
      { uniqueItems: true },
    ),
  },
  additionalProperties: false,
  required: ['name', 'values'],
}

class AwsCompileAlbEvents {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    Object.assign(
      this,
      validate,
      compileTargetGroups,
      compileListenerRules,
      compilePermissions,
    )

    this.hooks = {
      'package:compileEvents': async () => {
        return pTry(() => {
          this.validated = this.validate()
          if (this.validated.events.length === 0) return

          this.compileTargetGroups()
          this.compileListenerRules()
          this.compilePermissions()
        })
      },
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'alb', {
      type: 'object',
      properties: {
        authorizer: defineArray({ type: 'string' }),
        conditions: {
          type: 'object',
          properties: {
            header: {
              anyOf: [
                defineArray(ALB_HTTP_HEADER_SCHEMA),
                ALB_HTTP_HEADER_SCHEMA,
              ],
            },
            host: defineArray({
              type: 'string',
              pattern: '^[A-Za-z0-9*?.-]+$',
              maxLength: 128,
            }),
            ip: defineArray({ type: 'string' }, { uniqueItems: true }),
            method: defineArray({
              type: 'string',
              pattern: '^[A-Z_-]+$',
              maxLength: 40,
            }),
            path: defineArray({
              type: 'string',
              pattern: '^([A-Za-z0-9*?_.$/~"\'@:+-]|&amp;)+$',
              maxLength: 128,
            }),
            query: {
              type: 'object',
              additionalProperties: { type: 'string', maxLength: 128 },
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
                healthyThresholdCount: {
                  type: 'integer',
                  minimum: 2,
                  maximum: 10,
                },
                intervalSeconds: { type: 'integer', minimum: 5, maximum: 300 },
                matcher: {
                  type: 'object',
                  properties: {
                    httpCode: {
                      type: 'string',
                      pattern: '^\\d{3}(-\\d{3})?(,\\d{3}(-\\d{3})?)*$',
                    },
                  },
                  additionalProperties: false,
                },
                path: { type: 'string', minLength: 1, maxLength: 1024 },
                timeoutSeconds: { type: 'integer', minimum: 2, maximum: 120 },
                unhealthyThresholdCount: {
                  type: 'integer',
                  minimum: 2,
                  maximum: 10,
                },
              },
              additionalProperties: false,
            },
          ],
        },
        listenerArn: {
          anyOf: [
            { $ref: '#/definitions/awsAlbListenerArn' },
            { $ref: '#/definitions/awsCfRef' },
            { $ref: '#/definitions/awsCfImport' },
          ],
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
    })
  }
}

export default AwsCompileAlbEvents
