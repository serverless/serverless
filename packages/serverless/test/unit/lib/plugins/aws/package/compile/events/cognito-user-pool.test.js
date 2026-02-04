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

// Mock custom-resources module
const addCustomResourceToServiceMock = jest.fn().mockResolvedValue()
jest.unstable_mockModule(
  '../../../../../../../../lib/plugins/aws/custom-resources/index.js',
  () => ({
    addCustomResourceToService: addCustomResourceToServiceMock,
  }),
)

// Import after mocking
const { default: AwsCompileCognitoUserPoolEvents } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/cognito-user-pool.js')
const { default: AwsProvider } =
  await import('../../../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../../../lib/serverless.js')

describe('AwsCompileCognitoUserPoolEvents', () => {
  let serverless
  let awsCompileCognitoUserPoolEvents

  beforeEach(() => {
    addCustomResourceToServiceMock.mockClear()
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileCognitoUserPoolEvents = new AwsCompileCognitoUserPoolEvents(
      serverless,
    )
    awsCompileCognitoUserPoolEvents.serverless.service.service = 'new-service'
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileCognitoUserPoolEvents.provider).toBeInstanceOf(
        AwsProvider,
      )
    })
  })

  describe('#newCognitoUserPools()', () => {
    it('should create resources when CUP events are given as separate functions', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
        second: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool2',
                trigger: 'PostConfirmation',
              },
            },
          ],
        },
      }

      awsCompileCognitoUserPoolEvents.newCognitoUserPools()

      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Should create user pools
      const userPools = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Cognito::UserPool',
      )
      expect(userPools.length).toBe(2)

      // Should create Lambda permissions
      const permissions = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::Permission',
      )
      expect(permissions.length).toBe(2)
    })

    it('should create single pool when multiple triggers reference same pool', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
        second: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PostConfirmation',
              },
            },
          ],
        },
      }

      awsCompileCognitoUserPoolEvents.newCognitoUserPools()

      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Should create only one user pool
      const userPools = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Cognito::UserPool',
      )
      expect(userPools.length).toBe(1)

      // The pool should have both triggers
      const [, pool] = userPools[0]
      expect(pool.Properties.LambdaConfig.PreSignUp).toBeDefined()
      expect(pool.Properties.LambdaConfig.PostConfirmation).toBeDefined()
    })

    it('should create Lambda permission with correct principal', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
      }

      awsCompileCognitoUserPoolEvents.newCognitoUserPools()

      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const permissions = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::Permission',
      )

      expect(permissions.length).toBe(1)
      const [, permission] = permissions[0]
      expect(permission.Properties.Principal).toBe('cognito-idp.amazonaws.com')
    })

    it('should support CustomSMSSender trigger with kmsKeyId', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'CustomSMSSender',
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
              },
            },
          ],
        },
      }

      awsCompileCognitoUserPoolEvents.newCognitoUserPools()

      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const userPools = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Cognito::UserPool',
      )

      expect(userPools.length).toBe(1)
      const [, pool] = userPools[0]
      expect(pool.Properties.LambdaConfig.CustomSMSSender).toBeDefined()
      expect(pool.Properties.LambdaConfig.KMSKeyID).toBe(
        'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
      )
    })

    it('should support CustomEmailSender trigger with kmsKeyId', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'CustomEmailSender',
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
              },
            },
          ],
        },
      }

      awsCompileCognitoUserPoolEvents.newCognitoUserPools()

      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const userPools = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Cognito::UserPool',
      )

      expect(userPools.length).toBe(1)
      const [, pool] = userPools[0]
      expect(pool.Properties.LambdaConfig.CustomEmailSender).toBeDefined()
    })

    it('should not create resources when no cognitoUserPool events are given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [{ http: { method: 'get', path: '/' } }],
        },
      }

      awsCompileCognitoUserPoolEvents.newCognitoUserPools()

      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const userPools = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Cognito::UserPool',
      )

      expect(userPools.length).toBe(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      expect(() =>
        awsCompileCognitoUserPoolEvents.newCognitoUserPools(),
      ).not.toThrow()
    })

    it('should support multiple triggers for same function', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PostConfirmation',
              },
            },
          ],
        },
      }

      awsCompileCognitoUserPoolEvents.newCognitoUserPools()

      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const userPools = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Cognito::UserPool',
      )

      expect(userPools.length).toBe(1)
      const [, pool] = userPools[0]
      expect(pool.Properties.LambdaConfig.PreSignUp).toBeDefined()
      expect(pool.Properties.LambdaConfig.PostConfirmation).toBeDefined()
    })
  })

  describe('#existingCognitoUserPools()', () => {
    it('should call addCustomResourceToService for existing pools', async () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'PreSignUp',
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileCognitoUserPoolEvents.existingCognitoUserPools()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
    })

    it('should not create resources for non-existing pool events', async () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
                existing: false,
              },
            },
          ],
        },
      }

      await awsCompileCognitoUserPoolEvents.existingCognitoUserPools()

      expect(addCustomResourceToServiceMock).not.toHaveBeenCalled()
    })

    it('should support CustomSMSSender with existing pool', async () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'CustomSMSSender',
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileCognitoUserPoolEvents.existingCognitoUserPools()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
    })

    it('should throw error when multiple pools configured per function', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'Pool1',
                trigger: 'PreSignUp',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'Pool2',
                trigger: 'PostConfirmation',
                existing: true,
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileCognitoUserPoolEvents.existingCognitoUserPools(),
      ).toThrow(/Only one Cognito User Pool can be configured per function/)
    })

    it('should support forceDeploy setting', async () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'PreSignUp',
                forceDeploy: true,
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileCognitoUserPoolEvents.existingCognitoUserPools()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
      // Check that ForceDeploy is a number (timestamp) in the Resources
      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      const customResources = Object.entries(resources).filter(
        ([, r]) => r.Type === 'Custom::CognitoUserPool',
      )
      expect(customResources.length).toBe(1)
      expect(typeof customResources[0][1].Properties.ForceDeploy).toBe('number')
    })

    it('should support multiple event definitions for same existing pool', async () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'PreSignUp',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'PostConfirmation',
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileCognitoUserPoolEvents.existingCognitoUserPools()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
      // Check the Resources
      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      const customResources = Object.entries(resources).filter(
        ([, r]) => r.Type === 'Custom::CognitoUserPool',
      )
      expect(customResources.length).toBe(1)
      // Should have multiple UserPoolConfigs
      expect(customResources[0][1].Properties.UserPoolConfigs).toHaveLength(2)
    })

    it('should throw error when different KMS keys for same pool', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'CustomSMSSender',
                kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/key-1',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'CustomEmailSender',
                kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/key-2',
                existing: true,
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileCognitoUserPoolEvents.existingCognitoUserPools(),
      ).toThrow(/Only one KMS Key/)
    })

    it('should throw error when CustomSMSSender without KMS key', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyExistingPool',
                trigger: 'CustomSMSSender',
                existing: true,
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileCognitoUserPoolEvents.existingCognitoUserPools(),
      ).toThrow(/KMS Key must be set/)
    })

    it('should create resources for diff funcs with single event each', async () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'Pool1',
                trigger: 'PreSignUp',
                existing: true,
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cognitoUserPool: {
                pool: 'Pool2',
                trigger: 'PostConfirmation',
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileCognitoUserPoolEvents.existingCognitoUserPools()

      // Custom resource is added once per compile (not per function)
      expect(addCustomResourceToServiceMock).toHaveBeenCalledTimes(1)
      // Check that two custom resources are created
      const resources =
        awsCompileCognitoUserPoolEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      const customResources = Object.entries(resources).filter(
        ([, r]) => r.Type === 'Custom::CognitoUserPool',
      )
      expect(customResources.length).toBe(2)
    })
  })
})
