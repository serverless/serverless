import { jest, describe, beforeEach, it, expect } from '@jest/globals'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

// Import after mocking
const { default: AwsCompileIotFleetProvisioningEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/iot-fleet-provisioning.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileIotFleetProvisioningEvents', () => {
  let serverless
  let awsCompileIotFleetProvisioningEvents
  let options

  const templateBody = {
    Parameters: {
      SerialNumber: { Type: 'String' },
    },
    Resources: {
      thing: {
        Type: 'AWS::IoT::Thing',
        Properties: {
          ThingName: { Ref: 'SerialNumber' },
        },
      },
    },
  }
  const provisioningRoleArn = 'arn:aws:iam::123456789:role/provisioning-role'

  beforeEach(() => {
    options = {
      stage: 'dev',
      region: 'us-east-1',
    }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileIotFleetProvisioningEvents =
      new AwsCompileIotFleetProvisioningEvents(serverless)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileIotFleetProvisioningEvents.provider).toBeInstanceOf(
        AwsProvider,
      )
    })
  })

  describe('#compileIotFleetProvisioningEvents()', () => {
    it('should create IoT ProvisioningTemplate resource', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              iotFleetProvisioning: {
                templateBody: templateBody,
                provisioningRoleArn: provisioningRoleArn,
              },
            },
          ],
        },
      }

      awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents()

      const resources =
        awsCompileIotFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const provisioningTemplates = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::IoT::ProvisioningTemplate',
      )

      expect(provisioningTemplates.length).toBe(1)
      const [, template] = provisioningTemplates[0]
      expect(template.Properties.Enabled).toBe(true)
      expect(template.Properties.ProvisioningRoleArn).toBe(provisioningRoleArn)
      expect(template.Properties.TemplateBody).toBe(
        JSON.stringify(templateBody),
      )
    })

    it('should create Lambda Permission resource', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              iotFleetProvisioning: {
                templateBody: templateBody,
                provisioningRoleArn: provisioningRoleArn,
              },
            },
          ],
        },
      }

      awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents()

      const resources =
        awsCompileIotFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const permissions = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::Permission',
      )

      expect(permissions.length).toBe(1)
      const [, permission] = permissions[0]
      expect(permission.Properties.Action).toBe('lambda:InvokeFunction')
      expect(permission.Properties.Principal).toBe('iot.amazonaws.com')
    })

    it('should support enabled: false', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              iotFleetProvisioning: {
                templateBody: templateBody,
                provisioningRoleArn: provisioningRoleArn,
                enabled: false,
              },
            },
          ],
        },
      }

      awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents()

      const resources =
        awsCompileIotFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const provisioningTemplates = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::IoT::ProvisioningTemplate',
      )

      expect(provisioningTemplates.length).toBe(1)
      const [, template] = provisioningTemplates[0]
      expect(template.Properties.Enabled).toBe(false)
    })

    it('should support custom templateName', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              iotFleetProvisioning: {
                templateBody: templateBody,
                provisioningRoleArn: provisioningRoleArn,
                templateName: 'MyCustomTemplate',
              },
            },
          ],
        },
      }

      awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents()

      const resources =
        awsCompileIotFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const provisioningTemplates = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::IoT::ProvisioningTemplate',
      )

      expect(provisioningTemplates.length).toBe(1)
      const [, template] = provisioningTemplates[0]
      expect(template.Properties.TemplateName).toBe('MyCustomTemplate')
    })

    it('should throw when multiple iotFleetProvisioning events per function', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              iotFleetProvisioning: {
                templateBody: templateBody,
                provisioningRoleArn: provisioningRoleArn,
                templateName: 'Template1',
              },
            },
            {
              iotFleetProvisioning: {
                templateBody: templateBody,
                provisioningRoleArn: provisioningRoleArn,
                templateName: 'Template2',
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents(),
      ).toThrow(/more than one iotFleetProvision/)
    })

    it('should set DependsOn for ProvisioningTemplate to include Permission', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              iotFleetProvisioning: {
                templateBody: templateBody,
                provisioningRoleArn: provisioningRoleArn,
              },
            },
          ],
        },
      }

      awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents()

      const resources =
        awsCompileIotFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const provisioningTemplates = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::IoT::ProvisioningTemplate',
      )
      const permissions = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::Permission',
      )

      expect(provisioningTemplates.length).toBe(1)
      expect(permissions.length).toBe(1)

      const [, template] = provisioningTemplates[0]
      const [permissionLogicalId] = permissions[0]

      expect(template.DependsOn).toContain(permissionLogicalId)
    })

    it('should not create resources when no iotFleetProvisioning events', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents()

      const resources =
        awsCompileIotFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const provisioningTemplates = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::IoT::ProvisioningTemplate',
      )

      expect(provisioningTemplates.length).toBe(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileIotFleetProvisioningEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ sns: 'myTopic' }],
        },
      }

      expect(() =>
        awsCompileIotFleetProvisioningEvents.compileIotFleetProvisioningEvents(),
      ).not.toThrow()
    })
  })
})
