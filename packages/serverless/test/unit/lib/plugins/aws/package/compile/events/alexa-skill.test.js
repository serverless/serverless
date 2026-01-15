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

const { default: AwsProvider } =
  await import('../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileAlexaSkillEvents } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/alexa-skill.js')
const { default: Serverless } =
  await import('../../../../../../../../lib/serverless.js')

describe('AwsCompileAlexaSkillEvents', () => {
  let serverless
  let awsCompileAlexaSkillEvents

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
    awsCompileAlexaSkillEvents = new AwsCompileAlexaSkillEvents(
      serverless,
      options,
    )
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileAlexaSkillEvents.provider).toBeInstanceOf(AwsProvider)
    })

    it('should hook into the "package:compileEvents" hook', () => {
      expect(
        awsCompileAlexaSkillEvents.hooks['package:compileEvents'],
      ).toBeDefined()
    })
  })

  describe('#compileAlexaSkillEvents()', () => {
    it('should create corresponding resources when multiple alexaSkill events are provided', () => {
      const skillId1 = 'amzn1.ask.skill.xx-xx-xx-xx'
      const skillId2 = 'amzn1.ask.skill.yy-yy-yy-yy'
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexaSkill: skillId1,
            },
            {
              alexaSkill: {
                appId: skillId2,
              },
            },
          ],
        },
      }

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents()

      const resources =
        awsCompileAlexaSkillEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLambdaPermissionAlexaSkill1.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(
        resources.FirstLambdaPermissionAlexaSkill1.Properties.FunctionName,
      ).toEqual({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      })
      expect(resources.FirstLambdaPermissionAlexaSkill1.Properties.Action).toBe(
        'lambda:InvokeFunction',
      )
      expect(
        resources.FirstLambdaPermissionAlexaSkill1.Properties.Principal,
      ).toBe('alexa-appkit.amazon.com')
      expect(
        resources.FirstLambdaPermissionAlexaSkill1.Properties.EventSourceToken,
      ).toBe(skillId1)

      expect(resources.FirstLambdaPermissionAlexaSkill2.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(
        resources.FirstLambdaPermissionAlexaSkill2.Properties.FunctionName,
      ).toEqual({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      })
      expect(resources.FirstLambdaPermissionAlexaSkill2.Properties.Action).toBe(
        'lambda:InvokeFunction',
      )
      expect(
        resources.FirstLambdaPermissionAlexaSkill2.Properties.Principal,
      ).toBe('alexa-appkit.amazon.com')
      expect(
        resources.FirstLambdaPermissionAlexaSkill2.Properties.EventSourceToken,
      ).toBe(skillId2)
    })

    it('should create corresponding resources when a disabled alexaSkill event is provided', () => {
      const skillId1 = 'amzn1.ask.skill.xx-xx-xx-xx'
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexaSkill: {
                appId: skillId1,
                enabled: false,
              },
            },
          ],
        },
      }

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents()

      const resources =
        awsCompileAlexaSkillEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLambdaPermissionAlexaSkill1.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(
        resources.FirstLambdaPermissionAlexaSkill1.Properties.FunctionName,
      ).toEqual({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      })
      expect(resources.FirstLambdaPermissionAlexaSkill1.Properties.Action).toBe(
        'lambda:DisableInvokeFunction',
      )
      expect(
        resources.FirstLambdaPermissionAlexaSkill1.Properties.Principal,
      ).toBe('alexa-appkit.amazon.com')
      expect(
        resources.FirstLambdaPermissionAlexaSkill1.Properties.EventSourceToken,
      ).toBe(skillId1)
    })

    it('should not create corresponding resources when alexaSkill event is not given', () => {
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents()

      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources,
      ).toEqual({})
    })

    it('should not throw error when other events are present', () => {
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'get',
                path: '/',
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileAlexaSkillEvents.compileAlexaSkillEvents(),
      ).not.toThrow()
    })
  })
})
