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
})
