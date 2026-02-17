import validate from './lib/validate.js'
import compileApi from './lib/api.js'
import compileIntegrations from './lib/integrations.js'
import compileRouteResponses from './lib/route-responses.js'
import compilePermissions from './lib/permissions.js'
import compileRoutes from './lib/routes.js'
import compileDeployment from './lib/deployment.js'
import compileStage from './lib/stage.js'
import compileAuthorizers from './lib/authorizers.js'

class AwsCompileWebsockets {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    Object.assign(
      this,
      validate,
      compileApi,
      compileIntegrations,
      compileRouteResponses,
      compileAuthorizers,
      compilePermissions,
      compileRoutes,
      compileDeployment,
      compileStage,
    )

    this.hooks = {
      'package:compileEvents': async () => {
        this.validated = this.validate()

        if (this.validated.events.length === 0) {
          return Promise.resolve()
        }

        return Promise.resolve(this)
          .then(() => this.compileApi())
          .then(() => this.compileIntegrations())
          .then(() => this.compileRouteResponses())
          .then(() => this.compileAuthorizers())
          .then(() => this.compilePermissions())
          .then(() => this.compileRoutes())
          .then(() => this.compileStage())
          .then(() => this.compileDeployment())
      },
    }

    this.serverless.configSchemaHandler.defineFunctionEvent(
      'aws',
      'websocket',
      {
        description: `WebSocket API event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/websocket
@remarks ID of existing WebSocket API.
@example
events:
  - websocket:
      route: $connect
      authorizer: myAuth
  - websocket:
      route: sendMessage`,
        anyOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: {
              route: {
                description: `WebSocket route key.
@see https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html
@example '$connect' | '$disconnect' | '$default' | 'sendMessage'`,
                type: 'string',
              },
              routeResponseSelectionExpression: {
                description: `Route response selection expression.
@example '$default'`,
                const: '$default',
              },
              authorizer: {
                description: `WebSocket API authorizer configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/websocket#using-authorizers`,
                anyOf: [
                  { $ref: '#/definitions/awsArnString' },
                  { $ref: '#/definitions/functionName' },
                  {
                    type: 'object',
                    properties: {
                      name: { $ref: '#/definitions/functionName' },
                      arn: { $ref: '#/definitions/awsArn' },
                      identitySource: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                    anyOf: [{ required: ['name'] }, { required: ['arn'] }],
                    additionalProperties: false,
                  },
                ],
              },
            },
            required: ['route'],
            additionalProperties: false,
          },
        ],
      },
    )
  }
}

export default AwsCompileWebsockets
