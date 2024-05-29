'use strict'

const expect = require('chai').expect
const AwsCompileWebsocketsEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index')
const Serverless = require('../../../../../../../../../../lib/serverless')
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider')
const runServerless = require('../../../../../../../../../utils/run-serverless')

describe('#compileAuthorizers()', () => {
  let awsCompileWebsocketsEvents

  describe('for routes with authorizer definition', () => {
    beforeEach(() => {
      const serverless = new Serverless({ commands: [], options: {} })
      serverless.setProvider('aws', new AwsProvider(serverless))
      serverless.service.provider.compiledCloudFormationTemplate = {
        Resources: {},
      }
      serverless.service.functions = {
        auth: {},
      }
      awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless)

      awsCompileWebsocketsEvents.websocketsApiLogicalId =
        awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId()

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
    })

    it('should create an authorizer resource', () => {
      awsCompileWebsocketsEvents.compileAuthorizers()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources).to.deep.equal({
        AuthWebsocketsAuthorizer: {
          DependsOn: undefined,
          Type: 'AWS::ApiGatewayV2::Authorizer',
          Properties: {
            ApiId: {
              Ref: 'WebsocketsApi',
            },
            Name: 'auth',
            AuthorizerType: 'REQUEST',
            AuthorizerUri: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':apigateway:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':lambda:path/2015-03-31/functions/',
                  {
                    'Fn::GetAtt': ['AuthLambdaFunction', 'Arn'],
                  },
                  '/invocations',
                ],
              ],
            },
            IdentitySource: ['route.request.header.Auth'],
          },
        },
      })
    })

    it('should use existing Api if there is predefined websocketApi config', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
        websocketApiId: '5ezys3sght',
      }

      awsCompileWebsocketsEvents.compileAuthorizers()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.AuthWebsocketsAuthorizer.Properties).to.contain({
        ApiId: '5ezys3sght',
      })
    })
  })

  describe('for routes without authorizer definition', () => {
    beforeEach(() => {
      const serverless = new Serverless({ commands: [], options: {} })
      serverless.setProvider('aws', new AwsProvider(serverless))
      serverless.service.provider.compiledCloudFormationTemplate = {
        Resources: {},
      }

      awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless)

      awsCompileWebsocketsEvents.websocketsApiLogicalId =
        awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId()

      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
          },
        ],
      }
    })

    it('should NOT create an authorizer resource for routes with not authorizer definition', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
          },
        ],
      }

      awsCompileWebsocketsEvents.compileAuthorizers()
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources).to.deep.equal({})
    })
  })

  describe('external authorizer', () => {
    it('should add a permission resource for the external authorizer function', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'websocket-external-auth',
        command: 'package',
      })
      expect(cfTemplate.Resources.AuthLambdaPermissionWebsockets).to.deep.equal(
        {
          Type: 'AWS::Lambda::Permission',
          DependsOn: ['WebsocketsApi'],
          Properties: {
            Action: 'lambda:InvokeFunction',
            Principal: 'apigateway.amazonaws.com',
            FunctionName: 'arn:aws:lambda:us-east-1:000000000000:function:auth',
          },
        },
      )
    })
  })
})
