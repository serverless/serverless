import { jest } from '@jest/globals'
import { mock } from 'jest-mock-extended'
import {
  ECSClient,
  DescribeClustersCommand,
  CreateClusterCommand,
  ServiceNotFoundException,
  ResourceNotFoundException,
} from '@aws-sdk/client-ecs'
import { AwsEcsClient } from '../../src/lib/aws/ecs.js'

describe('AwsEcsClient', () => {
  let awsEcsClient
  let mockSdkClient

  jest.setTimeout(30000) // Increase timeout for all tests

  beforeEach(() => {
    mockSdkClient = mock(ECSClient)
    awsEcsClient = new AwsEcsClient()
    awsEcsClient.client = mockSdkClient
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getOrCreateCluster', () => {
    it('should return existing cluster ARN when cluster exists', async () => {
      const clusterArn = 'arn:aws:ecs:region:account:cluster/test-cluster'
      mockSdkClient.send.mockResolvedValueOnce({
        clusters: [
          {
            clusterArn,
            status: 'ACTIVE',
          },
        ],
      })

      const result = await awsEcsClient.getOrCreateCluster('test-cluster')
      expect(result).toBe(clusterArn)
      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.any(DescribeClustersCommand),
      )
    })

    it('should create new cluster when none exists', async () => {
      const clusterArn = 'arn:aws:ecs:region:account:cluster/test-cluster'
      mockSdkClient.send
        .mockResolvedValueOnce({ clusters: [] })
        .mockResolvedValueOnce({
          cluster: { clusterArn },
        })

      const result = await awsEcsClient.getOrCreateCluster('test-cluster')
      expect(result).toBe(clusterArn)
      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.any(CreateClusterCommand),
      )
    })

    it('should create new cluster when no active clusters exist', async () => {
      const clusterArn = 'arn:aws:ecs:region:account:cluster/test-cluster'
      mockSdkClient.send
        .mockResolvedValueOnce({
          clusters: [
            {
              clusterArn: 'old-arn',
              status: 'INACTIVE',
            },
          ],
        })
        .mockResolvedValueOnce({
          cluster: { clusterArn },
        })

      const result = await awsEcsClient.getOrCreateCluster('test-cluster')
      expect(result).toBe(clusterArn)
      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.any(CreateClusterCommand),
      )
    })
  })

  describe('registerTaskDefinition', () => {
    it('should register task definition with correct parameters', async () => {
      const taskDefArn = 'arn:aws:ecs:region:account:task-definition/test:1'
      mockSdkClient.send.mockResolvedValueOnce({
        taskDefinition: {
          taskDefinitionArn: taskDefArn,
        },
      })

      const result = await awsEcsClient.registerTaskDefinition({
        resourceNameBase: 'test',
        containerName: 'api',
        imageUri: 'test-image:latest',
        executionRoleArn: 'execution-role',
        taskRoleArn: 'task-role',
        region: 'us-east-1',
        environment: { NODE_ENV: 'production' },
        taskDefinitionConfig: {
          cpu: 256,
          memory: 512,
        },
      })

      expect(result.taskDefinitionArn).toBe(taskDefArn)
      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            family: 'test-api',
            cpu: '256',
            memory: '512',
            executionRoleArn: 'execution-role',
            taskRoleArn: 'task-role',
            containerDefinitions: expect.arrayContaining([
              expect.objectContaining({
                name: 'test-api',
                image: 'test-image:latest',
                environment: [{ name: 'NODE_ENV', value: 'production' }],
              }),
            ]),
          }),
        }),
      )
    })

    it('should use default values when optional parameters are not provided', async () => {
      const taskDefArn = 'arn:aws:ecs:region:account:task-definition/test:1'
      mockSdkClient.send.mockResolvedValueOnce({
        taskDefinition: {
          taskDefinitionArn: taskDefArn,
        },
      })

      await awsEcsClient.registerTaskDefinition({
        resourceNameBase: 'test',
        containerName: 'api',
        imageUri: 'test-image:latest',
        executionRoleArn: 'execution-role',
        taskRoleArn: 'task-role',
        region: 'us-east-1',
      })

      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            cpu: '256',
            memory: '512',
          }),
        }),
      )
    })

    it('should throw error when registration fails', async () => {
      mockSdkClient.send.mockResolvedValueOnce({
        taskDefinition: null,
      })

      await expect(
        awsEcsClient.registerTaskDefinition({
          resourceNameBase: 'test',
          containerName: 'api',
          imageUri: 'test-image:latest',
          executionRoleArn: 'execution-role',
          taskRoleArn: 'task-role',
          region: 'us-east-1',
        }),
      ).rejects.toThrow('Failed to register task definition')
    })
  })

  describe('createOrUpdateFargateService', () => {
    const defaultParams = {
      clusterArn: 'cluster-arn',
      taskDefinitionArn: 'task-def-arn',
      resourceNameBase: 'test',
      containerName: 'api',
      port: 8080,
      targetGroupArn: 'target-group-arn',
      subnetIds: ['subnet-1', 'subnet-2'],
      securityGroupIds: ['sg-1'],
      desiredCount: 2,
    }

    it('should update existing service when service exists and is active', async () => {
      mockSdkClient.send
        .mockResolvedValueOnce({
          services: [
            {
              serviceArn: 'service-arn',
              status: 'ACTIVE',
            },
          ],
        })
        .mockResolvedValueOnce({
          service: { serviceArn: 'updated-service-arn' },
        })

      await awsEcsClient.createOrUpdateFargateService(defaultParams)

      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            cluster: defaultParams.clusterArn,
            service: 'test-api',
            taskDefinition: defaultParams.taskDefinitionArn,
            desiredCount: defaultParams.desiredCount,
            forceNewDeployment: true,
            networkConfiguration: expect.objectContaining({
              awsvpcConfiguration: expect.objectContaining({
                subnets: defaultParams.subnetIds,
                securityGroups: defaultParams.securityGroupIds,
              }),
            }),
          }),
        }),
      )
    })

    it('should create new service when service does not exist', async () => {
      mockSdkClient.send
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'new-service-arn' },
        })

      await awsEcsClient.createOrUpdateFargateService(defaultParams)

      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            cluster: defaultParams.clusterArn,
            serviceName: 'test-api',
            taskDefinition: defaultParams.taskDefinitionArn,
            desiredCount: defaultParams.desiredCount,
            launchType: 'FARGATE',
            networkConfiguration: expect.objectContaining({
              awsvpcConfiguration: expect.objectContaining({
                subnets: defaultParams.subnetIds,
                securityGroups: defaultParams.securityGroupIds,
              }),
            }),
          }),
        }),
      )
    })

    it('should create new service when service exists but is not active', async () => {
      mockSdkClient.send
        .mockResolvedValueOnce({
          services: [
            {
              serviceArn: 'service-arn',
              status: 'DRAINING',
            },
          ],
        })
        .mockResolvedValueOnce({
          service: { serviceArn: 'new-service-arn' },
        })

      await awsEcsClient.createOrUpdateFargateService(defaultParams)

      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            serviceName: 'test-api',
            launchType: 'FARGATE',
          }),
        }),
      )
    })

    it('should use default port when not specified', async () => {
      const paramsWithoutPort = { ...defaultParams }
      delete paramsWithoutPort.port

      mockSdkClient.send
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'new-service-arn' },
        })

      await awsEcsClient.createOrUpdateFargateService(paramsWithoutPort)

      expect(mockSdkClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            loadBalancers: expect.arrayContaining([
              expect.objectContaining({
                containerPort: 8080,
              }),
            ]),
          }),
        }),
      )
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      mockSdkClient.send.mockReset()
    })

    it('should handle ResourceNotFoundException in getMostRecentTaskDefinition', async () => {
      mockSdkClient.send.mockRejectedValueOnce(
        new ResourceNotFoundException({ message: 'Resource not found' }),
      )

      const result = await awsEcsClient.getMostRecentTaskDefinition({
        resourceNameBase: 'test',
        serviceName: 'api',
      })
      expect(result).toBeNull()
    })

    it('should handle ServiceNotFoundException in stopFargateService', async () => {
      mockSdkClient.send.mockRejectedValueOnce(
        new ServiceNotFoundException({ message: 'Service not found' }),
      )

      await awsEcsClient.stopFargateService({
        clusterArn: 'cluster-arn',
        containerName: 'api',
        resourceNameBase: 'test',
      })
      // Should not throw
    })

    it('should handle ServiceNotFoundException in removeFargateService', async () => {
      // Mock stopFargateService responses
      mockSdkClient.send
        // First DescribeServicesCommand in stopFargateService
        .mockResolvedValueOnce({
          services: [
            {
              serviceArn: 'service-arn',
              status: 'ACTIVE',
              runningCount: 1,
            },
          ],
        })
        // UpdateServiceCommand in stopFargateService
        .mockResolvedValueOnce({})
        // Second DescribeServicesCommand in stopFargateService for waitForDrain
        .mockResolvedValueOnce({
          services: [
            {
              serviceArn: 'service-arn',
              status: 'ACTIVE',
              runningCount: 0,
            },
          ],
        })
        // Third DescribeServicesCommand in removeFargateService
        .mockResolvedValueOnce({
          services: [
            {
              serviceArn: 'service-arn',
              status: 'ACTIVE',
            },
          ],
        })
        // DeleteServiceCommand
        .mockResolvedValueOnce({
          service: { serviceArn: 'service-arn' },
        })

      await awsEcsClient.removeFargateService({
        containerName: 'api',
        resourceNameBase: 'test',
      })
      // Should not throw
    })

    it('should handle ResourceNotFoundException in deleteClusterIfEmpty', async () => {
      mockSdkClient.send
        .mockResolvedValueOnce({ clusters: [] })
        .mockResolvedValueOnce({ services: [] })
        .mockRejectedValueOnce(
          new ResourceNotFoundException({ message: 'Resource not found' }),
        )

      await expect(
        awsEcsClient.deleteClusterIfEmpty('test'),
      ).resolves.not.toThrow()
      // Should not throw
    })

    it('should throw ServerlessError when task definition registration fails', async () => {
      mockSdkClient.send.mockRejectedValueOnce(
        new Error('Failed to register task definition'),
      )

      await expect(
        awsEcsClient.registerTaskDefinition({
          resourceNameBase: 'test',
          containerName: 'api',
          imageUri: 'test-image:latest',
          executionRoleArn: 'execution-role',
          taskRoleArn: 'task-role',
          region: 'us-east-1',
        }),
      ).rejects.toThrow('Failed to register task definition')
    })

    it('should throw ServerlessError when service creation fails', async () => {
      mockSdkClient.send
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: null } })

      await expect(
        awsEcsClient.createFargateService({
          clusterArn: 'cluster-arn',
          resourceNameBase: 'test',
          containerName: 'api',
          taskDefinitionArn: 'task-def-arn',
          targetGroupArn: 'target-group-arn',
          subnetIds: ['subnet-1'],
          securityGroupIds: ['sg-1'],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'AWS_ECS_FAILED_TO_CREATE_FARGATE_SERVICE',
        }),
      )
    })
  })

  describe('service deployment', () => {
    beforeEach(() => {
      mockSdkClient.send.mockReset()
    })
    it('should get latest service deployment', async () => {
      const deployment = {
        id: 'deployment-1',
        status: 'PRIMARY',
        taskDefinition: 'task-def-1',
      }
      mockSdkClient.send.mockResolvedValueOnce({
        serviceDeployments: [deployment],
      })

      const result = await awsEcsClient.getLatestServiceDeployment({
        resourceNameBase: 'test',
        containerName: 'api',
        clusterArn: 'cluster-arn',
      })
      expect(result).toEqual(deployment)
    })

    it('should return null when no service deployments exist', async () => {
      mockSdkClient.send.mockResolvedValueOnce({
        services: [
          {
            deployments: [],
          },
        ],
      })

      const result = await awsEcsClient.getLatestServiceDeployment({
        resourceNameBase: 'test',
        containerName: 'api',
        clusterArn: 'cluster-arn',
      })
      expect(result).toBeNull()
    })

    it('should get most recent service failure event', async () => {
      mockSdkClient.send.mockResolvedValueOnce({
        services: [
          {
            events: [
              { message: 'Service is unhealthy in (target-group)' },
              { message: 'Service is starting' },
            ],
          },
        ],
      })

      const result =
        await awsEcsClient.getMostRecentServiceFailureEvent('service-arn')
      expect(result).toBe('Service is unhealthy in (target-group)')
    })

    it('should return undefined when no failure events exist', async () => {
      mockSdkClient.send.mockResolvedValueOnce({
        services: [
          {
            events: [{ message: 'Service is starting' }],
          },
        ],
      })

      const result =
        await awsEcsClient.getMostRecentServiceFailureEvent('service-arn')
      expect(result).toBeUndefined()
    })

    it('should get service deployment details', async () => {
      const deployment = {
        id: 'deployment-1',
        status: 'PRIMARY',
      }
      mockSdkClient.send.mockResolvedValueOnce({
        serviceDeployments: [deployment],
      })

      const result = await awsEcsClient.getServiceDeploymentDetails({
        serviceDeploymentArn: 'deployment-arn',
      })
      expect(result).toEqual(deployment)
    })

    it('should return null when no service deployment details exist', async () => {
      mockSdkClient.send.mockResolvedValueOnce({
        services: [
          {
            deployments: [],
          },
        ],
      })

      const result = await awsEcsClient.getServiceDeploymentDetails({
        serviceDeploymentArn: 'deployment-arn',
      })
      expect(result).toBeNull()
    })

    it('should throw error when service deployment ARN is missing', async () => {
      await expect(awsEcsClient.getServiceDeploymentDetails()).rejects.toThrow(
        'Service deployment ARN is required',
      )
    })
  })
})
