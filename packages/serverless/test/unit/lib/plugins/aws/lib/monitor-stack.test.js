import { jest } from '@jest/globals'

// Mock external dependencies before importing the module
const mockLog = { info: jest.fn() }
const mockProgress = { get: jest.fn().mockReturnValue({ notice: jest.fn() }) }
const mockStyle = {
  aside: jest.fn((text) => text),
  link: jest.fn((url) => url),
}

jest.unstable_mockModule('@serverless/util', () => ({
  log: mockLog,
  progress: mockProgress,
  style: mockStyle,
}))

jest.unstable_mockModule('timers-ext/promise/sleep.js', () => ({
  default: jest.fn().mockResolvedValue(undefined),
}))

// Import modules after mocking
const monitorStackModule =
  await import('../../../../../../lib/plugins/aws/lib/monitor-stack.js')
const monitorStack = monitorStackModule.default

describe('monitorStack', () => {
  let awsPlugin

  beforeEach(() => {
    awsPlugin = {
      provider: {
        request: jest.fn(),
        getRegion: jest.fn().mockReturnValue('us-east-1'),
      },
      options: {
        stage: 'dev',
        region: 'us-east-1',
      },
    }

    Object.assign(awsPlugin, monitorStack)

    // Reset mocks
    mockLog.info.mockClear()
    mockProgress.get.mockClear()
  })

  describe('#monitorStack()', () => {
    it('should skip monitoring if the stack was already created', async () => {
      const result = await awsPlugin.monitorStack('update', 'alreadyCreated', {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).not.toHaveBeenCalled()
      expect(result).toBe(awsPlugin)
    })

    it('should keep monitoring until CREATE_COMPLETE stack status', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      }
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(updateFinishedEvent)

      const stackStatus = await awsPlugin.monitorStack('create', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(2)
      expect(awsPlugin.provider.request).toHaveBeenCalledWith(
        'CloudFormation',
        'describeStackEvents',
        { StackName: cfDataMock.StackId },
      )
      expect(stackStatus).toBe('CREATE_COMPLETE')
    })

    it('should keep monitoring until UPDATE_COMPLETE stack status', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(updateFinishedEvent)

      const stackStatus = await awsPlugin.monitorStack('update', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(2)
      expect(stackStatus).toBe('UPDATE_COMPLETE')
    })

    it('should keep monitoring until DELETE_COMPLETE stack status', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const deleteStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const deleteFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(deleteStartEvent)
        .mockResolvedValueOnce(deleteFinishedEvent)

      const stackStatus = await awsPlugin.monitorStack('delete', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(2)
      expect(stackStatus).toBe('DELETE_COMPLETE')
    })

    it('should not stop monitoring on CREATE_COMPLETE nested stack status', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      }
      const nestedStackEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4z',
            StackName: 'new-service-dev',
            LogicalResourceId: 'nested-stack-name',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_COMPLETE',
          },
        ],
      }
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(nestedStackEvent)
        .mockResolvedValueOnce(updateFinishedEvent)

      const stackStatus = await awsPlugin.monitorStack('create', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(3)
      expect(stackStatus).toBe('CREATE_COMPLETE')
    })

    it('should throw an error and exit immediately if stack status is *_FAILED', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      const updateFailedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'mochaS3',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Bucket already exists',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(updateFailedEvent)

      await expect(
        awsPlugin.monitorStack('update', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow('An error occurred: mochaS3 - Bucket already exists.')

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(2)
    })

    it('should detect Stack-level DELETE_IN_PROGRESS as error during create action', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const createStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      }
      const deleteInProgressEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
            ResourceStatusReason:
              'No export named missing-export found. Delete requested by user.',
          },
        ],
      }
      const deleteCompleteEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(createStartEvent)
        .mockResolvedValueOnce(deleteInProgressEvent)
        .mockResolvedValueOnce(deleteCompleteEvent)

      await expect(
        awsPlugin.monitorStack('create', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow(
        'An error occurred: new-service-dev - No export named missing-export found. Delete requested by user.',
      )
    })

    it('should NOT treat resource-level DELETE_IN_PROGRESS as error during update (normal replacement)', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      // Resource-level DELETE_IN_PROGRESS (normal during replacement)
      const resourceDeleteEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'HelloLambdaFunction',
            ResourceType: 'AWS::Lambda::Function',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const updateCompleteEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(resourceDeleteEvent)
        .mockResolvedValueOnce(updateCompleteEvent)

      const stackStatus = await awsPlugin.monitorStack('update', cfDataMock, {
        frequency: 10,
      })

      // Should complete successfully without error
      expect(stackStatus).toBe('UPDATE_COMPLETE')
    })

    it('should output all stack events information with the --verbose option', async () => {
      awsPlugin.options.verbose = true
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      const updateFailedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'mochaS3',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Bucket already exists',
          },
        ],
      }
      const updateRollbackEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_ROLLBACK_IN_PROGRESS',
          },
        ],
      }
      const rollbackCompleteEvent = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'ROLLBACK_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(updateFailedEvent)
        .mockResolvedValueOnce(updateRollbackEvent)
        .mockResolvedValueOnce(rollbackCompleteEvent)

      await expect(
        awsPlugin.monitorStack('update', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow('An error occurred: mochaS3 - Bucket already exists.')

      // With verbose, waits for ROLLBACK_COMPLETE before throwing
      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(4)
    })

    it('should handle CREATE_FAILED with disableRollback in verbose mode', async () => {
      awsPlugin.options.verbose = true
      const cfDataMock = { StackId: 'new-service-dev' }
      const createStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      }
      const resourceFailedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'DuplicateBucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Bucket already exists',
          },
        ],
      }
      // With disableRollback, stack goes to CREATE_FAILED (not ROLLBACK)
      const stackFailedEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(createStartEvent)
        .mockResolvedValueOnce(resourceFailedEvent)
        .mockResolvedValueOnce(stackFailedEvent)

      await expect(
        awsPlugin.monitorStack('create', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow(
        'An error occurred: DuplicateBucket - Bucket already exists.',
      )

      // With verbose + disableRollback fix, exits on CREATE_FAILED
      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(3)
    })

    it('should handle UPDATE_FAILED with disableRollback in verbose mode', async () => {
      awsPlugin.options.verbose = true
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      const resourceFailedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'DuplicateBucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Bucket already exists',
          },
        ],
      }
      // With disableRollback, stack goes to UPDATE_FAILED (not ROLLBACK)
      const stackFailedEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_FAILED',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(resourceFailedEvent)
        .mockResolvedValueOnce(stackFailedEvent)

      await expect(
        awsPlugin.monitorStack('update', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow(
        'An error occurred: DuplicateBucket - Bucket already exists.',
      )

      // With verbose + disableRollback fix, exits on UPDATE_FAILED
      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(3)
    })

    it('should record an error and fail if status is UPDATE_ROLLBACK_IN_PROGRESS', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      const updateRollbackEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_ROLLBACK_IN_PROGRESS',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(updateRollbackEvent)

      await expect(
        awsPlugin.monitorStack('update', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow(
        'An error occurred: new-service-dev - UPDATE_ROLLBACK_IN_PROGRESS.',
      )

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(2)
    })

    it('should handle stack not found error during delete', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const deleteStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const stackNotFoundError = new Error(
        'Stack new-service-dev does not exist',
      )

      awsPlugin.provider.request
        .mockResolvedValueOnce(deleteStartEvent)
        .mockRejectedValueOnce(stackNotFoundError)

      const stackStatus = await awsPlugin.monitorStack('delete', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(2)
      expect(stackStatus).toBe('DELETE_COMPLETE')
    })

    it('should catch describeStackEvents error if stack was not in deleting state', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const someError = new Error('Something went wrong.')

      awsPlugin.provider.request.mockRejectedValueOnce(someError)

      await expect(
        awsPlugin.monitorStack('update', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow('Something went wrong.')

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(1)
    })

    it('should not stop monitoring on UPDATE_COMPLETE nested stack status', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      const nestedStackEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4z',
            StackName: 'new-service-dev',
            LogicalResourceId: 'nested-stack-name',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      }
      const updateFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(nestedStackEvent)
        .mockResolvedValueOnce(updateFinishedEvent)

      const stackStatus = await awsPlugin.monitorStack('update', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(3)
      expect(stackStatus).toBe('UPDATE_COMPLETE')
    })

    it('should not stop monitoring on DELETE_COMPLETE nested stack status', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const deleteStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const nestedStackEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4z',
            StackName: 'new-service-dev',
            LogicalResourceId: 'nested-stack-name',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      }
      const deleteFinishedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(deleteStartEvent)
        .mockResolvedValueOnce(nestedStackEvent)
        .mockResolvedValueOnce(deleteFinishedEvent)

      const stackStatus = await awsPlugin.monitorStack('delete', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(3)
      expect(stackStatus).toBe('DELETE_COMPLETE')
    })

    it('should keep monitoring when 1st ResourceType is not "AWS::CloudFormation::Stack"', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const firstNoStackResourceTypeEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'somebucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
          },
        ],
      }
      const updateStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4e',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_IN_PROGRESS',
          },
        ],
      }
      const updateComplete = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'UPDATE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(firstNoStackResourceTypeEvent)
        .mockResolvedValueOnce(updateStartEvent)
        .mockResolvedValueOnce(updateComplete)

      const stackStatus = await awsPlugin.monitorStack('update', cfDataMock, {
        frequency: 10,
      })

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(3)
      expect(stackStatus).toBe('UPDATE_COMPLETE')
    })

    it('should throw an error and exit immediately if stack status is DELETE_FAILED', async () => {
      const cfDataMock = { StackId: 'new-service-dev' }
      const deleteStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const deleteItemEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'mochaLambda',
            ResourceType: 'AWS::Lambda::Function',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const deleteItemFailedEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'mochaLambda',
            ResourceType: 'AWS::Lambda::Function',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_FAILED',
            ResourceStatusReason:
              'You are not authorized to perform this operation',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(deleteStartEvent)
        .mockResolvedValueOnce(deleteItemEvent)
        .mockResolvedValueOnce(deleteItemFailedEvent)

      await expect(
        awsPlugin.monitorStack('delete', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow(
        'An error occurred: mochaLambda - You are not authorized to perform this operation.',
      )

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(3)
    })

    it('should resolve properly first stack event (when CREATE fails and is followed with DELETE)', async () => {
      awsPlugin.options.verbose = true
      const cfDataMock = { StackId: 'new-service-dev' }
      const createStartEvent = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'myBucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
          {
            EventId: '1a2b3c4e',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'myBucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Invalid Property for X',
          },
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      }

      awsPlugin.provider.request.mockResolvedValueOnce(createStartEvent)

      await expect(
        awsPlugin.monitorStack('create', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow('myBucket - Invalid Property for X.')
    })

    it('should throw an error if stack status is DELETE_COMPLETE and should output all stack events information with the --verbose option', async () => {
      awsPlugin.options.verbose = true
      const cfDataMock = { StackId: 'new-service-dev' }
      const createStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_IN_PROGRESS',
          },
        ],
      }
      const createItemFailedEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'myBucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'CREATE_FAILED',
            ResourceStatusReason: 'Invalid Property for X',
          },
        ],
      }
      const createItemDeleteEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'myBucket',
            ResourceType: 'AWS::S3::Bucket',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const createFailedEvent = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_COMPLETE',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(createStartEvent)
        .mockResolvedValueOnce(createItemFailedEvent)
        .mockResolvedValueOnce(createItemDeleteEvent)
        .mockResolvedValueOnce(createFailedEvent)

      await expect(
        awsPlugin.monitorStack('create', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow('An error occurred: myBucket - Invalid Property for X.')

      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(4)
    })

    it('should throw an error if stack status is DELETE_FAILED and should output all stack events information with the --verbose option', async () => {
      awsPlugin.options.verbose = true
      const cfDataMock = { StackId: 'new-service-dev' }
      const deleteStartEvent = {
        StackEvents: [
          {
            EventId: '1a2b3c4d',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const deleteItemEvent = {
        StackEvents: [
          {
            EventId: '1e2f3g4h',
            StackName: 'new-service-dev',
            LogicalResourceId: 'mochaLambda',
            ResourceType: 'AWS::Lambda::Function',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_IN_PROGRESS',
          },
        ],
      }
      const deleteItemFailedEvent = {
        StackEvents: [
          {
            EventId: '1i2j3k4l',
            StackName: 'new-service-dev',
            LogicalResourceId: 'mochaLambda',
            ResourceType: 'AWS::Lambda::Function',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_FAILED',
            ResourceStatusReason:
              'You are not authorized to perform this operation',
          },
        ],
      }
      const deleteFailedEvent = {
        StackEvents: [
          {
            EventId: '1m2n3o4p',
            StackName: 'new-service-dev',
            LogicalResourceId: 'new-service-dev',
            ResourceType: 'AWS::CloudFormation::Stack',
            Timestamp: new Date(),
            ResourceStatus: 'DELETE_FAILED',
          },
        ],
      }

      awsPlugin.provider.request
        .mockResolvedValueOnce(deleteStartEvent)
        .mockResolvedValueOnce(deleteItemEvent)
        .mockResolvedValueOnce(deleteItemFailedEvent)
        .mockResolvedValueOnce(deleteFailedEvent)

      await expect(
        awsPlugin.monitorStack('delete', cfDataMock, { frequency: 10 }),
      ).rejects.toThrow(
        'An error occurred: mochaLambda - You are not authorized to perform this operation.',
      )

      // With verbose, waits for DELETE_FAILED before throwing
      expect(awsPlugin.provider.request).toHaveBeenCalledTimes(4)
    })
  })

  describe('sandbox image version limit failures', () => {
    const reason =
      'Resource handler returned message: "Image arn:aws:lambda:eu-west-1:123456789012:microvm-image:shop-echo-dev has reached the maximum number of versions allowed. (Service: LambdaMicrovms, Status Code: 402, Request ID: 5b785b67)" (RequestToken: c31e92af, HandlerErrorCode: GeneralServiceException)'

    const runFailure = async ({
      logicalId = 'EchoImage',
      resourceType = 'AWS::Lambda::MicrovmImage',
      statusReason = reason,
      sandboxes = { echo: { artifact: './app' } },
      custom,
    }) => {
      awsPlugin.serverless = {
        service: { sandboxes, custom },
        configurationInput: {},
      }
      awsPlugin.provider.request
        .mockResolvedValueOnce({
          StackEvents: [
            {
              EventId: '1',
              StackName: 'shop-dev',
              LogicalResourceId: 'shop-dev',
              ResourceType: 'AWS::CloudFormation::Stack',
              ResourceStatus: 'UPDATE_IN_PROGRESS',
            },
          ],
        })
        .mockResolvedValueOnce({
          StackEvents: [
            {
              EventId: '2',
              StackName: 'shop-dev',
              LogicalResourceId: logicalId,
              ResourceType: resourceType,
              ResourceStatus: 'UPDATE_FAILED',
              ResourceStatusReason: statusReason,
            },
          ],
        })
      return awsPlugin
        .monitorStack('update', { StackId: 'shop-dev' }, { frequency: 10 })
        .catch((error) => error)
    }

    it('keeps the AWS message and adds how to prune', async () => {
      const error = await runFailure({})

      expect(error.message).toBe(
        `An error occurred: EchoImage - ${reason}.\n` +
          '\n' +
          'Sandbox "echo" has reached the maximum number of image versions AWS allows.\n' +
          'Remove old versions with "serverless prune -n 5", then deploy again.\n' +
          'To prune automatically after every deploy, add to serverless.yml:\n' +
          '\n' +
          'custom:\n' +
          '  prune:\n' +
          '    automatic: true\n' +
          '    number: 5',
      )
      expect(error.code).toBe(
        'AWS_CLOUD_FORMATION_UPDATE_STACK_INTERNAL_LAMBDA_MICROVM_IMAGE_UPDATE_FAILED',
      )
    })

    it('maps the logical ID back to a sandbox name with dashes', async () => {
      const error = await runFailure({
        logicalId: 'SyncDashallImage',
        sandboxes: { 'sync-all': {} },
      })

      expect(error.message).toContain(
        'Sandbox "sync-all" has reached the maximum number of image versions AWS allows.',
      )
    })

    it('skips the config snippet when automatic pruning is already on', async () => {
      const error = await runFailure({
        custom: { prune: { automatic: true, number: 3 } },
      })

      expect(
        error.message.endsWith(
          'Sandbox "echo" has reached the maximum number of image versions AWS allows.\n' +
            'Remove old versions with "serverless prune -n 3", then deploy again.',
        ),
      ).toBe(true)
    })

    it('leaves other MicrovmImage failures alone', async () => {
      const error = await runFailure({
        statusReason: 'The container image build failed.',
      })

      expect(error.message).toBe(
        'An error occurred: EchoImage - The container image build failed..',
      )
    })
  })

  describe('Web Function quota failures', () => {
    const quotaContext =
      "Check this account's Web Function quotas with: aws lambda-web get-web-account-settings"

    const runFailure = async ({ resourceType, reason, webApps }) => {
      awsPlugin.serverless = {
        service: {},
        configurationInput: { webApps },
      }
      awsPlugin.provider.request
        .mockResolvedValueOnce({
          StackEvents: [
            {
              EventId: '1',
              StackName: 'shop-dev',
              LogicalResourceId: 'shop-dev',
              ResourceType: 'AWS::CloudFormation::Stack',
              ResourceStatus: 'UPDATE_IN_PROGRESS',
            },
          ],
        })
        .mockResolvedValueOnce({
          StackEvents: [
            {
              EventId: '2',
              StackName: 'shop-dev',
              LogicalResourceId: 'ApiWebFunction',
              ResourceType: resourceType,
              ResourceStatus: 'CREATE_FAILED',
              ResourceStatusReason: reason,
            },
          ],
        })
      return awsPlugin
        .monitorStack('update', { StackId: 'shop-dev' }, { frequency: 10 })
        .catch((error) => error)
    }

    it.each([
      'AWS::Lambda::WebFunction',
      'AWS::Lambda::WebFunctionRevision',
      'AWS::Lambda::WebFunctionEndpoint',
    ])(
      'follows the AWS message with the quota command for %s',
      async (type) => {
        const error = await runFailure({
          resourceType: type,
          reason: 'Resource handler returned message: "Limit Exceeded"',
          webApps: { api: { entry: 'src/server.js' } },
        })

        expect(error.message).toBe(
          `An error occurred: ApiWebFunction - Resource handler returned message: "Limit Exceeded".\n${quotaContext}`,
        )
        expect(error.code).toBe(
          `AWS_CLOUD_FORMATION_UPDATE_STACK_INTERNAL_LAMBDA_${type
            .slice('AWS::Lambda::'.length)
            .replace(/(?<!^)([A-Z])/g, '_$1')
            .toUpperCase()}_CREATE_FAILED`,
        )
      },
    )

    it('matches a quota reason in any case', async () => {
      const error = await runFailure({
        resourceType: 'AWS::Lambda::WebFunction',
        reason: 'You have exceeded the QUOTA for web functions',
        webApps: { api: { entry: 'src/server.js' } },
      })

      expect(error.message.endsWith(`\n${quotaContext}`)).toBe(true)
    })

    it('leaves other Web Function failures alone', async () => {
      const error = await runFailure({
        resourceType: 'AWS::Lambda::WebFunction',
        reason: 'Invalid request',
        webApps: { api: { entry: 'src/server.js' } },
      })

      expect(error.message).toBe(
        'An error occurred: ApiWebFunction - Invalid request.',
      )
    })

    it('leaves quota failures of other resources alone', async () => {
      const error = await runFailure({
        resourceType: 'AWS::Lambda::Function',
        reason: 'Limit Exceeded',
        webApps: { api: { entry: 'src/server.js' } },
      })

      expect(error.message).toBe(
        'An error occurred: ApiWebFunction - Limit Exceeded.',
      )
    })

    it('leaves the message alone for a service without web apps', async () => {
      const error = await runFailure({
        resourceType: 'AWS::Lambda::WebFunction',
        reason: 'Limit Exceeded',
      })

      expect(error.message).toBe(
        'An error occurred: ApiWebFunction - Limit Exceeded.',
      )
    })
  })

  describe('Function replacement failures', () => {
    const replacementContext =
      'Lambda sets durable configuration, tenancy and package type when a function is created. To change one, give the function a new name, or remove it from the service, deploy, and add it back.'
    const replacementReason =
      'CloudFormation cannot update a stack when a custom-named resource requires replacing. Rename shop-dev-worker and update the stack again.'

    const runFailure = async ({ resourceType, reason }) => {
      awsPlugin.serverless = { service: {}, configurationInput: {} }
      awsPlugin.provider.request
        .mockResolvedValueOnce({
          StackEvents: [
            {
              EventId: '1',
              StackName: 'shop-dev',
              LogicalResourceId: 'shop-dev',
              ResourceType: 'AWS::CloudFormation::Stack',
              ResourceStatus: 'UPDATE_IN_PROGRESS',
            },
          ],
        })
        .mockResolvedValueOnce({
          StackEvents: [
            {
              EventId: '2',
              StackName: 'shop-dev',
              LogicalResourceId: 'WorkerLambdaFunction',
              ResourceType: resourceType,
              ResourceStatus: 'UPDATE_FAILED',
              ResourceStatusReason: reason,
            },
          ],
        })
      return awsPlugin
        .monitorStack('update', { StackId: 'shop-dev' }, { frequency: 10 })
        .catch((error) => error)
    }

    it('follows a replacement refusal on a Lambda function with why it needs replacing', async () => {
      const error = await runFailure({
        resourceType: 'AWS::Lambda::Function',
        reason: replacementReason,
      })

      expect(error.message).toBe(
        `An error occurred: WorkerLambdaFunction - ${replacementReason}.\n${replacementContext}`,
      )
    })

    it('leaves other Lambda function failures alone', async () => {
      const error = await runFailure({
        resourceType: 'AWS::Lambda::Function',
        reason: 'Invalid request',
      })

      expect(error.message).toBe(
        'An error occurred: WorkerLambdaFunction - Invalid request.',
      )
    })

    it('leaves replacement refusals of other resource types alone', async () => {
      const error = await runFailure({
        resourceType: 'AWS::DynamoDB::Table',
        reason: replacementReason,
      })

      expect(error.message).toBe(
        `An error occurred: WorkerLambdaFunction - ${replacementReason}.`,
      )
    })
  })
})
