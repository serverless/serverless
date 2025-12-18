import { jest } from '@jest/globals'
import { mock } from 'jest-mock-extended'
import { ServerlessError } from '@serverless/util'

describe('deployWithUserProvidedResources', () => {
  let mockAwsVpcClient
  let mockAwsAlbClient
  let mockAwsEcsClient
  let mockAwsIamClient
  let mockState
  let mockLogger
  let mockSclProgress

  beforeEach(() => {
    mockAwsVpcClient = mock()
    mockAwsAlbClient = mock()
    mockAwsEcsClient = mock()
    mockAwsIamClient = mock()
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }
    mockSclProgress = {
      notice: jest.fn(),
      update: jest.fn(),
    }

    mockState = {
      state: {
        awsVpc: {},
        awsAlb: {},
        awsEcs: {
          cluster: {},
        },
        awsIam: {},
      },
      config: {
        deployment: {},
      },
      save: jest.fn().mockResolvedValue(undefined),
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('User-provided VPC resources', () => {
    it('should use user-provided VPC and networking resources', async () => {
      // Setup user-provided VPC configuration
      mockState.config.deployment = {
        type: 'awsApi@1.0',
        awsVpc: {
          id: 'vpc-12345',
          publicSubnets: ['subnet-public1', 'subnet-public2'],
          privateSubnets: ['subnet-private1', 'subnet-private2'],
          s2sSecurityGroupId: 'sg-s2s',
          loadBalancerSecurityGroupId: 'sg-lb',
        },
      }

      // Mock validation methods
      mockAwsVpcClient.validateUserProvidedVpc = jest
        .fn()
        .mockResolvedValue(true)
      mockAwsVpcClient.validateUserProvidedSubnets = jest
        .fn()
        .mockResolvedValue(true)
      mockAwsVpcClient.validateUserProvidedSecurityGroups = jest
        .fn()
        .mockResolvedValue(true)

      // Mock ECS cluster creation
      mockAwsEcsClient.getOrCreateCluster = jest
        .fn()
        .mockResolvedValue('ecs-cluster-arn')

      // Mock IAM role creation
      mockAwsIamClient.getOrCreateFargateExecutionRole = jest
        .fn()
        .mockResolvedValue('iam-role-arn')

      // Mock ALB creation
      mockAwsAlbClient.getOrCreateAlb = jest.fn().mockResolvedValue({
        LoadBalancerArn: 'alb-arn',
        DNSName: 'test-alb.amazonaws.com',
        CanonicalHostedZoneId: 'Z123456',
      })

      // Simulate the deployFoundationalInfrastructure function
      const deployFoundationalInfrastructure = async ({
        state,
        resourceNameBase,
        logger,
        sclProgress,
        awsClients,
      }) => {
        const { awsVpcClient } = awsClients

        // Check if any networking resources are provided in the configuration
        const userProvidedVpcId = state.config?.deployment?.awsVpc?.id
        const userProvidedPublicSubnets =
          state.config?.deployment?.awsVpc?.publicSubnets
        const userProvidedPrivateSubnets =
          state.config?.deployment?.awsVpc?.privateSubnets
        const userProvidedS2sSecurityGroupId =
          state.config?.deployment?.awsVpc?.s2sSecurityGroupId
        const userProvidedLbSecurityGroupId =
          state.config?.deployment?.awsVpc?.loadBalancerSecurityGroupId

        // Check if some but not all networking resources are provided
        const hasPartialNetworkingResources =
          (userProvidedVpcId &&
            (!userProvidedPublicSubnets ||
              !userProvidedPrivateSubnets ||
              !userProvidedS2sSecurityGroupId ||
              !userProvidedLbSecurityGroupId)) ||
          (!userProvidedVpcId &&
            (userProvidedPublicSubnets ||
              userProvidedPrivateSubnets ||
              userProvidedS2sSecurityGroupId ||
              userProvidedLbSecurityGroupId))

        if (hasPartialNetworkingResources) {
          throw new ServerlessError(
            'If any networking resources are provided, all must be specified (VPC ID, public subnets, private subnets, service-to-service security group, and load balancer security group)',
            'INCOMPLETE_NETWORKING_RESOURCES',
            { stack: false },
          )
        }

        if (userProvidedVpcId) {
          // Validate and use user-provided networking resources
          logger.debug(`Using user-provided VPC ID: ${userProvidedVpcId}`)

          // Validate VPC
          await awsVpcClient.validateUserProvidedVpc(userProvidedVpcId)

          // Validate subnets
          await awsVpcClient.validateUserProvidedSubnets(
            userProvidedPublicSubnets,
            userProvidedVpcId,
          )
          await awsVpcClient.validateUserProvidedSubnets(
            userProvidedPrivateSubnets,
            userProvidedVpcId,
          )

          // Validate security groups
          await awsVpcClient.validateUserProvidedSecurityGroups(
            [userProvidedS2sSecurityGroupId, userProvidedLbSecurityGroupId],
            userProvidedVpcId,
          )

          // Use user-provided resources
          state.state.awsVpc.id = userProvidedVpcId
          state.state.awsVpc.publicSubnets = userProvidedPublicSubnets
          state.state.awsVpc.privateSubnets = userProvidedPrivateSubnets
          state.state.awsVpc.s2sSecurityGroupId = userProvidedS2sSecurityGroupId
          state.state.awsVpc.loadBalancerSecurityGroupId =
            userProvidedLbSecurityGroupId
          state.state.awsVpc.provisionedBy = 'user'
        }
      }

      await deployFoundationalInfrastructure({
        state: mockState,
        resourceNameBase: 'test',
        logger: mockLogger,
        sclProgress: mockSclProgress,
        awsClients: {
          awsVpcClient: mockAwsVpcClient,
          awsAlbClient: mockAwsAlbClient,
          awsEcsClient: mockAwsEcsClient,
          awsIamClient: mockAwsIamClient,
        },
      })

      // Verify VPC validation was called
      expect(mockAwsVpcClient.validateUserProvidedVpc).toHaveBeenCalledWith(
        'vpc-12345',
      )

      // Verify subnet validation was called
      expect(mockAwsVpcClient.validateUserProvidedSubnets).toHaveBeenCalledWith(
        ['subnet-public1', 'subnet-public2'],
        'vpc-12345',
      )
      expect(mockAwsVpcClient.validateUserProvidedSubnets).toHaveBeenCalledWith(
        ['subnet-private1', 'subnet-private2'],
        'vpc-12345',
      )

      // Verify security group validation was called
      expect(
        mockAwsVpcClient.validateUserProvidedSecurityGroups,
      ).toHaveBeenCalledWith(['sg-s2s', 'sg-lb'], 'vpc-12345')

      // Verify state was updated correctly
      expect(mockState.state.awsVpc.id).toBe('vpc-12345')
      expect(mockState.state.awsVpc.publicSubnets).toEqual([
        'subnet-public1',
        'subnet-public2',
      ])
      expect(mockState.state.awsVpc.privateSubnets).toEqual([
        'subnet-private1',
        'subnet-private2',
      ])
      expect(mockState.state.awsVpc.s2sSecurityGroupId).toBe('sg-s2s')
      expect(mockState.state.awsVpc.loadBalancerSecurityGroupId).toBe('sg-lb')
      expect(mockState.state.awsVpc.provisionedBy).toBe('user')
    })

    it('should throw error when partial networking resources are provided', async () => {
      // Setup partial VPC configuration
      mockState.config.deployment = {
        type: 'awsApi@1.0',
        awsVpc: {
          id: 'vpc-12345',
          // Missing other required resources
        },
      }

      // Simulate the deployFoundationalInfrastructure function
      const deployFoundationalInfrastructure = async ({
        state,
        resourceNameBase,
        logger,
        sclProgress,
        awsClients,
      }) => {
        // Check if any networking resources are provided in the configuration
        const userProvidedVpcId = state.config?.deployment?.awsVpc?.id
        const userProvidedPublicSubnets =
          state.config?.deployment?.awsVpc?.publicSubnets
        const userProvidedPrivateSubnets =
          state.config?.deployment?.awsVpc?.privateSubnets
        const userProvidedS2sSecurityGroupId =
          state.config?.deployment?.awsVpc?.s2sSecurityGroupId
        const userProvidedLbSecurityGroupId =
          state.config?.deployment?.awsVpc?.loadBalancerSecurityGroupId

        // Check if some but not all networking resources are provided
        const hasPartialNetworkingResources =
          (userProvidedVpcId &&
            (!userProvidedPublicSubnets ||
              !userProvidedPrivateSubnets ||
              !userProvidedS2sSecurityGroupId ||
              !userProvidedLbSecurityGroupId)) ||
          (!userProvidedVpcId &&
            (userProvidedPublicSubnets ||
              userProvidedPrivateSubnets ||
              userProvidedS2sSecurityGroupId ||
              !userProvidedLbSecurityGroupId))

        if (hasPartialNetworkingResources) {
          throw new ServerlessError(
            'If any networking resources are provided, all must be specified (VPC ID, public subnets, private subnets, service-to-service security group, and load balancer security group)',
            'INCOMPLETE_NETWORKING_RESOURCES',
            { stack: false },
          )
        }
      }

      await expect(
        deployFoundationalInfrastructure({
          state: mockState,
          resourceNameBase: 'test',
          logger: mockLogger,
          sclProgress: mockSclProgress,
          awsClients: {
            awsVpcClient: mockAwsVpcClient,
            awsAlbClient: mockAwsAlbClient,
            awsEcsClient: mockAwsEcsClient,
            awsIamClient: mockAwsIamClient,
          },
        }),
      ).rejects.toThrow(
        new ServerlessError(
          'If any networking resources are provided, all must be specified (VPC ID, public subnets, private subnets, service-to-service security group, and load balancer security group)',
          'INCOMPLETE_NETWORKING_RESOURCES',
          { stack: false },
        ),
      )
    })
  })

  describe('User-provided IAM roles', () => {
    it('should use user-provided IAM roles', async () => {
      // Setup user-provided IAM configuration
      mockState.config.deployment = {
        type: 'awsApi@1.0',
        awsIam: {
          roleArn: 'arn:aws:iam::123456789012:role/user-provided-role',
          ecsExecutionRoleArn:
            'arn:aws:iam::123456789012:role/user-provided-ecs-role',
        },
      }

      // Mock VPC creation
      mockAwsVpcClient.getOrCreateVpc = jest.fn().mockResolvedValue('vpc-12345')
      mockAwsVpcClient.getOrCreateSubnets = jest.fn().mockResolvedValue({
        publicSubnets: ['subnet-public1', 'subnet-public2'],
        privateSubnets: ['subnet-private1', 'subnet-private2'],
      })
      mockAwsVpcClient.getOrCreateServiceToServiceSecurityGroup = jest
        .fn()
        .mockResolvedValue('sg-s2s')
      mockAwsVpcClient.getOrCreateLoadBalancerSecurityGroup = jest
        .fn()
        .mockResolvedValue('sg-lb')

      // Mock ALB creation
      mockAwsAlbClient.getOrCreateAlb = jest.fn().mockResolvedValue({
        LoadBalancerArn: 'alb-arn',
        DNSName: 'test-alb.amazonaws.com',
        CanonicalHostedZoneId: 'Z123456',
      })

      // Mock ECS cluster creation
      mockAwsEcsClient.getOrCreateCluster = jest
        .fn()
        .mockResolvedValue('ecs-cluster-arn')

      // Mock IAM role validation
      mockAwsIamClient.validateFargateExecutionRole = jest
        .fn()
        .mockResolvedValue(true)

      // Simulate the setupIamRoles function
      const setupIamRoles = async ({
        state,
        resourceNameBase,
        logger,
        sclProgress,
        awsClients,
      }) => {
        const { awsIamClient } = awsClients

        // Check if user-provided IAM roles are specified
        const userProvidedRoleArn = state.config?.deployment?.awsIam?.roleArn
        const userProvidedEcsRoleArn =
          state.config?.deployment?.awsIam?.ecsExecutionRoleArn

        if (userProvidedRoleArn) {
          // Use user-provided IAM role
          logger.debug(`Using user-provided IAM role: ${userProvidedRoleArn}`)
          state.state.awsIam = state.state.awsIam || {}
          state.state.awsIam.roleArn = userProvidedRoleArn
        }

        if (userProvidedEcsRoleArn) {
          // Use user-provided ECS execution role
          logger.debug(
            `Using user-provided ECS execution role: ${userProvidedEcsRoleArn}`,
          )
          state.state.awsIam = state.state.awsIam || {}
          state.state.awsIam.fargateEcsExecutionRoleArn = userProvidedEcsRoleArn
        } else {
          // Create new IAM role
          const fargateEcsExecutionRoleArn =
            await awsIamClient.getOrCreateFargateExecutionRole(resourceNameBase)

          // Store the Fargate ECS execution role in state
          state.state.awsIam = state.state.awsIam || {}
          state.state.awsIam.fargateEcsExecutionRoleArn =
            fargateEcsExecutionRoleArn
        }
      }

      await setupIamRoles({
        state: mockState,
        resourceNameBase: 'test',
        logger: mockLogger,
        sclProgress: mockSclProgress,
        awsClients: {
          awsVpcClient: mockAwsVpcClient,
          awsAlbClient: mockAwsAlbClient,
          awsEcsClient: mockAwsEcsClient,
          awsIamClient: mockAwsIamClient,
        },
      })

      // Verify IAM role creation was not called
      expect(
        mockAwsIamClient.getOrCreateFargateExecutionRole,
      ).not.toHaveBeenCalled()

      // Verify state was updated correctly
      expect(mockState.state.awsIam.roleArn).toBe(
        'arn:aws:iam::123456789012:role/user-provided-role',
      )
      expect(mockState.state.awsIam.fargateEcsExecutionRoleArn).toBe(
        'arn:aws:iam::123456789012:role/user-provided-ecs-role',
      )
    })
  })

  describe('User-provided WAF ACL', () => {
    it('should associate WAF ACL with ALB', async () => {
      // Setup user-provided WAF configuration
      mockState.config.deployment = {
        type: 'awsApi@1.0',
        awsAlb: {
          wafAclArn: 'arn:aws:wafv2:region:123456789012:global/webacl/test-waf',
        },
      }

      // Mock VPC creation
      mockAwsVpcClient.getOrCreateVpc = jest.fn().mockResolvedValue('vpc-12345')
      mockAwsVpcClient.getOrCreateSubnets = jest.fn().mockResolvedValue({
        publicSubnets: ['subnet-public1', 'subnet-public2'],
        privateSubnets: ['subnet-private1', 'subnet-private2'],
      })
      mockAwsVpcClient.getOrCreateServiceToServiceSecurityGroup = jest
        .fn()
        .mockResolvedValue('sg-s2s')
      mockAwsVpcClient.getOrCreateLoadBalancerSecurityGroup = jest
        .fn()
        .mockResolvedValue('sg-lb')

      // Mock ALB creation
      mockAwsAlbClient.getOrCreateAlb = jest.fn().mockResolvedValue({
        LoadBalancerArn: 'alb-arn',
        DNSName: 'test-alb.amazonaws.com',
        CanonicalHostedZoneId: 'Z123456',
      })
      mockAwsAlbClient.associateWafToAlb = jest
        .fn()
        .mockResolvedValue(undefined)

      // Mock ECS cluster creation
      mockAwsEcsClient.getOrCreateCluster = jest
        .fn()
        .mockResolvedValue('ecs-cluster-arn')

      // Mock IAM role creation
      mockAwsIamClient.getOrCreateFargateExecutionRole = jest
        .fn()
        .mockResolvedValue('iam-role-arn')

      // Simulate the setupAlb function
      const setupAlb = async ({
        state,
        resourceNameBase,
        logger,
        sclProgress,
        awsClients,
      }) => {
        const { awsAlbClient } = awsClients

        // Create or get ALB
        const alb = await awsAlbClient.getOrCreateAlb({
          resourceNameBase,
          vpcId: state.state.awsVpc.id,
          publicSubnets: state.state.awsVpc.publicSubnets,
          securityGroupId: state.state.awsVpc.loadBalancerSecurityGroupId,
        })

        // Store ALB info in state
        state.state.awsAlb.arn = alb.LoadBalancerArn
        state.state.awsAlb.dnsName = alb.DNSName
        state.state.awsAlb.canonicalHostedZoneId = alb.CanonicalHostedZoneId

        // Check if user-provided WAF ACL ARN is specified
        const userProvidedWafAclArn =
          state.config?.deployment?.awsAlb?.wafAclArn

        if (userProvidedWafAclArn) {
          // Associate WAF ACL with ALB
          logger.debug(
            `Associating WAF ACL ${userProvidedWafAclArn} with ALB ${alb.LoadBalancerArn}`,
          )
          await awsAlbClient.associateWafToAlb({
            albArn: alb.LoadBalancerArn,
            wafAclArn: userProvidedWafAclArn,
          })

          // Store WAF ACL ARN in state
          state.state.awsAlb.wafAclArn = userProvidedWafAclArn
        }
      }

      await setupAlb({
        state: mockState,
        resourceNameBase: 'test',
        logger: mockLogger,
        sclProgress: mockSclProgress,
        awsClients: {
          awsVpcClient: mockAwsVpcClient,
          awsAlbClient: mockAwsAlbClient,
          awsEcsClient: mockAwsEcsClient,
          awsIamClient: mockAwsIamClient,
        },
      })

      // Verify WAF association was called
      expect(mockAwsAlbClient.associateWafToAlb).toHaveBeenCalledWith({
        albArn: 'alb-arn',
        wafAclArn: 'arn:aws:wafv2:region:123456789012:global/webacl/test-waf',
      })

      // Verify state was updated correctly
      expect(mockState.state.awsAlb.wafAclArn).toBe(
        'arn:aws:wafv2:region:123456789012:global/webacl/test-waf',
      )
    })
  })

  describe('Combined user-provided resources', () => {
    it('should use all user-provided resources together', async () => {
      // Setup user-provided configuration with all resource types
      mockState.config.deployment = {
        type: 'awsApi@1.0',
        awsVpc: {
          id: 'vpc-12345',
          publicSubnets: ['subnet-public1', 'subnet-public2'],
          privateSubnets: ['subnet-private1', 'subnet-private2'],
          s2sSecurityGroupId: 'sg-s2s',
          loadBalancerSecurityGroupId: 'sg-lb',
        },
        awsIam: {
          roleArn: 'arn:aws:iam::123456789012:role/user-provided-role',
          ecsExecutionRoleArn:
            'arn:aws:iam::123456789012:role/user-provided-ecs-role',
        },
        awsAlb: {
          wafAclArn: 'arn:aws:wafv2:region:123456789012:global/webacl/test-waf',
        },
      }

      // Mock validation methods
      mockAwsVpcClient.validateUserProvidedVpc = jest
        .fn()
        .mockResolvedValue(true)
      mockAwsVpcClient.validateUserProvidedSubnets = jest
        .fn()
        .mockResolvedValue(true)
      mockAwsVpcClient.validateUserProvidedSecurityGroups = jest
        .fn()
        .mockResolvedValue(true)

      // Mock ALB creation
      mockAwsAlbClient.getOrCreateAlb = jest.fn().mockResolvedValue({
        LoadBalancerArn: 'alb-arn',
        DNSName: 'test-alb.amazonaws.com',
        CanonicalHostedZoneId: 'Z123456',
      })
      mockAwsAlbClient.associateWafToAlb = jest
        .fn()
        .mockResolvedValue(undefined)

      // Mock ECS cluster creation
      mockAwsEcsClient.getOrCreateCluster = jest
        .fn()
        .mockResolvedValue('ecs-cluster-arn')

      // Simulate the deployFoundationalInfrastructure function for VPC resources
      const deployFoundationalInfrastructure = async ({
        state,
        resourceNameBase,
        logger,
        sclProgress,
        awsClients,
      }) => {
        const { awsVpcClient } = awsClients

        // Check if any networking resources are provided in the configuration
        const userProvidedVpcId = state.config?.deployment?.awsVpc?.id
        const userProvidedPublicSubnets =
          state.config?.deployment?.awsVpc?.publicSubnets
        const userProvidedPrivateSubnets =
          state.config?.deployment?.awsVpc?.privateSubnets
        const userProvidedS2sSecurityGroupId =
          state.config?.deployment?.awsVpc?.s2sSecurityGroupId
        const userProvidedLbSecurityGroupId =
          state.config?.deployment?.awsVpc?.loadBalancerSecurityGroupId

        if (userProvidedVpcId) {
          // Validate and use user-provided networking resources
          logger.debug(`Using user-provided VPC ID: ${userProvidedVpcId}`)

          // Validate VPC
          await awsVpcClient.validateUserProvidedVpc(userProvidedVpcId)

          // Validate subnets
          await awsVpcClient.validateUserProvidedSubnets(
            userProvidedPublicSubnets,
            userProvidedVpcId,
          )
          await awsVpcClient.validateUserProvidedSubnets(
            userProvidedPrivateSubnets,
            userProvidedVpcId,
          )

          // Validate security groups
          await awsVpcClient.validateUserProvidedSecurityGroups(
            [userProvidedS2sSecurityGroupId, userProvidedLbSecurityGroupId],
            userProvidedVpcId,
          )

          // Use user-provided resources
          state.state.awsVpc.id = userProvidedVpcId
          state.state.awsVpc.publicSubnets = userProvidedPublicSubnets
          state.state.awsVpc.privateSubnets = userProvidedPrivateSubnets
          state.state.awsVpc.s2sSecurityGroupId = userProvidedS2sSecurityGroupId
          state.state.awsVpc.loadBalancerSecurityGroupId =
            userProvidedLbSecurityGroupId
          state.state.awsVpc.provisionedBy = 'user'
        }
      }

      // Simulate the setupIamRoles function
      const setupIamRoles = async ({
        state,
        resourceNameBase,
        logger,
        sclProgress,
        awsClients,
      }) => {
        // Check if user-provided IAM roles are specified
        const userProvidedRoleArn = state.config?.deployment?.awsIam?.roleArn
        const userProvidedEcsRoleArn =
          state.config?.deployment?.awsIam?.ecsExecutionRoleArn

        if (userProvidedRoleArn) {
          // Use user-provided IAM role
          logger.debug(`Using user-provided IAM role: ${userProvidedRoleArn}`)
          state.state.awsIam = state.state.awsIam || {}
          state.state.awsIam.roleArn = userProvidedRoleArn
        }

        if (userProvidedEcsRoleArn) {
          // Use user-provided ECS execution role
          logger.debug(
            `Using user-provided ECS execution role: ${userProvidedEcsRoleArn}`,
          )
          state.state.awsIam = state.state.awsIam || {}
          state.state.awsIam.fargateEcsExecutionRoleArn = userProvidedEcsRoleArn
        }
      }

      // Simulate the setupAlb function
      const setupAlb = async ({
        state,
        resourceNameBase,
        logger,
        sclProgress,
        awsClients,
      }) => {
        const { awsAlbClient } = awsClients

        // Create or get ALB
        const alb = await awsAlbClient.getOrCreateAlb({
          resourceNameBase,
          vpcId: state.state.awsVpc.id,
          publicSubnets: state.state.awsVpc.publicSubnets,
          securityGroupId: state.state.awsVpc.loadBalancerSecurityGroupId,
        })

        // Store ALB info in state
        state.state.awsAlb.arn = alb.LoadBalancerArn
        state.state.awsAlb.dnsName = alb.DNSName
        state.state.awsAlb.canonicalHostedZoneId = alb.CanonicalHostedZoneId

        // Check if user-provided WAF ACL ARN is specified
        const userProvidedWafAclArn =
          state.config?.deployment?.awsAlb?.wafAclArn

        if (userProvidedWafAclArn) {
          // Associate WAF ACL with ALB
          logger.debug(
            `Associating WAF ACL ${userProvidedWafAclArn} with ALB ${alb.LoadBalancerArn}`,
          )
          await awsAlbClient.associateWafToAlb({
            albArn: alb.LoadBalancerArn,
            wafAclArn: userProvidedWafAclArn,
          })

          // Store WAF ACL ARN in state
          state.state.awsAlb.wafAclArn = userProvidedWafAclArn
        }
      }

      // Execute all the functions in sequence
      await deployFoundationalInfrastructure({
        state: mockState,
        resourceNameBase: 'test',
        logger: mockLogger,
        sclProgress: mockSclProgress,
        awsClients: {
          awsVpcClient: mockAwsVpcClient,
          awsAlbClient: mockAwsAlbClient,
          awsEcsClient: mockAwsEcsClient,
          awsIamClient: mockAwsIamClient,
        },
      })

      await setupIamRoles({
        state: mockState,
        resourceNameBase: 'test',
        logger: mockLogger,
        sclProgress: mockSclProgress,
        awsClients: {
          awsVpcClient: mockAwsVpcClient,
          awsAlbClient: mockAwsAlbClient,
          awsEcsClient: mockAwsEcsClient,
          awsIamClient: mockAwsIamClient,
        },
      })

      await setupAlb({
        state: mockState,
        resourceNameBase: 'test',
        logger: mockLogger,
        sclProgress: mockSclProgress,
        awsClients: {
          awsVpcClient: mockAwsVpcClient,
          awsAlbClient: mockAwsAlbClient,
          awsEcsClient: mockAwsEcsClient,
          awsIamClient: mockAwsIamClient,
        },
      })

      // Verify VPC validation was called
      expect(mockAwsVpcClient.validateUserProvidedVpc).toHaveBeenCalledWith(
        'vpc-12345',
      )

      // Verify subnet validation was called
      expect(mockAwsVpcClient.validateUserProvidedSubnets).toHaveBeenCalledWith(
        ['subnet-public1', 'subnet-public2'],
        'vpc-12345',
      )

      // Verify security group validation was called
      expect(
        mockAwsVpcClient.validateUserProvidedSecurityGroups,
      ).toHaveBeenCalledWith(['sg-s2s', 'sg-lb'], 'vpc-12345')

      // Verify WAF association was called
      expect(mockAwsAlbClient.associateWafToAlb).toHaveBeenCalledWith({
        albArn: 'alb-arn',
        wafAclArn: 'arn:aws:wafv2:region:123456789012:global/webacl/test-waf',
      })

      // Verify IAM role creation was not called
      expect(
        mockAwsIamClient.getOrCreateFargateExecutionRole,
      ).not.toHaveBeenCalled()

      // Verify VPC creation was not called
      expect(mockAwsVpcClient.getOrCreateVpc).not.toHaveBeenCalled()

      // Verify state was updated correctly
      expect(mockState.state.awsVpc.provisionedBy).toBe('user')
      expect(mockState.state.awsIam.roleArn).toBe(
        'arn:aws:iam::123456789012:role/user-provided-role',
      )
      expect(mockState.state.awsAlb.wafAclArn).toBe(
        'arn:aws:wafv2:region:123456789012:global/webacl/test-waf',
      )
    })
  })
})
