'use strict'

import { getResourceName } from '../utils/naming.js'

/**
 * Generate IAM role for AgentCore Runtime
 *
 * @param {string} name - Agent name
 * @param {object} config - Agent configuration
 * @param {object} context - Deployment context
 * @param {object} options - Additional options
 * @param {string|object} options.memoryResourceRef - Memory resource reference (CFN Ref or ARN)
 * @param {string|object} options.gatewayResourceRef - Gateway resource reference (CFN Ref or ARN)
 */
export function generateRuntimeRole(name, config, context, options = {}) {
  const { serviceName, stage } = context
  const { memoryResourceRef, gatewayResourceRef } = options
  const roleName = getResourceName(serviceName, `${name}-runtime-role`, stage)

  const assumeRolePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'bedrock-agentcore.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:SourceAccount': { Ref: 'AWS::AccountId' },
          },
        },
      },
    ],
  }

  const policies = [
    {
      PolicyName: `${roleName}-base-policy`,
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          // CloudWatch Logs - per AWS docs: runtime needs describe + create + put
          {
            Effect: 'Allow',
            Action: ['logs:DescribeLogGroups'],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:*',
            },
          },
          {
            Effect: 'Allow',
            Action: ['logs:DescribeLogStreams', 'logs:CreateLogGroup'],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/runtimes/*',
            },
          },
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*',
            },
          },
          // ECR permissions for container images
          ...(config.artifact?.containerImage
            ? [
                {
                  Sid: 'ECRTokenAccess',
                  Effect: 'Allow',
                  Action: ['ecr:GetAuthorizationToken'],
                  Resource: '*',
                },
                {
                  Sid: 'ECRImageAccess',
                  Effect: 'Allow',
                  Action: [
                    'ecr:BatchCheckLayerAvailability',
                    'ecr:GetDownloadUrlForLayer',
                    'ecr:BatchGetImage',
                  ],
                  Resource: {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/*',
                  },
                },
              ]
            : []),
          // S3 permissions for S3-based artifact
          ...(config.artifact?.s3
            ? [
                {
                  Effect: 'Allow',
                  Action: ['s3:GetObject', 's3:GetObjectVersion'],
                  Resource: {
                    'Fn::Sub': `arn:\${AWS::Partition}:s3:::${config.artifact.s3.bucket}/${config.artifact.s3.key}`,
                  },
                },
              ]
            : []),
          // Bedrock model invocation
          {
            Sid: 'BedrockModelInvocation',
            Effect: 'Allow',
            Action: [
              'bedrock:InvokeModel',
              'bedrock:InvokeModelWithResponseStream',
              'bedrock:GetInferenceProfile',
            ],
            Resource: [
              {
                'Fn::Sub':
                  'arn:${AWS::Partition}:bedrock:*::foundation-model/*',
              },
              {
                'Fn::Sub':
                  'arn:${AWS::Partition}:bedrock:*:*:inference-profile/*',
              },
              {
                'Fn::Sub':
                  'arn:${AWS::Partition}:bedrock:*:*:provisioned-model/*',
              },
            ],
          },
          // Marketplace subscriptions - required for marketplace models
          {
            Sid: 'MarketplaceSubscriptions',
            Effect: 'Allow',
            Action: [
              'aws-marketplace:ViewSubscriptions',
              'aws-marketplace:Subscribe',
            ],
            Resource: '*',
          },
          // X-Ray tracing (recommended by AWS for observability)
          {
            Sid: 'XRayTracing',
            Effect: 'Allow',
            Action: [
              'xray:PutTraceSegments',
              'xray:PutTelemetryRecords',
              'xray:GetSamplingRules',
              'xray:GetSamplingTargets',
            ],
            Resource: '*',
          },
          // CloudWatch metrics (recommended by AWS for observability)
          {
            Sid: 'CloudWatchMetrics',
            Effect: 'Allow',
            Action: ['cloudwatch:PutMetricData'],
            Resource: '*',
            Condition: {
              StringEquals: {
                'cloudwatch:namespace': 'bedrock-agentcore',
              },
            },
          },
          // Memory permissions - when agent has memory configured
          // Required for reading conversation history (ListEvents) and saving messages (CreateEvent)
          ...(memoryResourceRef
            ? [
                {
                  Sid: 'MemoryAccess',
                  Effect: 'Allow',
                  Action: [
                    'bedrock-agentcore:ListEvents',
                    'bedrock-agentcore:CreateEvent',
                    'bedrock-agentcore:GetMemory',
                  ],
                  Resource:
                    typeof memoryResourceRef === 'string'
                      ? memoryResourceRef
                      : {
                          'Fn::Sub': [
                            'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:memory/${MemoryId}',
                            { MemoryId: memoryResourceRef },
                          ],
                        },
                },
              ]
            : []),
          // Gateway permissions - when agent has tools configured via Gateway
          // Required for invoking Gateway MCP endpoint
          ...(gatewayResourceRef
            ? [
                {
                  Sid: 'GatewayAccess',
                  Effect: 'Allow',
                  Action: ['bedrock-agentcore:InvokeGateway'],
                  Resource:
                    typeof gatewayResourceRef === 'string'
                      ? gatewayResourceRef
                      : {
                          'Fn::Sub': [
                            'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:gateway/${GatewayId}',
                            { GatewayId: gatewayResourceRef },
                          ],
                        },
                },
              ]
            : []),
          // Browser permissions - for use_bedrock_browser tool (strands-agents-tools)
          // Allows agents to use the AWS-managed default browser for web browsing/search
          {
            Sid: 'BrowserAccess',
            Effect: 'Allow',
            Action: [
              'bedrock-agentcore:CreateBrowser',
              'bedrock-agentcore:ListBrowsers',
              'bedrock-agentcore:GetBrowser',
              'bedrock-agentcore:DeleteBrowser',
              'bedrock-agentcore:StartBrowserSession',
              'bedrock-agentcore:ListBrowserSessions',
              'bedrock-agentcore:GetBrowserSession',
              'bedrock-agentcore:StopBrowserSession',
              'bedrock-agentcore:UpdateBrowserStream',
              'bedrock-agentcore:ConnectBrowserAutomationStream',
              'bedrock-agentcore:ConnectBrowserLiveViewStream',
              'bedrock-agentcore:InvokeBrowser',
            ],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:aws:browser/*',
            },
          },
          // Code Interpreter permissions - for use_bedrock_code_interpreter tool (strands-agents-tools)
          // Allows agents to use the AWS-managed default code interpreter for Python execution
          {
            Sid: 'CodeInterpreterAccess',
            Effect: 'Allow',
            Action: [
              'bedrock-agentcore:CreateCodeInterpreter',
              'bedrock-agentcore:StartCodeInterpreterSession',
              'bedrock-agentcore:InvokeCodeInterpreter',
              'bedrock-agentcore:StopCodeInterpreterSession',
              'bedrock-agentcore:DeleteCodeInterpreter',
              'bedrock-agentcore:ListCodeInterpreters',
              'bedrock-agentcore:GetCodeInterpreter',
              'bedrock-agentcore:GetCodeInterpreterSession',
              'bedrock-agentcore:ListCodeInterpreterSessions',
            ],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:aws:code-interpreter/*',
            },
          },
        ],
      },
    },
  ]

  // VPC permissions - only when networkMode is VPC
  if (config.network?.networkMode === 'VPC') {
    policies[0].PolicyDocument.Statement.push({
      Sid: 'VPCNetworkInterfaces',
      Effect: 'Allow',
      Action: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface',
        'ec2:AssignPrivateIpAddresses',
        'ec2:UnassignPrivateIpAddresses',
      ],
      Resource: '*',
    })
  }

  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
      Tags: [
        { Key: 'serverless:service', Value: serviceName },
        { Key: 'serverless:stage', Value: stage },
        { Key: 'agentcore:resource', Value: name },
        { Key: 'agentcore:type', Value: 'runtime-role' },
      ],
    },
  }
}

/**
 * Generate IAM role for AgentCore Memory
 */
export function generateMemoryRole(name, config, context) {
  const { serviceName, stage } = context
  const roleName = getResourceName(serviceName, `${name}-memory-role`, stage)

  const assumeRolePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'bedrock-agentcore.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:SourceAccount': { Ref: 'AWS::AccountId' },
          },
        },
      },
    ],
  }

  const policies = [
    {
      PolicyName: `${roleName}-base-policy`,
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          // CloudWatch Logs - Memory needs logging for processing
          {
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/*',
            },
          },
          // Bedrock model invocation - required for memory strategies (extraction, consolidation)
          {
            Sid: 'BedrockModelInvocation',
            Effect: 'Allow',
            Action: [
              'bedrock:InvokeModel',
              'bedrock:InvokeModelWithResponseStream',
            ],
            Resource: {
              'Fn::Sub': 'arn:${AWS::Partition}:bedrock:*::foundation-model/*',
            },
          },
          // Bedrock inference profiles for cross-region inference
          {
            Sid: 'BedrockInferenceProfiles',
            Effect: 'Allow',
            Action: [
              'bedrock:InvokeModel',
              'bedrock:InvokeModelWithResponseStream',
              'bedrock:GetInferenceProfile',
            ],
            Resource: [
              'arn:aws:bedrock:*:*:inference-profile/us.*',
              'arn:aws:bedrock:*:*:inference-profile/eu.*',
              'arn:aws:bedrock:*:*:inference-profile/global.*',
            ],
          },
          // KMS permissions - only when encryptionKey is specified
          ...(config.encryptionKey
            ? [
                {
                  Sid: 'KMSAccess',
                  Effect: 'Allow',
                  Action: [
                    'kms:Decrypt',
                    'kms:Encrypt',
                    'kms:GenerateDataKey',
                    'kms:DescribeKey',
                  ],
                  Resource: config.encryptionKey,
                },
              ]
            : []),
        ],
      },
    },
  ]

  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
      Tags: [
        { Key: 'serverless:service', Value: serviceName },
        { Key: 'serverless:stage', Value: stage },
        { Key: 'agentcore:resource', Value: name },
        { Key: 'agentcore:type', Value: 'memory-role' },
      ],
    },
  }
}

/**
 * Generate IAM role for AgentCore Gateway
 */
export function generateGatewayRole(name, config, context) {
  const { serviceName, stage } = context
  const roleName = getResourceName(serviceName, `${name}-gateway-role`, stage)

  const assumeRolePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'bedrock-agentcore.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:SourceAccount': { Ref: 'AWS::AccountId' },
          },
        },
      },
    ],
  }

  // Collect Lambda function ARNs from tools if available
  // This allows for more restrictive permissions when tool functions are known
  const lambdaFunctionArns = config.lambdaFunctionArns || []

  const policies = [
    {
      PolicyName: `${roleName}-base-policy`,
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          // CloudWatch Logs
          {
            Sid: 'CloudWatchLogs',
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/*',
            },
          },
          // Lambda invoke permissions for tool functions
          // Per AWS docs: Gateway needs lambda:InvokeFunction for Lambda targets
          // We scope to specific functions when known, otherwise grant account-wide access
          {
            Sid: 'LambdaInvoke',
            Effect: 'Allow',
            Action: ['lambda:InvokeFunction'],
            Resource:
              lambdaFunctionArns.length > 0
                ? lambdaFunctionArns
                : {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:*',
                  },
          },
          // KMS permissions - only when kmsKeyArn is specified
          ...(config.kmsKeyArn
            ? [
                {
                  Sid: 'KMSAccess',
                  Effect: 'Allow',
                  Action: [
                    'kms:Decrypt',
                    'kms:Encrypt',
                    'kms:GenerateDataKey',
                    'kms:DescribeKey',
                  ],
                  Resource: config.kmsKeyArn,
                },
              ]
            : []),
        ],
      },
    },
  ]

  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
      Tags: [
        { Key: 'serverless:service', Value: serviceName },
        { Key: 'serverless:stage', Value: stage },
        { Key: 'agentcore:resource', Value: name },
        { Key: 'agentcore:type', Value: 'gateway-role' },
      ],
    },
  }
}

/**
 * Generate IAM role for AgentCore BrowserCustom
 */
export function generateBrowserRole(name, config, context) {
  const { serviceName, stage } = context
  const roleName = getResourceName(serviceName, `${name}-browser-role`, stage)

  const assumeRolePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'bedrock-agentcore.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:SourceAccount': { Ref: 'AWS::AccountId' },
          },
        },
      },
    ],
  }

  const policies = [
    {
      PolicyName: `${roleName}-policy`,
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          // CloudWatch Logs
          {
            Sid: 'CloudWatchLogs',
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/*',
            },
          },
          // S3 permissions for recording - scoped to specific bucket/prefix
          ...(config.recording?.s3Location
            ? [
                {
                  Sid: 'S3Recording',
                  Effect: 'Allow',
                  Action: ['s3:PutObject', 's3:GetObject'],
                  Resource: {
                    'Fn::Sub': `arn:\${AWS::Partition}:s3:::${config.recording.s3Location.bucket}/${config.recording.s3Location.prefix || ''}*`,
                  },
                },
              ]
            : []),
          // VPC network interfaces - only when networkMode is VPC
          ...(config.network?.networkMode === 'VPC'
            ? [
                {
                  Sid: 'VPCNetworkInterfaces',
                  Effect: 'Allow',
                  Action: [
                    'ec2:CreateNetworkInterface',
                    'ec2:DescribeNetworkInterfaces',
                    'ec2:DeleteNetworkInterface',
                    'ec2:AssignPrivateIpAddresses',
                    'ec2:UnassignPrivateIpAddresses',
                  ],
                  Resource: '*',
                },
              ]
            : []),
        ],
      },
    },
  ]

  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
      Tags: [
        { Key: 'serverless:service', Value: serviceName },
        { Key: 'serverless:stage', Value: stage },
        { Key: 'agentcore:resource', Value: name },
        { Key: 'agentcore:type', Value: 'browser-role' },
      ],
    },
  }
}

/**
 * Generate IAM role for AgentCore CodeInterpreterCustom
 */
export function generateCodeInterpreterRole(name, config, context) {
  const { serviceName, stage } = context
  const roleName = getResourceName(serviceName, `${name}-ci-role`, stage)

  const assumeRolePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'bedrock-agentcore.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:SourceAccount': { Ref: 'AWS::AccountId' },
          },
        },
      },
    ],
  }

  const policies = [
    {
      PolicyName: `${roleName}-policy`,
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          // CloudWatch Logs
          {
            Sid: 'CloudWatchLogs',
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            Resource: {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/*',
            },
          },
          // VPC network interfaces - only when networkMode is VPC
          ...(config.network?.networkMode === 'VPC'
            ? [
                {
                  Sid: 'VPCNetworkInterfaces',
                  Effect: 'Allow',
                  Action: [
                    'ec2:CreateNetworkInterface',
                    'ec2:DescribeNetworkInterfaces',
                    'ec2:DeleteNetworkInterface',
                    'ec2:AssignPrivateIpAddresses',
                    'ec2:UnassignPrivateIpAddresses',
                  ],
                  Resource: '*',
                },
              ]
            : []),
        ],
      },
    },
  ]

  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
      Tags: [
        { Key: 'serverless:service', Value: serviceName },
        { Key: 'serverless:stage', Value: stage },
        { Key: 'agentcore:resource', Value: name },
        { Key: 'agentcore:type', Value: 'codeinterpreter-role' },
      ],
    },
  }
}
