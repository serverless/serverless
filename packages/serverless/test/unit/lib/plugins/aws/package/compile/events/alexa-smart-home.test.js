import { jest, describe, beforeEach, it, expect } from '@jest/globals'

// Mock @serverless/util
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

const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: AwsCompileAlexaSmartHomeEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/alexa-smart-home.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileAlexaSmartHomeEvents', () => {
  let serverless
  let awsCompileAlexaSmartHomeEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileAlexaSmartHomeEvents = new AwsCompileAlexaSmartHomeEvents(
      serverless,
      options,
    )
    awsCompileAlexaSmartHomeEvents.serverless.service.service = 'new-service'
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileAlexaSmartHomeEvents.provider).toBeInstanceOf(
        AwsProvider,
      )
    })
  })

  describe('#compileAlexaSmartHomeEvents()', () => {
    it('should create corresponding resources when alexaSmartHome events are given', () => {
      awsCompileAlexaSmartHomeEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexaSmartHome: {
                appId: 'amzn1.ask.skill.xx-xx-xx-xx',
                enabled: false,
              },
            },
            {
              alexaSmartHome: {
                appId: 'amzn1.ask.skill.yy-yy-yy-yy',
                enabled: true,
              },
            },
            {
              alexaSmartHome: 'amzn1.ask.skill.zz-zz-zz-zz',
            },
          ],
        },
      }

      awsCompileAlexaSmartHomeEvents.compileAlexaSmartHomeEvents()

      const resources =
        awsCompileAlexaSmartHomeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLambdaPermissionAlexaSmartHome1.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(resources.FirstLambdaPermissionAlexaSmartHome2.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(resources.FirstLambdaPermissionAlexaSmartHome3.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome1.Properties.FunctionName,
      ).toEqual({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] })
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome2.Properties.FunctionName,
      ).toEqual({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] })
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome3.Properties.FunctionName,
      ).toEqual({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] })
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome1.Properties.Action,
      ).toBe('lambda:DisableInvokeFunction')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome2.Properties.Action,
      ).toBe('lambda:InvokeFunction')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome3.Properties.Action,
      ).toBe('lambda:InvokeFunction')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome1.Properties.Principal,
      ).toBe('alexa-connectedhome.amazon.com')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome2.Properties.Principal,
      ).toBe('alexa-connectedhome.amazon.com')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome3.Properties.Principal,
      ).toBe('alexa-connectedhome.amazon.com')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome1.Properties
          .EventSourceToken,
      ).toBe('amzn1.ask.skill.xx-xx-xx-xx')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome2.Properties
          .EventSourceToken,
      ).toBe('amzn1.ask.skill.yy-yy-yy-yy')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome3.Properties
          .EventSourceToken,
      ).toBe('amzn1.ask.skill.zz-zz-zz-zz')
    })

    it('should respect enabled variable, defaulting to true', () => {
      awsCompileAlexaSmartHomeEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexaSmartHome: {
                appId: 'amzn1.ask.skill.xx-xx-xx-xx',
                enabled: false,
              },
            },
            {
              alexaSmartHome: {
                appId: 'amzn1.ask.skill.yy-yy-yy-yy',
                enabled: true,
              },
            },
            {
              alexaSmartHome: {
                appId: 'amzn1.ask.skill.jj-jj-jj-jj',
              },
            },
            {
              alexaSmartHome: 'amzn1.ask.skill.zz-zz-zz-zz',
            },
          ],
        },
      }

      awsCompileAlexaSmartHomeEvents.compileAlexaSmartHomeEvents()

      const resources =
        awsCompileAlexaSmartHomeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstLambdaPermissionAlexaSmartHome1.Properties.Action,
      ).toBe('lambda:DisableInvokeFunction')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome2.Properties.Action,
      ).toBe('lambda:InvokeFunction')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome3.Properties.Action,
      ).toBe('lambda:InvokeFunction')
      expect(
        resources.FirstLambdaPermissionAlexaSmartHome4.Properties.Action,
      ).toBe('lambda:InvokeFunction')
    })

    it('should not create corresponding resources when alexaSmartHome events are not given', () => {
      awsCompileAlexaSmartHomeEvents.serverless.service.functions = {
        first: {
          events: ['alexaSkill'],
        },
      }

      awsCompileAlexaSmartHomeEvents.compileAlexaSmartHomeEvents()

      expect(
        awsCompileAlexaSmartHomeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources,
      ).toEqual({})
    })

    it('should not create corresponding resources when events are not given', () => {
      awsCompileAlexaSmartHomeEvents.serverless.service.functions = {
        first: {},
      }

      awsCompileAlexaSmartHomeEvents.compileAlexaSmartHomeEvents()

      expect(
        awsCompileAlexaSmartHomeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources,
      ).toEqual({})
    })
  })
})
