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
      description: `Application Load Balancer event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/alb`,
      type: 'object',
      properties: {
        authorizer: {
          description: `ALB authorizer names configured in provider.alb.authorizers.
@see https://www.serverless.com/framework/docs/providers/aws/events/alb#add-cognitocustom-idp-provider-authentication`,
          ...defineArray({ type: 'string' }),
        },
        conditions: {
          description: `ALB listener rule conditions.`,
          type: 'object',
          properties: {
            header: {
              description: `HTTP header match conditions.`,
              anyOf: [
                defineArray(ALB_HTTP_HEADER_SCHEMA),
                ALB_HTTP_HEADER_SCHEMA,
              ],
            },
            host: {
              description: `Host header match patterns.`,
              ...defineArray({
                type: 'string',
                pattern: '^[A-Za-z0-9*?.-]+$',
                maxLength: 128,
              }),
            },
            ip: {
              description: `Source IP CIDR values.`,
              ...defineArray({ type: 'string' }, { uniqueItems: true }),
            },
            method: {
              description: `HTTP method match patterns.`,
              ...defineArray({
                type: 'string',
                pattern: '^[A-Z_-]+$',
                maxLength: 40,
              }),
            },
            path: {
              description: `Path match patterns.`,
              ...defineArray({
                type: 'string',
                pattern: '^([A-Za-z0-9*?_.$/~"\'@:+-]|&amp;)+$',
                maxLength: 128,
              }),
            },
            query: {
              description: `Query string match conditions.`,
              type: 'object',
              additionalProperties: { type: 'string', maxLength: 128 },
              propertyNames: { type: 'string', maxLength: 128 },
            },
          },
          additionalProperties: false,
        },
        healthCheck: {
          description: `Target group health check overrides.`,
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
          description: `ALB listener ARN.`,
          anyOf: [
            { $ref: '#/definitions/awsAlbListenerArn' },
            { $ref: '#/definitions/awsCfRef' },
          ],
        },
        multiValueHeaders: {
          description: `Enable multi-value headers support.`,
          type: 'boolean',
        },
        priority: {
          description: `Listener rule priority.`,
          type: 'integer',
          minimum: 1,
          maximum: 50000,
        },
        targetGroupName: {
          description: `Custom target group name.`,
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
