import { jest } from '@jest/globals'
import { mock } from 'jest-mock-extended'
import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
} from '@aws-sdk/client-ec2'
import { ServerlessError } from '@serverless/util'
import { AwsVpcClient } from '../../src/lib/aws/vpc.js'

describe('AwsVpcClient', () => {
  let awsVpcClient
  let mockSdkClient

  beforeEach(() => {
    mockSdkClient = mock(EC2Client)
    awsVpcClient = new AwsVpcClient()
    awsVpcClient.client = mockSdkClient
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('validateUserProvidedVpc', () => {
    it('should validate a valid VPC', async () => {
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeVpcsCommand) {
          expect(command.input).toEqual({
            VpcIds: [vpcId],
          })
          return {
            Vpcs: [
              {
                VpcId: vpcId,
                State: 'available',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(awsVpcClient.validateUserProvidedVpc(vpcId)).resolves.toBe(
        true,
      )
      expect(mockSdkClient.send).toHaveBeenCalledTimes(1)
    })

    it('should throw error for non-existent VPC', async () => {
      const vpcId = 'vpc-nonexistent'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeVpcsCommand) {
          return {
            Vpcs: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(awsVpcClient.validateUserProvidedVpc(vpcId)).rejects.toThrow(
        new ServerlessError(
          `The provided VPC ID ${vpcId} does not exist`,
          'AWS_VPC_NOT_FOUND',
          { stack: false },
        ),
      )
    })

    it('should throw error for VPC in invalid state', async () => {
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeVpcsCommand) {
          return {
            Vpcs: [
              {
                VpcId: vpcId,
                State: 'pending',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(awsVpcClient.validateUserProvidedVpc(vpcId)).rejects.toThrow(
        new ServerlessError(
          `The provided VPC ID ${vpcId} is not in an available state. Current state: pending`,
          'AWS_VPC_INVALID_STATE',
          { stack: false },
        ),
      )
    })

    it('should handle AWS SDK errors', async () => {
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockRejectedValue(new Error('AWS SDK error'))

      await expect(awsVpcClient.validateUserProvidedVpc(vpcId)).rejects.toThrow(
        new ServerlessError(
          `Failed to validate VPC ID ${vpcId}: AWS SDK error`,
          'AWS_VPC_VALIDATION_FAILED',
          { stack: false },
        ),
      )
    })
  })

  describe('validateUserProvidedSubnets', () => {
    it('should validate valid subnets', async () => {
      const subnetIds = ['subnet-12345', 'subnet-67890']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeSubnetsCommand) {
          expect(command.input).toEqual({
            SubnetIds: subnetIds,
          })
          return {
            Subnets: [
              {
                SubnetId: 'subnet-12345',
                VpcId: vpcId,
                State: 'available',
              },
              {
                SubnetId: 'subnet-67890',
                VpcId: vpcId,
                State: 'available',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsVpcClient.validateUserProvidedSubnets(subnetIds, vpcId),
      ).resolves.toBe(true)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(1)
    })

    it('should throw error for non-existent subnets', async () => {
      const subnetIds = ['subnet-nonexistent']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeSubnetsCommand) {
          return {
            Subnets: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsVpcClient.validateUserProvidedSubnets(subnetIds, vpcId),
      ).rejects.toThrow(
        new ServerlessError(
          'One or more of the provided subnet IDs do not exist',
          'AWS_SUBNET_NOT_FOUND',
          { stack: false },
        ),
      )
    })

    it('should throw error for subnets in different VPC', async () => {
      const subnetIds = ['subnet-12345', 'subnet-67890']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeSubnetsCommand) {
          return {
            Subnets: [
              {
                SubnetId: 'subnet-12345',
                VpcId: vpcId,
                State: 'available',
              },
              {
                SubnetId: 'subnet-67890',
                VpcId: 'vpc-different',
                State: 'available',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsVpcClient.validateUserProvidedSubnets(subnetIds, vpcId),
      ).rejects.toThrow(
        new ServerlessError(
          `The following subnets do not belong to VPC ${vpcId}: subnet-67890`,
          'AWS_SUBNET_VPC_MISMATCH',
          { stack: false },
        ),
      )
    })

    it('should throw error for subnets in invalid state', async () => {
      const subnetIds = ['subnet-12345', 'subnet-67890']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeSubnetsCommand) {
          return {
            Subnets: [
              {
                SubnetId: 'subnet-12345',
                VpcId: vpcId,
                State: 'available',
              },
              {
                SubnetId: 'subnet-67890',
                VpcId: vpcId,
                State: 'pending',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsVpcClient.validateUserProvidedSubnets(subnetIds, vpcId),
      ).rejects.toThrow(
        new ServerlessError(
          `The following subnets are not in an available state: subnet-67890`,
          'AWS_SUBNET_INVALID_STATE',
          { stack: false },
        ),
      )
    })

    it('should handle AWS SDK errors', async () => {
      const subnetIds = ['subnet-12345', 'subnet-67890']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockRejectedValue(new Error('AWS SDK error'))

      await expect(
        awsVpcClient.validateUserProvidedSubnets(subnetIds, vpcId),
      ).rejects.toThrow(
        new ServerlessError(
          'Failed to validate subnet IDs: AWS SDK error',
          'AWS_SUBNET_VALIDATION_FAILED',
          { stack: false },
        ),
      )
    })
  })

  describe('validateUserProvidedSecurityGroups', () => {
    it('should validate valid security groups', async () => {
      const securityGroupIds = ['sg-12345', 'sg-67890']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeSecurityGroupsCommand) {
          expect(command.input).toEqual({
            GroupIds: securityGroupIds,
          })
          return {
            SecurityGroups: [
              {
                GroupId: 'sg-12345',
                VpcId: vpcId,
              },
              {
                GroupId: 'sg-67890',
                VpcId: vpcId,
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsVpcClient.validateUserProvidedSecurityGroups(
          securityGroupIds,
          vpcId,
        ),
      ).resolves.toBe(true)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(1)
    })

    it('should throw error for non-existent security groups', async () => {
      const securityGroupIds = ['sg-nonexistent']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeSecurityGroupsCommand) {
          return {
            SecurityGroups: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsVpcClient.validateUserProvidedSecurityGroups(
          securityGroupIds,
          vpcId,
        ),
      ).rejects.toThrow(
        new ServerlessError(
          'One or more of the provided security group IDs do not exist',
          'AWS_SECURITY_GROUP_NOT_FOUND',
          { stack: false },
        ),
      )
    })

    it('should throw error for security groups in different VPC', async () => {
      const securityGroupIds = ['sg-12345', 'sg-67890']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeSecurityGroupsCommand) {
          return {
            SecurityGroups: [
              {
                GroupId: 'sg-12345',
                VpcId: vpcId,
              },
              {
                GroupId: 'sg-67890',
                VpcId: 'vpc-different',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsVpcClient.validateUserProvidedSecurityGroups(
          securityGroupIds,
          vpcId,
        ),
      ).rejects.toThrow(
        new ServerlessError(
          `The following security groups do not belong to VPC ${vpcId}: sg-67890`,
          'AWS_SECURITY_GROUP_VPC_MISMATCH',
          { stack: false },
        ),
      )
    })

    it('should handle AWS SDK errors', async () => {
      const securityGroupIds = ['sg-12345', 'sg-67890']
      const vpcId = 'vpc-12345'

      mockSdkClient.send.mockRejectedValue(new Error('AWS SDK error'))

      await expect(
        awsVpcClient.validateUserProvidedSecurityGroups(
          securityGroupIds,
          vpcId,
        ),
      ).rejects.toThrow(
        new ServerlessError(
          'Failed to validate security group IDs: AWS SDK error',
          'AWS_SECURITY_GROUP_VALIDATION_FAILED',
          { stack: false },
        ),
      )
    })
  })
})
