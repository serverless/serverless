'use strict'

import { getResourceName } from '../utils/naming.js'

/**
 * Parse an ECR image URI and return a scoped repository ARN using CloudFormation intrinsics.
 * Falls back to a wildcard repository ARN if the URI is not a valid ECR image URI.
 *
 * ECR URI format: {account_id}.dkr.ecr.{region}.amazonaws.com/{repository_name}:{tag}
 * ECR URI format: {account_id}.dkr.ecr.{region}.amazonaws.com/{repository_name}@{digest}
 *
 * @param {string} imageUri - ECR image URI
 * @returns {object} CloudFormation Fn::Sub resource ARN scoped to the specific repository,
 *   or wildcard repository ARN if parsing fails
 */
export function resolveEcrRepositoryArn(imageUri) {
  const wildcardArn = {
    'Fn::Sub':
      'arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/*',
  }

  if (typeof imageUri !== 'string') {
    return wildcardArn
  }

  const match = imageUri.match(/^(\d+)\.dkr\.ecr\.([^.]+)\.[^/]+\/([^:@]+)/)

  if (!match) {
    return wildcardArn
  }

  const [, accountId, region, repositoryName] = match

  return {
    'Fn::Sub': [
      'arn:${AWS::Partition}:ecr:${Region}:${AccountId}:repository/${RepositoryName}',
      {
        Region: region,
        AccountId: accountId,
        RepositoryName: repositoryName,
      },
    ],
  }
}

/**
 * Determine if an IAM role should be generated for a resource
 * Returns false if role is explicitly provided (ARN or CloudFormation reference)
 * Returns true if no role specified or role is a customization object
 *
 * @param {object} config - Resource configuration
 * @returns {boolean} True if role should be generated
 */
export function shouldGenerateRole(config) {
  // No role specified - generate with defaults
  if (!config.role) {
    return true
  }

  // Role is a string ARN - don't generate
  if (typeof config.role === 'string') {
    return false
  }

  // Role is an object - check if it's a CF intrinsic or customization
  if (typeof config.role === 'object') {
    // CloudFormation intrinsic functions - don't generate
    if (
      config.role.Ref ||
      config.role['Fn::GetAtt'] ||
      config.role['Fn::ImportValue'] ||
      config.role['Fn::Sub'] ||
      config.role['Fn::Join']
    ) {
      return false
    }
    // Customization object (has statements, managedPolicies, etc.) - generate with customizations
    return true
  }

  // Default: generate
  return true
}

/**
 * Extract role customizations from config
 * Returns customizations if role is an object, otherwise returns empty defaults
 *
 * @param {object} config - Resource configuration
 * @returns {object} Role customizations (name, statements, managedPolicies, permissionsBoundary, tags)
 */
function getRoleCustomizations(config) {
  // If no role or role is a string (ARN), return empty customizations
  if (!config.role || typeof config.role === 'string') {
    return {
      name: null,
      statements: [],
      managedPolicies: [],
      permissionsBoundary: null,
      tags: {},
    }
  }

  // If role is a CloudFormation intrinsic (has Ref, Fn::GetAtt, etc.), return empty
  if (
    config.role.Ref ||
    config.role['Fn::GetAtt'] ||
    config.role['Fn::ImportValue']
  ) {
    return {
      name: null,
      statements: [],
      managedPolicies: [],
      permissionsBoundary: null,
      tags: {},
    }
  }

  // Extract customizations from role object
  return {
    name: config.role.name || null,
    statements: config.role.statements || [],
    managedPolicies: config.role.managedPolicies || [],
    permissionsBoundary: config.role.permissionsBoundary || null,
    tags: config.role.tags || {},
  }
}

/**
 * Merge custom tags with existing tags (CloudFormation format)
 * Converts simple object format { Key: "Value" } to CloudFormation array format
 *
 * @param {Array} existingTags - Existing tags in CloudFormation format
 * @param {object} customTags - Custom tags in simple object format
 * @returns {Array} Merged tags in CloudFormation format
 */
function mergeTags(existingTags, customTags) {
  if (!customTags || !Object.keys(customTags).length) {
    return existingTags
  }

  // Convert custom tags object to CloudFormation array format
  return Object.entries(customTags).map(([Key, Value]) => ({ Key, Value }))
}

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
          ArnLike: {
            'aws:SourceArn': {
              'Fn::Sub':
                'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
            },
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
          ...(config.artifact?.image
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
                  Action: ['ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'],
                  Resource: resolveEcrRepositoryArn(config.artifact.image),
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
                  'arn:${AWS::Partition}:bedrock:*:*:application-inference-profile/*',
              },
              {
                'Fn::Sub':
                  'arn:${AWS::Partition}:bedrock:*:*:provisioned-model/*',
              },
            ],
          },
          // Marketplace subscriptions for auto-enabling third-party models (e.g. Anthropic Claude).
          // These are one-time administrative actions, only needed the first time a marketplace
          // model is used in an account. Once subscribed, only bedrock:InvokeModel is needed.
          // Included here for convenience so agents can auto-enable marketplace models without
          // requiring a separate admin step. Resource-level scoping is not supported.
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
          // Short-term: event-based conversation history within sessions
          // Long-term: extracted insights and records across sessions
          ...(memoryResourceRef
            ? [
                {
                  Sid: 'MemoryAccess',
                  Effect: 'Allow',
                  Action: [
                    // Short-term memory (events/sessions)
                    'bedrock-agentcore:CreateEvent',
                    'bedrock-agentcore:GetEvent',
                    'bedrock-agentcore:ListEvents',
                    'bedrock-agentcore:DeleteEvent',
                    'bedrock-agentcore:ListSessions',
                    'bedrock-agentcore:ListActors',
                    // Long-term memory (extracted records)
                    'bedrock-agentcore:RetrieveMemoryRecords',
                    'bedrock-agentcore:ListMemoryRecords',
                    'bedrock-agentcore:GetMemoryRecord',
                    // Memory resource metadata
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
          // Browser permissions
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

  // VPC network interface management is handled by the service-linked role
  // AWSServiceRoleForBedrockAgentCoreNetwork (BedrockAgentCoreNetworkServiceRolePolicy),
  // which is automatically created when VPC mode is configured.
  // No EC2 permissions are needed on the execution role.

  // Extract role customizations
  const customizations = getRoleCustomizations(config)

  // Merge custom statements into policy
  if (customizations.statements.length > 0) {
    policies[0].PolicyDocument.Statement.push(...customizations.statements)
  }

  // Build base role
  const role = {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: customizations.name || roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
    },
  }

  // Add managed policies if provided
  if (customizations.managedPolicies.length > 0) {
    role.Properties.ManagedPolicyArns = customizations.managedPolicies
  }

  // Add permission boundary if provided
  if (customizations.permissionsBoundary) {
    role.Properties.PermissionsBoundary = customizations.permissionsBoundary
  }

  // Add custom tags if provided
  if (Object.keys(customizations.tags).length > 0) {
    role.Properties.Tags = mergeTags({}, customizations.tags)
  }

  return role
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
          ArnLike: {
            'aws:SourceArn': {
              'Fn::Sub':
                'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
            },
          },
        },
      },
    ],
  }

  // Extract role customizations
  const customizations = getRoleCustomizations(config)

  // Bedrock model invocation permissions for memory strategies (extraction, consolidation)
  // are provided by the AWS managed policy, per official docs:
  // https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/long-term-configuring-custom-strategies.html
  const managedPolicyArn =
    'arn:aws:iam::aws:policy/AmazonBedrockAgentCoreMemoryBedrockModelInferenceExecutionRolePolicy'

  // Build base role
  const role = {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: customizations.name || roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      ManagedPolicyArns: [managedPolicyArn, ...customizations.managedPolicies],
    },
  }

  // Only add inline policy if user provided custom statements
  if (customizations.statements.length > 0) {
    role.Properties.Policies = [
      {
        PolicyName: `${roleName}-custom-policy`,
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: customizations.statements,
        },
      },
    ]
  }

  // Add permission boundary if provided
  if (customizations.permissionsBoundary) {
    role.Properties.PermissionsBoundary = customizations.permissionsBoundary
  }

  // Add custom tags if provided
  if (Object.keys(customizations.tags).length > 0) {
    role.Properties.Tags = mergeTags({}, customizations.tags)
  }

  return role
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
          ArnLike: {
            'aws:SourceArn': {
              'Fn::Sub':
                'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
            },
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
          // KMS permissions - only when kmsKey is specified
          ...(config.kmsKey
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
                  Resource: config.kmsKey,
                },
              ]
            : []),
          // OAuth/Token Vault permissions - only when tools use OAuth or API Key credential providers
          // Per AWS docs: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-outbound-auth.html
          // Gateway needs these to fetch tokens from AgentCore Identity Token Vault
          ...(config.hasCredentialProviders
            ? [
                {
                  Sid: 'WorkloadIdentityAccess',
                  Effect: 'Allow',
                  Action: [
                    'bedrock-agentcore:GetWorkloadAccessTokenForJWT',
                    'bedrock-agentcore:GetWorkloadAccessToken',
                  ],
                  Resource: [
                    {
                      'Fn::Sub':
                        'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/*',
                    },
                    {
                      'Fn::Sub':
                        'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/*/workload-identity/*',
                    },
                  ],
                },
                // Token Vault permissions - for OAuth and API Key credential retrieval
                // These actions are called on both token-vault and workload-identity resources
                {
                  Sid: 'TokenVaultAccess',
                  Effect: 'Allow',
                  Action: [
                    'bedrock-agentcore:GetResourceOauth2Token',
                    'bedrock-agentcore:GetResourceApiKey',
                  ],
                  Resource: [
                    {
                      'Fn::Sub':
                        'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:token-vault/*',
                    },
                    {
                      'Fn::Sub':
                        'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/*',
                    },
                    {
                      'Fn::Sub':
                        'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/*/workload-identity/*',
                    },
                  ],
                },
                // Secrets Manager - credential providers store secrets here
                // Scoped to bedrock-agentcore-identity* prefix used by AgentCore Identity
                {
                  Sid: 'SecretsManagerAccess',
                  Effect: 'Allow',
                  Action: ['secretsmanager:GetSecretValue'],
                  Resource: {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:bedrock-agentcore-identity*',
                  },
                },
              ]
            : []),
        ],
      },
    },
  ]

  // Extract role customizations
  const customizations = getRoleCustomizations(config)

  // Merge custom statements into policy
  if (customizations.statements.length > 0) {
    policies[0].PolicyDocument.Statement.push(...customizations.statements)
  }

  // Build base role
  const role = {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: customizations.name || roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
    },
  }

  // Add managed policies if provided
  if (customizations.managedPolicies.length > 0) {
    role.Properties.ManagedPolicyArns = customizations.managedPolicies
  }

  // Add permission boundary if provided
  if (customizations.permissionsBoundary) {
    role.Properties.PermissionsBoundary = customizations.permissionsBoundary
  }

  // Add custom tags if provided
  if (Object.keys(customizations.tags).length > 0) {
    role.Properties.Tags = mergeTags({}, customizations.tags)
  }

  return role
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
          ArnLike: {
            'aws:SourceArn': {
              'Fn::Sub':
                'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
            },
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
          // S3 permissions for session recording - scoped to specific bucket/prefix
          // Per AWS docs: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-resource-session-management.html
          ...(config.recording?.s3Location
            ? [
                {
                  Sid: 'S3Recording',
                  Effect: 'Allow',
                  Action: [
                    's3:PutObject',
                    's3:ListMultipartUploadParts',
                    's3:AbortMultipartUpload',
                  ],
                  Resource: {
                    'Fn::Sub': `arn:\${AWS::Partition}:s3:::${config.recording.s3Location.bucket}/${config.recording.s3Location.prefix || ''}*`,
                  },
                  Condition: {
                    StringEquals: {
                      'aws:ResourceAccount': { Ref: 'AWS::AccountId' },
                    },
                  },
                },
              ]
            : []),
          // VPC network interface management is handled by the service-linked role
          // AWSServiceRoleForBedrockAgentCoreNetwork (BedrockAgentCoreNetworkServiceRolePolicy),
          // which is automatically created when VPC mode is configured.
          // No EC2 permissions are needed on the execution role.
        ],
      },
    },
  ]

  // Extract role customizations
  const customizations = getRoleCustomizations(config)

  // Merge custom statements into policy
  if (customizations.statements.length > 0) {
    policies[0].PolicyDocument.Statement.push(...customizations.statements)
  }

  // Build base role
  const role = {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: customizations.name || roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
    },
  }

  // Add managed policies if provided
  if (customizations.managedPolicies.length > 0) {
    role.Properties.ManagedPolicyArns = customizations.managedPolicies
  }

  // Add permission boundary if provided
  if (customizations.permissionsBoundary) {
    role.Properties.PermissionsBoundary = customizations.permissionsBoundary
  }

  // Add custom tags if provided
  if (Object.keys(customizations.tags).length > 0) {
    role.Properties.Tags = mergeTags({}, customizations.tags)
  }

  return role
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
          ArnLike: {
            'aws:SourceArn': {
              'Fn::Sub':
                'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
            },
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
          // VPC network interface management is handled by the service-linked role
          // AWSServiceRoleForBedrockAgentCoreNetwork (BedrockAgentCoreNetworkServiceRolePolicy),
          // which is automatically created when VPC mode is configured.
          // No EC2 permissions are needed on the execution role.
        ],
      },
    },
  ]

  // Extract role customizations
  const customizations = getRoleCustomizations(config)

  // Merge custom statements into policy
  if (customizations.statements.length > 0) {
    policies[0].PolicyDocument.Statement.push(...customizations.statements)
  }

  // Build base role
  const role = {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: customizations.name || roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Policies: policies,
    },
  }

  // Add managed policies if provided
  if (customizations.managedPolicies.length > 0) {
    role.Properties.ManagedPolicyArns = customizations.managedPolicies
  }

  // Add permission boundary if provided
  if (customizations.permissionsBoundary) {
    role.Properties.PermissionsBoundary = customizations.permissionsBoundary
  }

  // Add custom tags if provided
  if (Object.keys(customizations.tags).length > 0) {
    role.Properties.Tags = mergeTags({}, customizations.tags)
  }

  return role
}
