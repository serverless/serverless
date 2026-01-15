import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: Serverless } =
  await import('../../../../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileWebsocketsEvents } =
  await import('../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index.js')
const { default: pickWebsocketsTemplatePart } =
  await import('../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/lib/pick-websockets-template-part.js')

describe('AwsCompileWebsocketsEvents', () => {
  let serverless
  let awsCompileWebsocketsEvents
  let options

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    options = { stage: 'dev', region: 'us-east-1' }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'my-service'
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    serverless.service.functions = {
      First: {},
      Second: {},
      auth: {},
    }
    serverless.cli = { log: () => {} }

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(
      serverless,
      options,
    )
    awsCompileWebsocketsEvents.websocketsApiLogicalId =
      awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId()
  })

  describe('#constructor()', () => {
    it('should have hooks', () => {
      expect(awsCompileWebsocketsEvents.hooks).toBeDefined()
      expect(
        awsCompileWebsocketsEvents.hooks['package:compileEvents'],
      ).toBeDefined()
    })

    it('should set the provider variable to be an instanceof AwsProvider', () => {
      expect(awsCompileWebsocketsEvents.provider).toBeInstanceOf(AwsProvider)
    })

    describe('"package:compileEvents" promise chain', () => {
      it('should run the promise chain when there are websocket events', async () => {
        // Set up functions with websocket events
        awsCompileWebsocketsEvents.serverless.service.functions = {
          first: {
            events: [{ websocket: '$connect' }],
          },
        }

        // Store original methods
        const originalCompileApi = awsCompileWebsocketsEvents.compileApi
        const originalCompileIntegrations =
          awsCompileWebsocketsEvents.compileIntegrations
        const originalCompileAuthorizers =
          awsCompileWebsocketsEvents.compileAuthorizers
        const originalCompilePermissions =
          awsCompileWebsocketsEvents.compilePermissions
        const originalCompileRoutes = awsCompileWebsocketsEvents.compileRoutes
        const originalCompileDeployment =
          awsCompileWebsocketsEvents.compileDeployment
        const originalCompileStage = awsCompileWebsocketsEvents.compileStage

        // Create mock functions
        let callOrder = []
        awsCompileWebsocketsEvents.compileApi = jest
          .fn()
          .mockImplementation(() => {
            callOrder.push('compileApi')
          })
        awsCompileWebsocketsEvents.compileIntegrations = jest
          .fn()
          .mockImplementation(() => {
            callOrder.push('compileIntegrations')
          })
        awsCompileWebsocketsEvents.compileAuthorizers = jest
          .fn()
          .mockImplementation(() => {
            callOrder.push('compileAuthorizers')
          })
        awsCompileWebsocketsEvents.compilePermissions = jest
          .fn()
          .mockImplementation(() => {
            callOrder.push('compilePermissions')
          })
        awsCompileWebsocketsEvents.compileRoutes = jest
          .fn()
          .mockImplementation(() => {
            callOrder.push('compileRoutes')
          })
        awsCompileWebsocketsEvents.compileDeployment = jest
          .fn()
          .mockImplementation(() => {
            callOrder.push('compileDeployment')
          })
        awsCompileWebsocketsEvents.compileStage = jest
          .fn()
          .mockImplementation(() => {
            callOrder.push('compileStage')
          })

        await awsCompileWebsocketsEvents.hooks['package:compileEvents']()

        // Verify order
        expect(callOrder).toEqual([
          'compileApi',
          'compileIntegrations',
          'compileAuthorizers',
          'compilePermissions',
          'compileRoutes',
          'compileStage',
          'compileDeployment',
        ])

        // Restore original methods
        awsCompileWebsocketsEvents.compileApi = originalCompileApi
        awsCompileWebsocketsEvents.compileIntegrations =
          originalCompileIntegrations
        awsCompileWebsocketsEvents.compileAuthorizers =
          originalCompileAuthorizers
        awsCompileWebsocketsEvents.compilePermissions =
          originalCompilePermissions
        awsCompileWebsocketsEvents.compileRoutes = originalCompileRoutes
        awsCompileWebsocketsEvents.compileDeployment = originalCompileDeployment
        awsCompileWebsocketsEvents.compileStage = originalCompileStage
      })

      it('should resolve if no functions are given', async () => {
        awsCompileWebsocketsEvents.serverless.service.functions = {}

        await expect(
          awsCompileWebsocketsEvents.hooks['package:compileEvents'](),
        ).resolves.not.toThrow()
      })
    })
  })

  describe('#validate()', () => {
    it('should support the simplified string syntax', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        first: {
          events: [{ websocket: '$connect' }],
        },
      }
      const validated = awsCompileWebsocketsEvents.validate()
      expect(validated.events).toEqual([
        {
          functionName: 'first',
          route: '$connect',
        },
      ])
    })

    it('should support the extended object syntax', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        first: {
          events: [{ websocket: { route: '$connect' } }],
        },
      }
      const validated = awsCompileWebsocketsEvents.validate()
      expect(validated.events).toEqual([
        {
          functionName: 'first',
          route: '$connect',
        },
      ])
    })

    it('should add authorizer config when authorizer is specified as a string', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        auth: { events: [] },
        first: {
          events: [
            {
              websocket: {
                route: '$connect',
                authorizer: 'auth',
              },
            },
          ],
        },
      }
      const validated = awsCompileWebsocketsEvents.validate()
      expect(validated.events[0].authorizer).toBeDefined()
      expect(validated.events[0].authorizer.name).toBe('auth')
      expect(validated.events[0].authorizer.identitySource).toEqual([
        'route.request.header.Auth',
      ])
    })

    it('should add authorizer config when authorizer is specified as an object', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        auth: { events: [] },
        first: {
          events: [
            {
              websocket: {
                route: '$connect',
                authorizer: {
                  name: 'auth',
                  identitySource: [
                    'route.request.header.Auth',
                    'route.request.querystring.Auth',
                  ],
                },
              },
            },
          ],
        },
      }
      const validated = awsCompileWebsocketsEvents.validate()
      expect(validated.events[0].authorizer.identitySource).toEqual([
        'route.request.header.Auth',
        'route.request.querystring.Auth',
      ])
    })

    it('should add routeResponse when routeResponseSelectionExpression is configured', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        first: {
          events: [
            {
              websocket: {
                route: '$connect',
                routeResponseSelectionExpression: '$default',
              },
            },
          ],
        },
      }
      const validated = awsCompileWebsocketsEvents.validate()
      expect(validated.events[0].routeResponseSelectionExpression).toBe(
        '$default',
      )
    })

    it('should ignore non-websocket events', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        first: {
          events: [{ ignored: {} }],
        },
      }
      const validated = awsCompileWebsocketsEvents.validate()
      expect(validated.events).toHaveLength(0)
    })
  })

  describe('#compileRoutes()', () => {
    it('should create a route resource for every event', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          { functionName: 'First', route: '$connect' },
          { functionName: 'Second', route: '$disconnect' },
        ],
      }

      awsCompileWebsocketsEvents.compileRoutes()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.SconnectWebsocketsRoute.Type).toBe(
        'AWS::ApiGatewayV2::Route',
      )
      expect(resources.SconnectWebsocketsRoute.Properties.RouteKey).toBe(
        '$connect',
      )
      expect(resources.SdisconnectWebsocketsRoute.Type).toBe(
        'AWS::ApiGatewayV2::Route',
      )
      expect(resources.SdisconnectWebsocketsRoute.Properties.RouteKey).toBe(
        '$disconnect',
      )
    })

    it('should set routeResponseSelectionExpression when configured', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            routeResponseSelectionExpression: '$default',
          },
        ],
      }

      awsCompileWebsocketsEvents.compileRoutes()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.SconnectWebsocketsRoute.Properties
          .RouteResponseSelectionExpression,
      ).toBe('$default')
    })

    it('should set authorizer property for the connect route', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            authorizer: { name: 'auth' },
          },
        ],
      }

      awsCompileWebsocketsEvents.compileRoutes()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.SconnectWebsocketsRoute.Properties.AuthorizationType,
      ).toBe('CUSTOM')
      expect(
        resources.SconnectWebsocketsRoute.Properties.AuthorizerId,
      ).toBeDefined()
    })
  })

  describe('#compileIntegrations()', () => {
    it('should create an integration resource for every event', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          { functionName: 'First', route: '$connect' },
          { functionName: 'Second', route: '$disconnect' },
        ],
      }

      awsCompileWebsocketsEvents.compileIntegrations()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstWebsocketsIntegration.Type).toBe(
        'AWS::ApiGatewayV2::Integration',
      )
      expect(
        resources.FirstWebsocketsIntegration.Properties.IntegrationType,
      ).toBe('AWS_PROXY')
      expect(resources.SecondWebsocketsIntegration.Type).toBe(
        'AWS::ApiGatewayV2::Integration',
      )
    })
  })

  describe('#compileAuthorizers()', () => {
    it('should create an authorizer resource for routes with authorizer', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            authorizer: {
              name: 'auth',
              uri: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':apigateway:',
                    { Ref: 'AWS::Region' },
                    ':lambda:path/2015-03-31/functions/',
                    { 'Fn::GetAtt': ['AuthLambdaFunction', 'Arn'] },
                    '/invocations',
                  ],
                ],
              },
              identitySource: ['route.request.header.Auth'],
            },
          },
        ],
      }

      awsCompileWebsocketsEvents.compileAuthorizers()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.AuthWebsocketsAuthorizer.Type).toBe(
        'AWS::ApiGatewayV2::Authorizer',
      )
      expect(resources.AuthWebsocketsAuthorizer.Properties.Name).toBe('auth')
      expect(resources.AuthWebsocketsAuthorizer.Properties.AuthorizerType).toBe(
        'REQUEST',
      )
    })

    it('should use existing Api if websocketApiId is specified', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
        websocketApiId: '5ezys3sght',
      }

      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            authorizer: {
              name: 'auth',
              uri: { 'Fn::Join': ['', ['arn:']] },
              identitySource: ['route.request.header.Auth'],
            },
          },
        ],
      }

      awsCompileWebsocketsEvents.compileAuthorizers()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.AuthWebsocketsAuthorizer.Properties.ApiId).toBe(
        '5ezys3sght',
      )
    })

    it('should NOT create an authorizer for routes without authorizer', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [{ functionName: 'First', route: '$connect' }],
      }

      awsCompileWebsocketsEvents.compileAuthorizers()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(Object.keys(resources)).toHaveLength(0)
    })
  })

  describe('#compilePermissions()', () => {
    it('should create a permission resource for every event', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          { functionName: 'First', route: '$connect' },
          { functionName: 'Second', route: '$disconnect' },
        ],
      }

      awsCompileWebsocketsEvents.compilePermissions()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLambdaPermissionWebsockets.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(resources.SecondLambdaPermissionWebsockets.Type).toBe(
        'AWS::Lambda::Permission',
      )
    })

    it('should create a permission resource for authorizer function', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            authorizer: {
              name: 'auth',
              permission: 'AuthLambdaFunction',
            },
          },
        ],
      }

      awsCompileWebsocketsEvents.compilePermissions()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.AuthLambdaPermissionWebsockets).toBeDefined()
      expect(resources.AuthLambdaPermissionWebsockets.Type).toBe(
        'AWS::Lambda::Permission',
      )
    })
  })

  describe('#compileDeployment()', () => {
    it('should create a deployment resource and output', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          { functionName: 'First', route: '$connect' },
          { functionName: 'Second', route: '$disconnect' },
        ],
      }

      awsCompileWebsocketsEvents.compileDeployment()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      const outputs =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Outputs

      const deploymentLogicalId = Object.keys(resources)[0]
      expect(deploymentLogicalId).toMatch(/WebsocketsDeployment/)
      expect(resources[deploymentLogicalId].Type).toBe(
        'AWS::ApiGatewayV2::Deployment',
      )
      expect(outputs.ServiceEndpointWebsocket).toBeDefined()
    })

    it('should create a deployment with StageName if websocketApiId is specified', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
        websocketApiId: 'xyz123abc',
      }
      awsCompileWebsocketsEvents.validated = {
        events: [{ functionName: 'First', route: '$connect' }],
      }

      awsCompileWebsocketsEvents.compileDeployment()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const deploymentLogicalId = Object.keys(resources)[0]
      expect(resources[deploymentLogicalId].Properties.ApiId).toBe('xyz123abc')
      expect(resources[deploymentLogicalId].Properties.StageName).toBe('dev')
    })
  })

  describe('#compileStage()', () => {
    it('should create a stage resource if no websocketApiId specified', async () => {
      await awsCompileWebsocketsEvents.compileStage()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.WebsocketsDeploymentStage).toBeDefined()
      expect(resources.WebsocketsDeploymentStage.Type).toBe(
        'AWS::ApiGatewayV2::Stage',
      )
      expect(resources.WebsocketsDeploymentStage.Properties.StageName).toBe(
        'dev',
      )
    })

    it('should not create a stage resource if websocketApiId is specified', async () => {
      awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
        websocketApiId: 'xyz123abc',
      }

      await awsCompileWebsocketsEvents.compileStage()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(Object.keys(resources)).toHaveLength(0)
    })

    // Note: Logs tests require `runServerless` because they involve custom resource handling
    // which needs a valid serviceDir for file system operations. The core stage compilation
    // tests above cover the main functionality.
  })

  describe('#compileRouteResponses()', () => {
    it('should create a RouteResponse resource for events with selection expression', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            routeResponseSelectionExpression: '$default',
          },
        ],
      }

      awsCompileWebsocketsEvents.compileRouteResponses()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.SconnectWebsocketsRouteResponse).toBeDefined()
      expect(resources.SconnectWebsocketsRouteResponse.Type).toBe(
        'AWS::ApiGatewayV2::RouteResponse',
      )
      expect(
        resources.SconnectWebsocketsRouteResponse.Properties.RouteResponseKey,
      ).toBe('$default')
    })

    it('should NOT create a RouteResponse for events without selection expression', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [{ functionName: 'First', route: '$connect' }],
      }

      awsCompileWebsocketsEvents.compileRouteResponses()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(Object.keys(resources)).toHaveLength(0)
    })
  })

  describe('no events', () => {
    it('should not create any resources when no websocket events', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        first: { events: [] },
      }

      const validated = awsCompileWebsocketsEvents.validate()
      expect(validated.events).toHaveLength(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileWebsocketsEvents.serverless.service.functions = {
        first: {
          events: [{ http: { path: 'foo', method: 'get' } }],
        },
      }

      expect(() => awsCompileWebsocketsEvents.validate()).not.toThrow()
    })
  })
})

describe('pickWebsocketsTemplatePart', () => {
  it('picks resources from a CloudFormation template related to WebsocketsApi', () => {
    const initialCloudFormationTemplate = {
      Resources: {
        ConnectLambdaFunction: {
          Type: 'AWS::Lambda::Function',
        },
        ConnectLambdaVersionvrs0fircL2xSCvlNyt7PIt2ARu2EKctxNJziUZEeHs: {
          Type: 'AWS::Lambda::Version',
          DeletionPolicy: 'Retain',
        },
        WebsocketsApi: {
          Type: 'AWS::ApiGatewayV2::Api',
          Properties: { ProtocolType: 'WEBSOCKET' },
        },
        DefaultLambdaPermissionWebsockets: {
          Type: 'AWS::Lambda::Permission',
          DependsOn: ['WebsocketsApi'],
        },
        SconnectWebsocketsRoute: {
          Type: 'AWS::ApiGatewayV2::Route',
          Properties: {
            ApiId: { Ref: 'WebsocketsApi' },
            RouteKey: '$connect',
          },
        },
      },
    }

    const result = pickWebsocketsTemplatePart(
      initialCloudFormationTemplate,
      'WebsocketsApi',
    )

    expect(result.WebsocketsApi).toBeDefined()
    expect(result.DefaultLambdaPermissionWebsockets).toBeDefined()
    expect(result.SconnectWebsocketsRoute).toBeDefined()
    expect(result.ConnectLambdaFunction).toBeUndefined()
  })
})
