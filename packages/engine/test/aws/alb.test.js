import { jest } from '@jest/globals'
import { mock } from 'jest-mock-extended'
import {
  ElasticLoadBalancingV2Client,
  LoadBalancerNotFoundException,
  ResourceNotFoundException,
  DescribeLoadBalancersCommand,
  CreateLoadBalancerCommand,
  DeleteLoadBalancerCommand,
  CreateTargetGroupCommand,
  DeleteTargetGroupCommand,
  DescribeTargetGroupsCommand,
  CreateListenerCommand,
  DeleteListenerCommand,
  DescribeListenersCommand,
  CreateRuleCommand,
  DeleteRuleCommand,
  DescribeRulesCommand,
  ModifyRuleCommand,
  SetRulePrioritiesCommand,
  SetSecurityGroupsCommand,
  ModifyTargetGroupCommand,
  ModifyTargetGroupAttributesCommand,
  DescribeTargetHealthCommand,
  AddListenerCertificatesCommand,
  RegisterTargetsCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2'
import { WAFV2Client, AssociateWebACLCommand } from '@aws-sdk/client-wafv2'
import { ServerlessError } from '@serverless/util'
import { AwsAlbClient } from '../../src/lib/aws/alb.js'

describe('AwsAlbClient', () => {
  let awsAlbClient
  let mockSdkClient
  let mockWafClient

  jest.setTimeout(30000) // Increase timeout for all tests

  beforeEach(() => {
    mockSdkClient = mock(ElasticLoadBalancingV2Client)
    mockWafClient = mock(WAFV2Client)
    awsAlbClient = new AwsAlbClient()
    awsAlbClient.client = mockSdkClient
    awsAlbClient.wafClient = mockWafClient
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('target group management', () => {
    const defaultParams = {
      resourceNameBase: 'test',
      serviceName: 'api',
      type: 'ip',
      port: 80,
      protocol: 'HTTP',
      healthCheckPath: '/health',
      healthCheckPort: '80',
      healthCheckProtocol: 'HTTP',
      healthCheckInterval: 30,
      healthCheckTimeout: 5,
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
    }

    it('should create new target group when none exists', async () => {
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test'
      const targetGroup = {
        TargetGroupArn: targetGroupArn,
        TargetType: 'ip',
        Port: 8080,
        Protocol: 'HTTP',
        HealthCheckEnabled: true,
        HealthCheckPath: '/health',
        HealthCheckPort: '80',
        HealthCheckProtocol: 'HTTP',
      }

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeTargetGroupsCommand) {
          // First call from updateTargetGroup
          expect(command.input).toEqual({
            Names: ['test-api-ip'],
          })
          throw new Error('Target group not found')
        }
        if (command instanceof CreateTargetGroupCommand) {
          expect(command.input).toEqual({
            Name: 'test-api-ip',
            Protocol: 'HTTP',
            VpcId: undefined,
            Port: 8080,
            TargetType: 'ip',
          })
          return {
            TargetGroups: [targetGroup],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.getOrCreateTargetGroup({
        ...defaultParams,
        type: 'ip',
      })
      expect(result).toBe(targetGroupArn)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(2)
    })

    it('should return existing target group when one exists', async () => {
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test'
      const targetGroup = {
        TargetGroupArn: targetGroupArn,
        TargetType: 'ip',
        Port: 8080,
        Protocol: 'HTTP',
        HealthCheckEnabled: true,
        HealthCheckPath: '/health',
        HealthCheckPort: '80',
        HealthCheckProtocol: 'HTTP',
      }

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeTargetGroupsCommand) {
          expect(command.input).toEqual({
            Names: ['test-api-ip'],
          })
          return {
            TargetGroups: [targetGroup],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.getOrCreateTargetGroup(defaultParams)
      expect(result).toBe(targetGroupArn)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(1)
    })

    it('should update target group health check settings when they have changed', async () => {
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test'
      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeTargetGroupsCommand) {
          expect(command.input).toEqual({
            Names: ['test-api-ip'],
          })
          return {
            TargetGroups: [
              {
                TargetGroupArn: targetGroupArn,
                TargetType: 'ip',
                Port: 8080,
                Protocol: 'HTTP',
                HealthCheckEnabled: true,
                HealthCheckPath: '/old-health',
                HealthCheckPort: '8080',
                HealthCheckProtocol: 'HTTP',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof ModifyTargetGroupCommand) {
          expect(command.input).toEqual({
            TargetGroupArn: targetGroupArn,
            HealthCheckPath: '/health',
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.getOrCreateTargetGroup({
        ...defaultParams,
        routingPathHealthCheck: '/health',
      })
      expect(mockSdkClient.send).toHaveBeenCalledTimes(2)
    })

    it('should delete target group', async () => {
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test'
      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeTargetGroupsCommand) {
          expect(command.input).toEqual({
            Names: ['test-api-ip'],
            NextToken: undefined,
          })
          return {
            TargetGroups: [
              {
                TargetGroupArn: targetGroupArn,
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof DeleteTargetGroupCommand) {
          expect(command.input).toEqual({
            TargetGroupArn: targetGroupArn,
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.deleteTargetGroup({
        resourceNameBase: 'test',
        serviceName: 'api',
        type: 'ip',
      })
      expect(mockSdkClient.send).toHaveBeenCalledTimes(2)
    })

    it('should handle case when target group does not exist during deletion', async () => {
      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeTargetGroupsCommand) {
          expect(command.input).toEqual({
            Names: ['test-api-ip'],
            NextToken: undefined,
          })
          return {
            TargetGroups: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsAlbClient.deleteTargetGroup({
          resourceNameBase: 'test',
          serviceName: 'api',
          type: 'ip',
        }),
      ).resolves.not.toThrow()
    })

    it('should get target group health', async () => {
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test'
      const healthDescription = {
        Target: {
          Id: 'i-1234567890',
          Port: 80,
        },
        TargetHealth: {
          State: 'healthy',
          Description: 'Target is healthy',
        },
      }

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeTargetHealthCommand) {
          expect(command.input).toEqual({
            TargetGroupArn: targetGroupArn,
          })
          return {
            TargetHealthDescriptions: [healthDescription],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.getTargetGroupHealth({ targetGroupArn })
      expect(result).toEqual(healthDescription)
    })
  })

  describe('listener management', () => {
    const defaultListenerParams = {
      albArn: 'arn:aws:elasticloadbalancing:region:account:loadbalancer/test',
      port: 80,
    }

    it('should create new HTTP listener when none exists', async () => {
      const listenerArn =
        'arn:aws:elasticloadbalancing:region:account:listener/test'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeListenersCommand) {
          expect(command.input).toEqual({
            LoadBalancerArn: defaultListenerParams.albArn,
          })
          return {
            Listeners: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof CreateListenerCommand) {
          expect(command.input).toEqual({
            LoadBalancerArn: defaultListenerParams.albArn,
            Protocol: 'HTTP',
            Port: 80,
            DefaultActions: [
              {
                Type: 'fixed-response',
                FixedResponseConfig: {
                  StatusCode: '200',
                  ContentType: 'text/plain',
                  MessageBody: 'The request was successful.',
                },
              },
            ],
          })
          return {
            Listeners: [
              {
                ListenerArn: listenerArn,
                LoadBalancerArn: defaultListenerParams.albArn,
                Port: 80,
                Protocol: 'HTTP',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.getOrCreateListener(
        defaultListenerParams,
      )
      expect(result).toBe(listenerArn)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(2)
    })

    it('should create new HTTPS listener with certificate', async () => {
      const listenerArn =
        'arn:aws:elasticloadbalancing:region:account:listener/test'
      const certificateArn = 'arn:aws:acm:region:account:certificate/test'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeListenersCommand) {
          expect(command.input).toEqual({
            LoadBalancerArn: defaultListenerParams.albArn,
          })
          return {
            Listeners: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof CreateListenerCommand) {
          expect(command.input).toEqual({
            LoadBalancerArn: defaultListenerParams.albArn,
            Protocol: 'HTTPS',
            Port: 443,
            Certificates: [
              {
                CertificateArn: certificateArn,
              },
            ],
            DefaultActions: [
              {
                Type: 'fixed-response',
                FixedResponseConfig: {
                  StatusCode: '200',
                  ContentType: 'text/plain',
                  MessageBody: 'The request was successful.',
                },
              },
            ],
          })
          return {
            Listeners: [
              {
                ListenerArn: listenerArn,
                LoadBalancerArn: defaultListenerParams.albArn,
                Port: 443,
                Protocol: 'HTTPS',
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.getOrCreateListener({
        ...defaultListenerParams,
        port: 443,
        certificateArn,
      })
      expect(result).toBe(listenerArn)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(2)
    })

    it('should add certificate to existing listener', async () => {
      const listenerArn =
        'arn:aws:elasticloadbalancing:region:account:listener/test'
      const certificateArn = 'arn:aws:acm:region:account:certificate/test'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeListenersCommand) {
          expect(command.input).toEqual({
            LoadBalancerArn: defaultListenerParams.albArn,
          })
          return {
            Listeners: [
              {
                ListenerArn: listenerArn,
                LoadBalancerArn: defaultListenerParams.albArn,
                Port: 443,
                Protocol: 'HTTPS',
                Certificates: [],
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof AddListenerCertificatesCommand) {
          expect(command.input).toEqual({
            ListenerArn: listenerArn,
            Certificates: [
              {
                CertificateArn: certificateArn,
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.getOrCreateListener({
        ...defaultListenerParams,
        port: 443,
        certificateArn,
      })
      expect(result).toBe(listenerArn)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(2)
    })
  })

  describe('listener rule management', () => {
    const defaultRuleParams = {
      listenerArn: 'arn:aws:elasticloadbalancing:region:account:listener/test',
      path: '/api/*',
      priority: 100,
      hostHeader: 'api.example.com',
    }

    it('should create HTTP to HTTPS redirect rule', async () => {
      const ruleArn =
        'arn:aws:elasticloadbalancing:region:account:listener-rule/test'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeRulesCommand) {
          expect(command.input).toEqual({
            ListenerArn: defaultRuleParams.listenerArn,
          })
          return {
            Rules: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof CreateRuleCommand) {
          expect(command.input).toEqual({
            ListenerArn: defaultRuleParams.listenerArn,
            Priority: defaultRuleParams.priority,
            Conditions: [
              {
                Field: 'path-pattern',
                Values: [defaultRuleParams.path],
              },
              {
                Field: 'host-header',
                Values: [
                  defaultRuleParams.hostHeader,
                  `*.${defaultRuleParams.hostHeader}`,
                ],
              },
            ],
            Actions: [
              {
                Type: 'redirect',
                RedirectConfig: {
                  Protocol: 'HTTPS',
                  Port: '443',
                  StatusCode: 'HTTP_301',
                },
              },
            ],
          })
          return {
            Rules: [
              {
                RuleArn: ruleArn,
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.addHttpToHttpsListenerRule(defaultRuleParams)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(3) // Describe, Create, Describe (for duplicate check)
    })

    it('should update existing rule with new priority', async () => {
      const ruleArn =
        'arn:aws:elasticloadbalancing:region:account:listener-rule/test'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeRulesCommand) {
          expect(command.input).toEqual({
            ListenerArn: defaultRuleParams.listenerArn,
          })
          return {
            Rules: [
              {
                RuleArn: ruleArn,
                Priority: '50',
                Conditions: [
                  {
                    Field: 'path-pattern',
                    Values: [defaultRuleParams.path],
                  },
                  {
                    Field: 'host-header',
                    Values: [
                      defaultRuleParams.hostHeader,
                      `*.${defaultRuleParams.hostHeader}`,
                    ],
                  },
                ],
                Actions: [
                  {
                    Type: 'redirect',
                    RedirectConfig: {
                      Protocol: 'HTTPS',
                      Port: '443',
                      StatusCode: 'HTTP_301',
                    },
                  },
                ],
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof ModifyRuleCommand) {
          expect(command.input).toEqual({
            RuleArn: ruleArn,
            Conditions: [
              {
                Field: 'path-pattern',
                Values: [defaultRuleParams.path],
              },
              {
                Field: 'host-header',
                Values: [
                  defaultRuleParams.hostHeader,
                  `*.${defaultRuleParams.hostHeader}`,
                ],
              },
            ],
            Actions: [
              {
                Type: 'redirect',
                RedirectConfig: {
                  Protocol: 'HTTPS',
                  Port: '443',
                  StatusCode: 'HTTP_301',
                },
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof SetRulePrioritiesCommand) {
          expect(command.input).toEqual({
            RulePriorities: [
              {
                RuleArn: ruleArn,
                Priority: defaultRuleParams.priority,
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.addHttpToHttpsListenerRule(defaultRuleParams)
      expect(mockSdkClient.send).toHaveBeenCalledTimes(4) // Describe, Modify, SetPriority, Describe (for duplicate check)
    })
  })

  describe('ALB management', () => {
    it('should get existing ALB', async () => {
      const albArn =
        'arn:aws:elasticloadbalancing:region:account:loadbalancer/test'
      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeLoadBalancersCommand) {
          expect(command.input).toEqual({
            Names: ['alb-test-alb'],
          })
          return {
            LoadBalancers: [
              {
                LoadBalancerArn: albArn,
                State: { Code: 'active' },
                DNSName: 'test-alb.amazonaws.com',
                VpcId: 'vpc-12345',
                AvailabilityZones: [
                  {
                    SubnetId: 'subnet-12345',
                    ZoneName: 'us-east-1a',
                  },
                ],
                SecurityGroups: ['sg-12345'],
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.getAlbIfExists('test-alb')
      expect(result).toEqual({
        LoadBalancerArn: albArn,
        State: { Code: 'active' },
        DNSName: 'test-alb.amazonaws.com',
        VpcId: 'vpc-12345',
        AvailabilityZones: [
          {
            SubnetId: 'subnet-12345',
            ZoneName: 'us-east-1a',
          },
        ],
        SecurityGroups: ['sg-12345'],
      })
    })

    it('should delete ALB and its listeners', async () => {
      const albArn =
        'arn:aws:elasticloadbalancing:region:account:loadbalancer/test'
      const listenerArn =
        'arn:aws:elasticloadbalancing:region:account:listener/test'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeLoadBalancersCommand) {
          return {
            LoadBalancers: [
              {
                LoadBalancerArn: albArn,
                State: { Code: 'active' },
                DNSName: 'test-alb.amazonaws.com',
                VpcId: 'vpc-12345',
                AvailabilityZones: [
                  {
                    SubnetId: 'subnet-12345',
                    ZoneName: 'us-east-1a',
                  },
                ],
                SecurityGroups: ['sg-12345'],
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof DescribeListenersCommand) {
          return {
            Listeners: [
              {
                ListenerArn: listenerArn,
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof DeleteListenerCommand) {
          expect(command.input).toEqual({
            ListenerArn: listenerArn,
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof DeleteLoadBalancerCommand) {
          expect(command.input).toEqual({
            LoadBalancerArn: albArn,
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.deleteAlb('test-alb')
      expect(mockSdkClient.send).toHaveBeenCalledTimes(4)
    })
  })

  describe('lambda target registration', () => {
    it('should register lambda target', async () => {
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test'
      const functionArn = 'arn:aws:lambda:region:account:function:test'

      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof RegisterTargetsCommand) {
          expect(command.input).toEqual({
            TargetGroupArn: targetGroupArn,
            Targets: [
              {
                Id: functionArn,
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      const result = await awsAlbClient.ensureLambdaTargetRegistered({
        targetGroupArn,
        functionArn,
      })
      expect(result).toBe(true)
    })
  })

  describe('complex routing', () => {
    it('should create target group listener rule with forward action', async () => {
      const listenerArn =
        'arn:aws:elasticloadbalancing:region:account:listener/test'
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test'
      const ruleArn =
        'arn:aws:elasticloadbalancing:region:account:listener-rule/test'

      let callCount = 0
      mockSdkClient.send.mockImplementation(async (command) => {
        callCount++
        if (command instanceof DescribeRulesCommand) {
          if (callCount === 1) {
            return {
              Rules: [],
              $metadata: { httpStatusCode: 200 },
            }
          }
          return {
            Rules: [
              {
                RuleArn: ruleArn,
                Priority: '100',
                Conditions: [
                  {
                    Field: 'path-pattern',
                    Values: ['/api/*'],
                  },
                  {
                    Field: 'host-header',
                    Values: ['api.example.com'],
                  },
                ],
                Actions: [
                  {
                    Type: 'forward',
                    ForwardConfig: {
                      TargetGroups: [
                        {
                          TargetGroupArn: targetGroupArn,
                          Weight: 1,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof CreateRuleCommand) {
          expect(command.input).toEqual({
            ListenerArn: listenerArn,
            Priority: 100,
            Conditions: [
              {
                Field: 'path-pattern',
                Values: ['/api/*'],
              },
              {
                Field: 'host-header',
                Values: ['api.example.com'],
              },
            ],
            Actions: [
              {
                Type: 'forward',
                ForwardConfig: {
                  TargetGroups: [
                    {
                      TargetGroupArn: targetGroupArn,
                      Weight: 1,
                    },
                  ],
                },
              },
            ],
          })
          return {
            Rules: [
              {
                RuleArn: ruleArn,
                Priority: '100',
                Conditions: [
                  {
                    Field: 'path-pattern',
                    Values: ['/api/*'],
                  },
                  {
                    Field: 'host-header',
                    Values: ['api.example.com'],
                  },
                ],
                Actions: [
                  {
                    Type: 'forward',
                    ForwardConfig: {
                      TargetGroups: [
                        {
                          TargetGroupArn: targetGroupArn,
                          Weight: 1,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof ModifyRuleCommand) {
          expect(command.input).toEqual({
            RuleArn: ruleArn,
            Conditions: [
              {
                Field: 'path-pattern',
                Values: ['/api/*'],
              },
              {
                Field: 'host-header',
                Values: ['api.example.com'],
              },
            ],
            Actions: [
              {
                Type: 'forward',
                ForwardConfig: {
                  TargetGroups: [
                    {
                      TargetGroupArn: targetGroupArn,
                      Weight: 1,
                    },
                  ],
                },
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof SetRulePrioritiesCommand) {
          expect(command.input).toEqual({
            RulePriorities: [
              {
                RuleArn: ruleArn,
                Priority: 100,
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.createOrUpdateTargetGroupListenerRule({
        listenerArn,
        targetGroupArn,
        pathPattern: '/api/*',
        hostHeader: 'api.example.com',
      })
      expect(mockSdkClient.send).toHaveBeenCalledTimes(5)
    })

    it('should handle duplicate rule cleanup', async () => {
      const listenerArn =
        'arn:aws:elasticloadbalancing:region:account:listener/test'
      const ruleArn1 =
        'arn:aws:elasticloadbalancing:region:account:listener-rule/test1'
      const ruleArn2 =
        'arn:aws:elasticloadbalancing:region:account:listener-rule/test2'
      const targetGroupArn =
        'arn:aws:elasticloadbalancing:region:account:targetgroup/test1'

      let callCount = 0
      mockSdkClient.send.mockImplementation(async (command) => {
        callCount++
        if (command instanceof DescribeRulesCommand) {
          if (callCount === 1) {
            return {
              Rules: [
                {
                  RuleArn: ruleArn1,
                  Priority: '100',
                  Conditions: [
                    {
                      Field: 'path-pattern',
                      Values: ['/api/*'],
                    },
                    {
                      Field: 'host-header',
                      Values: ['api.example.com'],
                    },
                  ],
                  Actions: [
                    {
                      Type: 'forward',
                      ForwardConfig: {
                        TargetGroups: [
                          {
                            TargetGroupArn: targetGroupArn,
                            Weight: 1,
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  RuleArn: ruleArn2,
                  Priority: '200',
                  Conditions: [
                    {
                      Field: 'path-pattern',
                      Values: ['/api/*'],
                    },
                    {
                      Field: 'host-header',
                      Values: ['api.example.com'],
                    },
                  ],
                  Actions: [
                    {
                      Type: 'forward',
                      ForwardConfig: {
                        TargetGroups: [
                          {
                            TargetGroupArn: targetGroupArn,
                            Weight: 1,
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
              $metadata: { httpStatusCode: 200 },
            }
          }
          return {
            Rules: [
              {
                RuleArn: ruleArn1,
                Priority: '100',
                Conditions: [
                  {
                    Field: 'path-pattern',
                    Values: ['/api/*'],
                  },
                  {
                    Field: 'host-header',
                    Values: ['api.example.com'],
                  },
                ],
                Actions: [
                  {
                    Type: 'forward',
                    ForwardConfig: {
                      TargetGroups: [
                        {
                          TargetGroupArn: targetGroupArn,
                          Weight: 1,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof ModifyRuleCommand) {
          expect(command.input).toEqual({
            RuleArn: ruleArn1,
            Conditions: [
              {
                Field: 'path-pattern',
                Values: ['/api/*'],
              },
              {
                Field: 'host-header',
                Values: ['api.example.com'],
              },
            ],
            Actions: [
              {
                Type: 'forward',
                ForwardConfig: {
                  TargetGroups: [
                    {
                      TargetGroupArn: targetGroupArn,
                      Weight: 1,
                    },
                  ],
                },
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof DeleteRuleCommand) {
          expect(command.input.RuleArn).toBe(ruleArn2)
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        if (command instanceof SetRulePrioritiesCommand) {
          expect(command.input).toEqual({
            RulePriorities: [
              {
                RuleArn: ruleArn1,
                Priority: 100,
              },
            ],
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.createOrUpdateTargetGroupListenerRule({
        listenerArn,
        targetGroupArn,
        pathPattern: '/api/*',
        hostHeader: 'api.example.com',
      })
      expect(mockSdkClient.send).toHaveBeenCalledTimes(5)
    })
  })

  describe('error handling', () => {
    it('should throw ServerlessError when target group creation fails', async () => {
      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeTargetGroupsCommand) {
          throw new Error('Target group not found')
        }
        if (command instanceof CreateTargetGroupCommand) {
          return {
            TargetGroups: [{}], // Empty target group without ARN
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      let error
      try {
        await awsAlbClient.getOrCreateTargetGroup({
          resourceNameBase: 'test',
          serviceName: 'api',
          type: 'ip',
        })
      } catch (e) {
        error = e
      }

      expect(error).toBeDefined()
      expect(error).toBeInstanceOf(ServerlessError)
      expect(error.code).toBe('AWS_ALB_FAILED_TO_CREATE_TARGET_GROUP')
      expect(error.message).toBe('Failed to create target group')
    })

    it('should handle LoadBalancerNotFoundException', async () => {
      mockSdkClient.send.mockRejectedValue(
        new LoadBalancerNotFoundException({
          message: 'Load balancer not found',
          $metadata: {},
        }),
      )

      await expect(
        awsAlbClient.getOrCreateListener({
          albArn: 'non-existent-alb',
          port: 80,
        }),
      ).rejects.toThrow(LoadBalancerNotFoundException)
    })

    it('should handle ResourceNotFoundException for rule deletion', async () => {
      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeRulesCommand) {
          return {
            Rules: [],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new ResourceNotFoundException({
          message: 'Rule not found',
          $metadata: {},
        })
      })

      await expect(
        awsAlbClient.deleteRule({
          listenerArn: 'listener-arn',
          targetGroupArn: 'target-group-arn',
          path: '/api/*',
          hostHeader: 'api.example.com',
        }),
      ).resolves.not.toThrow()
    })

    it('should throw ServerlessError when rule priority exceeds maximum', async () => {
      const ruleArn =
        'arn:aws:elasticloadbalancing:region:account:listener-rule/test'
      mockSdkClient.send.mockImplementation(async (command) => {
        if (command instanceof DescribeRulesCommand) {
          return {
            Rules: [
              {
                RuleArn: ruleArn,
                Priority: '50000', // Maximum allowed priority
              },
            ],
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await expect(
        awsAlbClient.shiftPriorities({
          rules: [{ RuleArn: ruleArn, Priority: '50000' }],
          desiredPriority: 49900,
        }),
      ).rejects.toThrow('Exceeded maximum rule priority limit')
    })
  })

  describe('WAF integration', () => {
    it('should associate WAF ACL with ALB', async () => {
      const albArn =
        'arn:aws:elasticloadbalancing:region:account:loadbalancer/test'
      const wafAclArn = 'arn:aws:wafv2:region:account:global/webacl/test'

      mockWafClient.send.mockImplementation(async (command) => {
        if (command instanceof AssociateWebACLCommand) {
          expect(command.input).toEqual({
            ResourceArn: albArn,
            WebACLArn: wafAclArn,
          })
          return {
            $metadata: { httpStatusCode: 200 },
          }
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`)
      })

      await awsAlbClient.associateWafToAlb({ albArn, wafAclArn })
      expect(mockWafClient.send).toHaveBeenCalledTimes(1)
    })

    it('should handle errors when associating WAF ACL with ALB', async () => {
      const albArn =
        'arn:aws:elasticloadbalancing:region:account:loadbalancer/test'
      const wafAclArn = 'arn:aws:wafv2:region:account:global/webacl/test'

      mockWafClient.send.mockRejectedValue(new Error('WAF association failed'))

      await expect(
        awsAlbClient.associateWafToAlb({ albArn, wafAclArn }),
      ).rejects.toThrow('WAF association failed')
    })

    it('should throw ServerlessError when WAF ACL ARN is invalid', async () => {
      const albArn =
        'arn:aws:elasticloadbalancing:region:account:loadbalancer/test'
      const wafAclArn = 'invalid-arn'

      await expect(
        awsAlbClient.associateWafToAlb({ albArn, wafAclArn }),
      ).rejects.toThrow(
        new ServerlessError(
          'Invalid WAF ACL ARN format',
          'AWS_WAF_INVALID_ACL_ARN',
          { stack: false },
        ),
      )
      expect(mockWafClient.send).not.toHaveBeenCalled()
    })

    it('should throw ServerlessError when ALB ARN is invalid', async () => {
      const albArn = 'invalid-arn'
      const wafAclArn = 'arn:aws:wafv2:region:account:global/webacl/test'

      await expect(
        awsAlbClient.associateWafToAlb({ albArn, wafAclArn }),
      ).rejects.toThrow(
        new ServerlessError(
          'Invalid ALB ARN format',
          'AWS_WAF_INVALID_ALB_ARN',
          { stack: false },
        ),
      )
      expect(mockWafClient.send).not.toHaveBeenCalled()
    })
  })
})
