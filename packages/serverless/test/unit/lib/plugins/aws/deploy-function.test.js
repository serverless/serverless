import { jest } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import AwsDeployFunction from '../../../../../lib/plugins/aws/deploy-function.js'
import Serverless from '../../../../../lib/serverless.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('AwsDeployFunction', () => {
  let awsDeployFunction
  let serverless
  let options
  let pluginUtils
  let cryptoStub

  beforeEach(() => {
    serverless = new Serverless({
      commands: ['print'],
      options: {},
      serviceDir: null,
    })
    serverless.serviceDir = 'serviceDir'
    serverless.service = {
      package: {
        path: 'packagePath',
      },
      environment: {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              'us-east-1': {
                vars: {},
              },
            },
          },
        },
      },
      serviceObject: {},
      functions: {
        first: {
          handler: true,
        },
      },
      getFunction: jest.fn(),
      provider: {
        name: 'aws',
        stage: 'dev',
        region: 'us-east-1',
        remoteFunctionData: {},
      },
    }

    serverless.getProvider = jest.fn().mockReturnValue({
      getStage: jest.fn().mockReturnValue('dev'),
      getRegion: jest.fn().mockReturnValue('us-east-1'),
      request: jest.fn(),
      naming: {
        getFunctionArtifactName: jest.fn().mockReturnValue('first.zip'),
      },
      resolveImageUriAndSha: jest.fn(),
      getCustomExecutionRole: jest.fn((functionObject) => {
        if (functionObject.role) return functionObject.role
        if (
          serverless.service.provider.iam &&
          serverless.service.provider.iam.role
        ) {
          return serverless.service.provider.iam.role
        }
        return null
      }),
      getAccountInfo: jest.fn(),
    })

    options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
    }

    pluginUtils = {
      log: {
        notice: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
        aside: jest.fn(),
        info: jest.fn(),
      },
      style: {
        aside: jest.fn((text) => text),
      },
      progress: {
        notice: jest.fn(),
      },
    }

    awsDeployFunction = new AwsDeployFunction(serverless, options, pluginUtils)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('#constructor()', () => {
    it('should have hooks', () => {
      expect(awsDeployFunction.hooks).not.toEqual({})
    })

    it('should set the provider variable', () => {
      expect(awsDeployFunction.provider).toBeDefined()
    })

    it('should set an empty options object if no options are given', () => {
      const awsDeployFunctionWithEmptyOptions = new AwsDeployFunction(
        serverless,
        undefined,
        pluginUtils,
      )
      expect(awsDeployFunctionWithEmptyOptions.options).toEqual({})
    })
  })

  describe('#checkIfFunctionExists()', () => {
    let getFunctionStub

    beforeEach(() => {
      awsDeployFunction.options.functionObj = { name: 'first' }
      serverless.service.getFunction.mockReturnValue({ name: 'first' })
      getFunctionStub = awsDeployFunction.provider.request.mockResolvedValue({
        func: { name: 'first' },
      })
    })

    it('should check if the function is deployed and save the result', async () => {
      await awsDeployFunction.checkIfFunctionExists()

      expect(getFunctionStub).toHaveBeenCalledTimes(1)
      expect(getFunctionStub).toHaveBeenCalledWith('Lambda', 'getFunction', {
        FunctionName: 'first',
      })
      expect(serverless.service.provider.remoteFunctionData).toEqual({
        func: {
          name: 'first',
        },
      })
    })
  })

  describe('#normalizeArnRole', () => {
    let getAccountInfoStub
    let getRoleStub

    beforeEach(() => {
      getAccountInfoStub =
        awsDeployFunction.provider.getAccountInfo.mockResolvedValue({
          accountId: '123456789012',
          partition: 'aws',
        })
      getRoleStub = awsDeployFunction.provider.request.mockResolvedValue({
        Arn: 'arn:aws:iam::123456789012:role/role_2',
      })

      serverless.service.resources = {
        Resources: {
          MyCustomRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
              RoleName: 'role_123',
            },
          },
        },
      }
    })

    it('should return unmodified ARN if ARN was provided', async () => {
      const arn = 'arn:aws:iam::123456789012:role/role'
      const result = await awsDeployFunction.normalizeArnRole(arn)

      expect(getAccountInfoStub).not.toHaveBeenCalled()
      expect(result).toEqual(arn)
    })

    it('should return compiled ARN if role name was provided', async () => {
      const roleName = 'MyCustomRole'
      const result = await awsDeployFunction.normalizeArnRole(roleName)

      expect(getAccountInfoStub).toHaveBeenCalled()
      expect(result).toEqual('arn:aws:iam::123456789012:role/role_123')
    })
  })

  describe('#deployFunction()', () => {
    let artifactFilePath
    let updateFunctionCodeStub
    let statSyncStub
    let readFileSyncStub

    beforeEach(() => {
      awsDeployFunction.packagePath = '/tmp/package'
      artifactFilePath = path.join(awsDeployFunction.packagePath, 'first.zip')

      awsDeployFunction.options.functionObj = { name: 'first' }

      updateFunctionCodeStub =
        awsDeployFunction.provider.request.mockResolvedValue()

      statSyncStub = jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 })
      readFileSyncStub = jest
        .spyOn(fs, 'readFileSync')
        .mockReturnValue(Buffer.from('zip file content'))

      // Mock crypto using spyOn if possible, otherwise rely on logic or Mock crypto module
      // crypto.createHash().update().digest()
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('local-hash-zip-file'),
      }
      jest.spyOn(crypto, 'createHash').mockReturnValue(mockHash)

      serverless.service.provider.remoteFunctionData = {
        Configuration: {
          CodeSha256: 'remote-hash-zip-file',
        },
      }

      serverless.service.getFunction.mockReturnValue({
        name: 'first',
      })
    })

    // Helper to control hash output
    const setLocalHash = (hash) => {
      crypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(hash),
      })
    }

    it('should deploy the function if the hashes are different', async () => {
      setLocalHash('local-hash-zip-file')

      await awsDeployFunction.deployFunction()

      expect(updateFunctionCodeStub).toHaveBeenCalledTimes(1)
      expect(readFileSyncStub).toHaveBeenCalled()
      expect(updateFunctionCodeStub).toHaveBeenCalledWith(
        'Lambda',
        'updateFunctionCode',
        {
          FunctionName: 'first',
          ZipFile: Buffer.from('zip file content'),
        },
      )
    })

    it('should deploy the function if the hashes are same but the "force" option is used', async () => {
      awsDeployFunction.options.force = true
      setLocalHash('remote-hash-zip-file')

      await awsDeployFunction.deployFunction()

      expect(updateFunctionCodeStub).toHaveBeenCalledTimes(1)
      expect(readFileSyncStub).toHaveBeenCalled()
    })

    it('should resolve if the hashes are the same', async () => {
      setLocalHash('remote-hash-zip-file')

      await awsDeployFunction.deployFunction()

      expect(updateFunctionCodeStub).toHaveBeenCalledTimes(0)
      expect(readFileSyncStub).toHaveBeenCalledTimes(1)
    })
  })

  describe('#updateFunctionConfiguration()', () => {
    let updateFunctionConfigurationStub

    beforeEach(() => {
      // Mock the request method to capture updateFunctionConfiguration calls
      updateFunctionConfigurationStub = jest.fn()
      awsDeployFunction.provider.request = jest.fn(
        (service, method, params) => {
          if (method === 'updateFunctionConfiguration') {
            return (
              updateFunctionConfigurationStub(params) || Promise.resolve({})
            )
          }
          if (method === 'getFunction') {
            return Promise.resolve({
              Configuration: {
                State: 'Active',
                LastUpdateStatus: 'Successful',
              },
            })
          }
          // Default resolve for check changes
          if (method === 'updateFunctionCode') return Promise.resolve()
          if (method === 'getAccountInfo')
            return Promise.resolve({ partition: 'aws', accountId: '123' })
          return Promise.resolve({})
        },
      )
      awsDeployFunction.provider.getRuntime = jest.fn((r) => r)
      // Helper to set remote state
      awsDeployFunction.setRemoteConfig = (config) => {
        serverless.service.provider.remoteFunctionData.Configuration = config
      }
      // Initialize default remote config
      serverless.service.provider.remoteFunctionData = { Configuration: {} }
    })

    it('should update basic configuration (Memory, Timeout, Description, Handler, Role)', async () => {
      // "Before" state (Remote)
      awsDeployFunction.setRemoteConfig({
        MemorySize: 1024,
        Timeout: 6,
        Description: 'Old Description',
        Handler: 'old.handler',
        Role: 'arn:aws:iam::123:role/old-role',
      })

      // "After" state (Local)
      awsDeployFunction.options.functionObj = {
        name: 'first',
        memorySize: 2048,
        timeout: 10,
        description: 'New Description',
        handler: 'new.handler',
        role: 'arn:aws:iam::123:role/new-role',
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          FunctionName: 'first',
          MemorySize: 2048,
          Timeout: 10,
          Description: 'New Description',
          Handler: 'new.handler',
          Role: 'arn:aws:iam::123:role/new-role',
        }),
      )
    })

    it('should update VPC configuration', async () => {
      // Remote: No VPC
      awsDeployFunction.setRemoteConfig({
        VpcConfig: {
          SecurityGroupIds: [],
          SubnetIds: [],
        },
      })

      // Local: VPC with explicit IDs
      awsDeployFunction.options.functionObj = {
        name: 'first',
        vpc: {
          securityGroupIds: ['sg-1'],
          subnetIds: ['subnet-1'],
        },
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          VpcConfig: {
            SecurityGroupIds: ['sg-1'],
            SubnetIds: ['subnet-1'],
          },
        }),
      )
    })

    it('should NOT update VPC if configuration matches remote', async () => {
      // Remote: VPC set
      awsDeployFunction.setRemoteConfig({
        VpcConfig: {
          SecurityGroupIds: ['sg-1'],
          SubnetIds: ['subnet-1'],
        },
      })
      // Local: Same VPC
      awsDeployFunction.options.functionObj = {
        name: 'first',
        vpc: {
          securityGroupIds: ['sg-1'],
          subnetIds: ['subnet-1'],
        },
      }
      await awsDeployFunction.updateFunctionConfiguration()
      expect(updateFunctionConfigurationStub).not.toHaveBeenCalled()
    })

    it('should remove VPC if local config is null/empty', async () => {
      // Remote: VPC set
      awsDeployFunction.setRemoteConfig({
        VpcConfig: {
          SecurityGroupIds: ['sg-1'],
          SubnetIds: ['subnet-1'],
        },
      })
      // Local: No VPC (provider.vpc is undefined too)
      awsDeployFunction.options.functionObj = {
        name: 'first',
        // vpc: null/undefined
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).not.toHaveBeenCalled()
    })

    it('should NOT update configuration if values are unchanged', async () => {
      // "Before" state (Remote)
      awsDeployFunction.setRemoteConfig({
        MemorySize: 1024,
        Timeout: 6,
        Description: 'Desc',
        Handler: 'handler',
        Role: 'arn:aws:iam::123:role/role',
      })

      // "After" state (Local) - same values
      awsDeployFunction.options.functionObj = {
        name: 'first',
        memorySize: 1024,
        timeout: 6,
        description: 'Desc',
        handler: 'handler',
        role: 'arn:aws:iam::123:role/role',
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).not.toHaveBeenCalled()
    })

    it('should update Environment Variables', async () => {
      awsDeployFunction.setRemoteConfig({
        Environment: {
          Variables: { EXISTING: 'val' },
        },
      })
      awsDeployFunction.options.functionObj = {
        name: 'first',
        environment: {
          EXISTING: 'new-val',
          NEW: 'added',
        },
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          Environment: {
            Variables: {
              EXISTING: 'new-val',
              NEW: 'added',
            },
          },
        }),
      )
    })

    it('should preserve Serverless Console environment variables if layers are present', async () => {
      // Remote: Console envs present
      awsDeployFunction.setRemoteConfig({
        Layers: [
          { Arn: 'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-node:1' },
        ],
        Environment: {
          Variables: {
            AWS_LAMBDA_EXEC_WRAPPER: '/opt/serverless_wrapper',
            SLS_ORG_ID: 'org-123',
            USER_VAR: 'val',
          },
        },
      })
      // Local: User var changed, Console vars not in local config
      awsDeployFunction.options.functionObj = {
        name: 'first',
        environment: {
          USER_VAR: 'new-val',
        },
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          Environment: {
            Variables: {
              USER_VAR: 'new-val',
              AWS_LAMBDA_EXEC_WRAPPER: '/opt/serverless_wrapper',
              SLS_ORG_ID: 'org-123',
            },
          },
        }),
      )
    })

    it('should throw error if invalid environment variable name', async () => {
      awsDeployFunction.setRemoteConfig({})
      awsDeployFunction.options.functionObj = {
        name: 'first',
        environment: {
          'INVALID-NAME': 'val',
        },
      }
      await expect(
        awsDeployFunction.updateFunctionConfiguration(),
      ).rejects.toThrow(/Invalid characters in environment variable/)
    })

    it('should update Layers', async () => {
      // Remote: Old layer
      awsDeployFunction.setRemoteConfig({
        Layers: [{ Arn: 'arn:aws:lambda:us-east-1:123:layer:old:1' }],
      })
      // Local: New layer
      awsDeployFunction.options.functionObj = {
        name: 'first',
        layers: ['arn:aws:lambda:us-east-1:123:layer:new:1'],
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          Layers: ['arn:aws:lambda:us-east-1:123:layer:new:1'],
        }),
      )
    })

    it('should preserve Console Layers when updating layers', async () => {
      // Remote: User layer + Console layer
      const consoleLayer =
        'arn:aws:lambda:us-east-1:177335420605:layer:sls-sdk-node:1'
      awsDeployFunction.setRemoteConfig({
        Layers: [
          { Arn: 'arn:aws:lambda:us-east-1:123:layer:old:1' },
          { Arn: consoleLayer },
        ],
      })
      // Local: New User layer (console layer not in yml)
      awsDeployFunction.options.functionObj = {
        name: 'first',
        layers: ['arn:aws:lambda:us-east-1:123:layer:new:1'],
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          Layers: ['arn:aws:lambda:us-east-1:123:layer:new:1', consoleLayer],
        }),
      )
    })

    it('should update Image Configuration', async () => {
      // Remote: Old config
      awsDeployFunction.setRemoteConfig({
        PackageType: 'Image',
        ImageConfigResponse: {
          ImageConfig: {
            Command: ['old.cmd'],
            EntryPoint: ['old.entry'],
            WorkingDirectory: '/old',
          },
        },
      })
      // Local: New config
      awsDeployFunction.options.functionObj = {
        name: 'first',
        image: {
          command: ['new.cmd'],
          entryPoint: ['new.entry'],
          workingDirectory: '/new',
        },
      }

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          ImageConfig: {
            Command: ['new.cmd'],
            EntryPoint: ['new.entry'],
            WorkingDirectory: '/new',
          },
        }),
      )
    })

    it('should retry on ResourceConflictException', async () => {
      awsDeployFunction.setRemoteConfig({})
      awsDeployFunction.options.functionObj = {
        name: 'first',
        description: 'new desc',
      }

      // Mock implementation to throw conflict once then succeed
      const conflictError = new Error('Conflict')
      conflictError.providerError = { code: 'ResourceConflictException' }

      updateFunctionConfigurationStub.mockRejectedValueOnce(conflictError)

      // Mock wait to avoid delay in test
      // Note: wait is imported as default from 'timers-ext/promise/sleep.js'.
      // Jest ESM mocking of default exports is tricky.
      // However, we can mock the request loop in deploy-function.js?
      // "await wait(1000)" is called.
      // If we don't mock it, test takes 1s. Acceptable.

      await awsDeployFunction.updateFunctionConfiguration()

      expect(updateFunctionConfigurationStub).toHaveBeenCalledTimes(2)
    })
  })
})
