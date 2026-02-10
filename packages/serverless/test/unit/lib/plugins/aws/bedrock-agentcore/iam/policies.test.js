'use strict'

import {
  generateRuntimeRole,
  generateMemoryRole,
  generateGatewayRole,
  generateBrowserRole,
  generateCodeInterpreterRole,
  resolveEcrRepositoryArn,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/iam/policies.js'

describe('IAM Policies', () => {
  const baseContext = {
    serviceName: 'test-service',
    stage: 'dev',
    region: 'us-west-2',
    accountId: '123456789012',
  }

  describe('generateRuntimeRole', () => {
    test('generates role with correct type and structure', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      expect(result.Type).toBe('AWS::IAM::Role')
      expect(result.Properties.RoleName).toContain('myAgent')
      expect(result.Properties.RoleName).toContain('runtime_role')
    })

    test('generates role with correct assume role policy', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statement = result.Properties.AssumeRolePolicyDocument.Statement[0]

      expect(statement.Principal.Service).toBe(
        'bedrock-agentcore.amazonaws.com',
      )
      expect(statement.Action).toBe('sts:AssumeRole')
      expect(statement.Condition).toEqual({
        StringEquals: {
          'aws:SourceAccount': { Ref: 'AWS::AccountId' },
        },
        ArnLike: {
          'aws:SourceArn': {
            'Fn::Sub':
              'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
          },
        },
      })
    })

    test('includes CloudWatch Logs permissions', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const logsStatement = statements.find((s) =>
        s.Action.includes('logs:CreateLogGroup'),
      )
      expect(logsStatement).toBeDefined()
      expect(logsStatement.Resource['Fn::Sub']).toContain(
        '/aws/bedrock-agentcore/runtimes/*',
      )
    })

    test('includes X-Ray tracing permissions', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const xrayStatement = statements.find((s) => s.Sid === 'XRayTracing')
      expect(xrayStatement).toBeDefined()
      expect(xrayStatement.Action).toContain('xray:PutTraceSegments')
    })

    test('includes CloudWatch metrics permissions with namespace condition', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const metricsStatement = statements.find(
        (s) => s.Sid === 'CloudWatchMetrics',
      )
      expect(metricsStatement).toBeDefined()
      expect(metricsStatement.Action).toContain('cloudwatch:PutMetricData')
      expect(
        metricsStatement.Condition.StringEquals['cloudwatch:namespace'],
      ).toBe('bedrock-agentcore')
    })

    test('includes ECR permissions for container image artifact', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const ecrAuthStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ecr:GetAuthorizationToken'),
      )
      expect(ecrAuthStatement).toBeDefined()

      const ecrImageStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) && s.Action.includes('ecr:BatchGetImage'),
      )
      expect(ecrImageStatement).toBeDefined()
      expect(ecrImageStatement.Action).toEqual([
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ])
    })

    test('scopes ECR permissions to specific repository from image URI', () => {
      const config = {
        artifact: {
          image:
            '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-specific-repo:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const ecrImageStatement = statements.find(
        (s) => s.Sid === 'ECRImageAccess',
      )
      expect(ecrImageStatement).toBeDefined()
      expect(ecrImageStatement.Resource['Fn::Sub']).toEqual([
        'arn:${AWS::Partition}:ecr:${Region}:${AccountId}:repository/${RepositoryName}',
        {
          Region: 'us-east-1',
          AccountId: '123456789012',
          RepositoryName: 'my-specific-repo',
        },
      ])
    })

    test('scopes ECR permissions for cross-account image URI', () => {
      const config = {
        artifact: {
          image:
            '999888777666.dkr.ecr.eu-west-1.amazonaws.com/cross-account-repo:v2',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const ecrImageStatement = statements.find(
        (s) => s.Sid === 'ECRImageAccess',
      )
      expect(ecrImageStatement.Resource['Fn::Sub'][1]).toEqual({
        Region: 'eu-west-1',
        AccountId: '999888777666',
        RepositoryName: 'cross-account-repo',
      })
    })

    test('falls back to wildcard ECR permissions for non-ECR image URI', () => {
      const config = {
        artifact: {
          image: 'docker.io/library/python:3.13',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const ecrImageStatement = statements.find(
        (s) => s.Sid === 'ECRImageAccess',
      )
      expect(ecrImageStatement).toBeDefined()
      expect(ecrImageStatement.Resource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/*',
      )
    })

    test('includes S3 permissions for S3 artifact', () => {
      const config = {
        artifact: {
          s3: {
            bucket: 'my-bucket',
            key: 'agents/my-agent.zip',
          },
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const s3Statement = statements.find(
        (s) => Array.isArray(s.Action) && s.Action.includes('s3:GetObject'),
      )
      expect(s3Statement).toBeDefined()
      expect(s3Statement.Resource['Fn::Sub']).toContain('my-bucket')
    })

    test('does not include ECR permissions for S3 artifact', () => {
      const config = {
        artifact: {
          s3: {
            bucket: 'my-bucket',
            key: 'agents/my-agent.zip',
          },
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const ecrStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ecr:GetAuthorizationToken'),
      )
      expect(ecrStatement).toBeUndefined()
    })

    test('includes cross-region Bedrock model invocation permissions', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const bedrockStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) && s.Action.includes('bedrock:InvokeModel'),
      )
      expect(bedrockStatement).toBeDefined()
      const foundationModelResource = bedrockStatement.Resource.find((r) =>
        r['Fn::Sub']?.includes('foundation-model'),
      )
      expect(foundationModelResource).toBeDefined()
      expect(foundationModelResource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:bedrock:*::foundation-model/*',
      )
    })

    test('includes inference profile permissions for cross-region inference', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const bedrockStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('bedrock:GetInferenceProfile'),
      )
      expect(bedrockStatement).toBeDefined()
      const inferenceProfileResource = bedrockStatement.Resource.find((r) =>
        r['Fn::Sub']?.includes('inference-profile'),
      )
      expect(inferenceProfileResource).toBeDefined()
      expect(inferenceProfileResource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:bedrock:*:*:inference-profile/*',
      )
    })

    test('includes application inference profile permissions for user-created profiles', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const bedrockStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) && s.Action.includes('bedrock:InvokeModel'),
      )
      expect(bedrockStatement).toBeDefined()
      const appInferenceProfileResource = bedrockStatement.Resource.find((r) =>
        r['Fn::Sub']?.includes('application-inference-profile'),
      )
      expect(appInferenceProfileResource).toBeDefined()
      expect(appInferenceProfileResource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:bedrock:*:*:application-inference-profile/*',
      )
    })

    test('includes full memory permissions when memoryResourceRef is provided', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext, {
        memoryResourceRef: { Ref: 'MyMemoryResource' },
      })
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const memoryStatement = statements.find((s) => s.Sid === 'MemoryAccess')
      expect(memoryStatement).toBeDefined()
      expect(memoryStatement.Action).toEqual([
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
      ])
    })

    test('scopes memory resource to specific memory ID via Fn::Sub', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext, {
        memoryResourceRef: { Ref: 'MyMemoryResource' },
      })
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const memoryStatement = statements.find((s) => s.Sid === 'MemoryAccess')
      expect(memoryStatement.Resource).toEqual({
        'Fn::Sub': [
          'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:memory/${MemoryId}',
          { MemoryId: { Ref: 'MyMemoryResource' } },
        ],
      })
    })

    test('accepts memory resource as string ARN', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const memoryArn =
        'arn:aws:bedrock-agentcore:us-west-2:123456789012:memory/abc123'
      const result = generateRuntimeRole('myAgent', config, baseContext, {
        memoryResourceRef: memoryArn,
      })
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const memoryStatement = statements.find((s) => s.Sid === 'MemoryAccess')
      expect(memoryStatement.Resource).toBe(memoryArn)
    })

    test('does not include memory permissions when memoryResourceRef is not provided', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const memoryStatement = statements.find((s) => s.Sid === 'MemoryAccess')
      expect(memoryStatement).toBeUndefined()
    })

    test('includes browser permissions with exactly 11 actions matching AWS docs', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const browserStatement = statements.find((s) => s.Sid === 'BrowserAccess')
      expect(browserStatement).toBeDefined()
      expect(browserStatement.Action).toEqual([
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
      ])
      expect(browserStatement.Action).toHaveLength(11)
      expect(browserStatement.Action).not.toContain(
        'bedrock-agentcore:InvokeBrowser',
      )
    })

    test('scopes browser permissions to AWS-managed default browser', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const browserStatement = statements.find((s) => s.Sid === 'BrowserAccess')
      expect(browserStatement.Resource).toEqual({
        'Fn::Sub':
          'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:aws:browser/*',
      })
    })

    test('does not include VPC permissions (handled by service-linked role)', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        network: {
          mode: 'VPC',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const allActions = statements.flatMap((s) =>
        Array.isArray(s.Action) ? s.Action : [s.Action],
      )
      const ec2Actions = allActions.filter((a) => a.startsWith('ec2:'))
      expect(ec2Actions).toHaveLength(0)
    })

    test('includes proper tags', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      expect(result.Properties.Tags).toBeUndefined()
    })

    // IAM Customization Tests
    test('merges custom IAM statements with auto-generated statements', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        role: {
          statements: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject', 's3:PutObject'],
              Resource: 'arn:aws:s3:::my-bucket/*',
            },
          ],
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      // Check auto-generated statements still exist
      const logsStatement = statements.find(
        (s) =>
          s.Sid === 'CloudWatchLogs' ||
          s.Action?.includes('logs:CreateLogGroup'),
      )
      expect(logsStatement).toBeDefined()

      // Check custom statement was added
      const customStatement = statements.find(
        (s) =>
          s.Action?.includes('s3:GetObject') &&
          s.Resource === 'arn:aws:s3:::my-bucket/*',
      )
      expect(customStatement).toBeDefined()
      expect(customStatement.Effect).toBe('Allow')
    })

    test('adds managed policies to role', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        role: {
          managedPolicies: [
            'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess',
            'arn:aws:iam::123456789012:policy/CustomPolicy',
          ],
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      expect(result.Properties.ManagedPolicyArns).toEqual([
        'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess',
        'arn:aws:iam::123456789012:policy/CustomPolicy',
      ])
    })

    test('sets custom role name', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        role: {
          name: 'my-custom-role-name',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      expect(result.Properties.RoleName).toBe('my-custom-role-name')
    })

    test('sets permission boundary', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        role: {
          permissionsBoundary: 'arn:aws:iam::123456789012:policy/MyBoundary',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      expect(result.Properties.PermissionsBoundary).toBe(
        'arn:aws:iam::123456789012:policy/MyBoundary',
      )
    })

    test('merges custom tags with default tags', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        role: {
          tags: {
            Environment: 'production',
            Team: 'platform',
          },
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      // Check only custom tags are present (no default tags)
      expect(result.Properties.Tags).toContainEqual({
        Key: 'Environment',
        Value: 'production',
      })
      expect(result.Properties.Tags).toContainEqual({
        Key: 'Team',
        Value: 'platform',
      })
      expect(result.Properties.Tags).toHaveLength(2)
    })

    test('handles role as string (backward compatibility)', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        role: 'arn:aws:iam::123456789012:role/existing-role',
      }

      // When role is a string, the role should not be generated - this is handled in index.js
      // This test verifies that the generation functions don't crash with string role
      const result = generateRuntimeRole('myAgent', config, baseContext)

      // Should still generate valid role structure (used when role is object or missing)
      expect(result.Type).toBe('AWS::IAM::Role')
      expect(result.Properties.Policies).toBeDefined()
    })

    test('combines all customization options', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        role: {
          name: 'combined-custom-role',
          statements: [
            {
              Effect: 'Allow',
              Action: ['dynamodb:GetItem'],
              Resource: '*',
            },
          ],
          managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
          permissionsBoundary: 'arn:aws:iam::123456789012:policy/Boundary',
          tags: {
            CustomTag: 'customValue',
          },
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      expect(result.Properties.RoleName).toBe('combined-custom-role')
      expect(result.Properties.ManagedPolicyArns).toContain(
        'arn:aws:iam::aws:policy/ReadOnlyAccess',
      )
      expect(result.Properties.PermissionsBoundary).toBe(
        'arn:aws:iam::123456789012:policy/Boundary',
      )
      expect(result.Properties.Tags).toContainEqual({
        Key: 'CustomTag',
        Value: 'customValue',
      })

      const statements = result.Properties.Policies[0].PolicyDocument.Statement
      const customStatement = statements.find((s) =>
        s.Action?.includes('dynamodb:GetItem'),
      )
      expect(customStatement).toBeDefined()
    })
  })

  describe('generateMemoryRole', () => {
    const memoryManagedPolicyArn =
      'arn:aws:iam::aws:policy/AmazonBedrockAgentCoreMemoryBedrockModelInferenceExecutionRolePolicy'

    test('generates role with correct structure', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)

      expect(result.Type).toBe('AWS::IAM::Role')
      expect(result.Properties.RoleName).toContain('myMemory')
      expect(result.Properties.RoleName).toContain('memory_role')
    })

    test('includes SourceArn condition in trust policy for confused deputy protection', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)
      const condition =
        result.Properties.AssumeRolePolicyDocument.Statement[0].Condition

      expect(condition.StringEquals['aws:SourceAccount']).toEqual({
        Ref: 'AWS::AccountId',
      })
      expect(condition.ArnLike['aws:SourceArn']).toEqual({
        'Fn::Sub':
          'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
      })
    })

    test('uses AWS managed policy for Bedrock model invocation', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)

      expect(result.Properties.ManagedPolicyArns).toContain(
        memoryManagedPolicyArn,
      )
    })

    test('does not include inline policy by default', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)

      expect(result.Properties.Policies).toBeUndefined()
    })

    // IAM Customization Tests
    test('merges custom IAM statements and applies all customizations', () => {
      const config = {
        role: {
          name: 'memory-custom-role',
          statements: [
            {
              Effect: 'Allow',
              Action: ['dynamodb:Query'],
              Resource: 'arn:aws:dynamodb:*:*:table/MemoryTable',
            },
          ],
          managedPolicies: [
            'arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess',
          ],
          permissionsBoundary:
            'arn:aws:iam::123456789012:policy/MemoryBoundary',
          tags: {
            DataType: 'memory',
          },
        },
      }

      const result = generateMemoryRole('myMemory', config, baseContext)

      // Check custom role name
      expect(result.Properties.RoleName).toBe('memory-custom-role')

      // Check custom statements create an inline policy
      const statements = result.Properties.Policies[0].PolicyDocument.Statement
      const customStatement = statements.find((s) =>
        s.Action?.includes('dynamodb:Query'),
      )
      expect(customStatement).toBeDefined()

      // Check managed policies include both the default and user-provided
      expect(result.Properties.ManagedPolicyArns).toContain(
        memoryManagedPolicyArn,
      )
      expect(result.Properties.ManagedPolicyArns).toContain(
        'arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess',
      )

      // Check permission boundary
      expect(result.Properties.PermissionsBoundary).toBe(
        'arn:aws:iam::123456789012:policy/MemoryBoundary',
      )

      // Check tags
      expect(result.Properties.Tags).toContainEqual({
        Key: 'DataType',
        Value: 'memory',
      })
    })
  })

  describe('generateGatewayRole', () => {
    test('generates role with correct structure', () => {
      const config = {}

      const result = generateGatewayRole('myGateway', config, baseContext)

      expect(result.Type).toBe('AWS::IAM::Role')
      expect(result.Properties.RoleName).toContain('gateway_role')
    })

    test('includes SourceArn condition in trust policy for confused deputy protection', () => {
      const config = {}

      const result = generateGatewayRole('myGateway', config, baseContext)
      const condition =
        result.Properties.AssumeRolePolicyDocument.Statement[0].Condition

      expect(condition.StringEquals['aws:SourceAccount']).toEqual({
        Ref: 'AWS::AccountId',
      })
      expect(condition.ArnLike['aws:SourceArn']).toEqual({
        'Fn::Sub':
          'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
      })
    })

    test('includes broad Lambda invocation permissions for tools', () => {
      const config = {}

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const lambdaStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) && s.Action.includes('lambda:InvokeFunction'),
      )
      expect(lambdaStatement).toBeDefined()
      expect(lambdaStatement.Resource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:*',
      )
    })

    test('includes KMS permissions when kmsKey is specified', () => {
      const config = {
        kmsKey: 'arn:aws:kms:us-west-2:123456789012:key/12345678',
      }

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const kmsStatement = statements.find(
        (s) => Array.isArray(s.Action) && s.Action.includes('kms:Decrypt'),
      )
      expect(kmsStatement).toBeDefined()
      expect(kmsStatement.Resource).toBe(config.kmsKey)
    })

    test('includes CloudWatch Logs permissions', () => {
      const config = {}

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const logsStatement = statements.find((s) =>
        s.Action.includes('logs:CreateLogGroup'),
      )
      expect(logsStatement).toBeDefined()
      expect(logsStatement.Resource['Fn::Sub']).toContain(
        '/aws/bedrock-agentcore/*',
      )
    })

    test('has no default tags', () => {
      const config = {}

      const result = generateGatewayRole('myGateway', config, baseContext)

      expect(result.Properties.Tags).toBeUndefined()
    })

    // Credential provider conditional tests
    test('does not include credential provider statements by default', () => {
      const config = {}

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const allActions = statements.flatMap((s) =>
        Array.isArray(s.Action) ? s.Action : [s.Action],
      )

      // No WorkloadIdentity, TokenVault, or SecretsManager actions
      expect(
        allActions.filter((a) =>
          a.startsWith('bedrock-agentcore:GetWorkloadAccessToken'),
        ),
      ).toHaveLength(0)
      expect(
        allActions.filter(
          (a) =>
            a === 'bedrock-agentcore:GetResourceOauth2Token' ||
            a === 'bedrock-agentcore:GetResourceApiKey',
        ),
      ).toHaveLength(0)
      expect(
        allActions.filter((a) => a === 'secretsmanager:GetSecretValue'),
      ).toHaveLength(0)
    })

    test('includes credential provider statements when hasCredentialProviders is true', () => {
      const config = { hasCredentialProviders: true }

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const workloadIdentity = statements.find(
        (s) => s.Sid === 'WorkloadIdentityAccess',
      )
      expect(workloadIdentity).toBeDefined()
      expect(workloadIdentity.Action).toContain(
        'bedrock-agentcore:GetWorkloadAccessToken',
      )

      const tokenVault = statements.find((s) => s.Sid === 'TokenVaultAccess')
      expect(tokenVault).toBeDefined()
      expect(tokenVault.Action).toContain(
        'bedrock-agentcore:GetResourceOauth2Token',
      )
      expect(tokenVault.Action).toContain('bedrock-agentcore:GetResourceApiKey')

      const secretsManager = statements.find(
        (s) => s.Sid === 'SecretsManagerAccess',
      )
      expect(secretsManager).toBeDefined()
    })

    test('scopes SecretsManager to bedrock-agentcore-identity prefix', () => {
      const config = { hasCredentialProviders: true }

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const secretsManager = statements.find(
        (s) => s.Sid === 'SecretsManagerAccess',
      )
      expect(secretsManager.Resource['Fn::Sub']).toContain(
        'secret:bedrock-agentcore-identity*',
      )
      // Must NOT be secret:*
      expect(secretsManager.Resource['Fn::Sub']).not.toMatch(/secret:\*/)
    })

    // IAM Customization Tests
    test('supports IAM role customization', () => {
      const config = {
        role: {
          statements: [
            {
              Effect: 'Allow',
              Action: ['secretsmanager:GetSecretValue'],
              Resource: 'arn:aws:secretsmanager:*:*:secret:my-secret-*',
            },
          ],
          managedPolicies: ['arn:aws:iam::aws:policy/SecretsManagerReadWrite'],
          tags: {
            Gateway: 'custom',
          },
        },
      }

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      // Check custom statement was added
      const customStatement = statements.find(
        (s) =>
          s.Action?.includes('secretsmanager:GetSecretValue') &&
          s.Resource === 'arn:aws:secretsmanager:*:*:secret:my-secret-*',
      )
      expect(customStatement).toBeDefined()

      // Check managed policies
      expect(result.Properties.ManagedPolicyArns).toContain(
        'arn:aws:iam::aws:policy/SecretsManagerReadWrite',
      )

      // Check custom tags
      expect(result.Properties.Tags).toContainEqual({
        Key: 'Gateway',
        Value: 'custom',
      })
    })
  })

  describe('generateBrowserRole', () => {
    test('generates role with correct structure', () => {
      const config = {}

      const result = generateBrowserRole('myBrowser', config, baseContext)

      expect(result.Type).toBe('AWS::IAM::Role')
      expect(result.Properties.RoleName).toContain('browser_role')
      expect(result.Properties.Tags).toBeUndefined()
    })

    test('includes SourceArn condition in trust policy for confused deputy protection', () => {
      const config = {}

      const result = generateBrowserRole('myBrowser', config, baseContext)
      const condition =
        result.Properties.AssumeRolePolicyDocument.Statement[0].Condition

      expect(condition.StringEquals['aws:SourceAccount']).toEqual({
        Ref: 'AWS::AccountId',
      })
      expect(condition.ArnLike['aws:SourceArn']).toEqual({
        'Fn::Sub':
          'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
      })
    })

    test('includes S3 recording permissions with correct actions', () => {
      const config = {
        recording: {
          s3Location: {
            bucket: 'my-bucket',
            prefix: 'recordings/',
          },
        },
      }

      const result = generateBrowserRole('myBrowser', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const s3Statement = statements.find((s) => s.Sid === 'S3Recording')
      expect(s3Statement).toBeDefined()
      expect(s3Statement.Action).toContain('s3:PutObject')
      expect(s3Statement.Action).toContain('s3:ListMultipartUploadParts')
      expect(s3Statement.Action).toContain('s3:AbortMultipartUpload')
      expect(s3Statement.Action).not.toContain('s3:GetObject')
      expect(s3Statement.Resource['Fn::Sub']).toContain('my-bucket')
    })

    test('includes aws:ResourceAccount condition on S3 recording statement', () => {
      const config = {
        recording: {
          s3Location: {
            bucket: 'my-bucket',
            prefix: 'recordings/',
          },
        },
      }

      const result = generateBrowserRole('myBrowser', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const s3Statement = statements.find((s) => s.Sid === 'S3Recording')
      expect(s3Statement.Condition).toBeDefined()
      expect(s3Statement.Condition.StringEquals['aws:ResourceAccount']).toEqual(
        { Ref: 'AWS::AccountId' },
      )
    })

    test('does not include VPC permissions even when mode is VPC', () => {
      const config = {
        network: {
          mode: 'VPC',
        },
      }

      const result = generateBrowserRole('myBrowser', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement
      const allActions = statements.flatMap((s) =>
        Array.isArray(s.Action) ? s.Action : [s.Action],
      )

      expect(allActions.filter((a) => a.startsWith('ec2:'))).toHaveLength(0)
    })

    // IAM Customization Tests
    test('supports IAM role customization', () => {
      const config = {
        role: {
          statements: [
            {
              Effect: 'Allow',
              Action: ['s3:ListBucket'],
              Resource: 'arn:aws:s3:::recordings-bucket',
            },
          ],
          managedPolicies: ['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
        },
      }

      const result = generateBrowserRole('myBrowser', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const customStatement = statements.find((s) =>
        s.Action?.includes('s3:ListBucket'),
      )
      expect(customStatement).toBeDefined()
      expect(result.Properties.ManagedPolicyArns).toContain(
        'arn:aws:iam::aws:policy/AmazonS3FullAccess',
      )
    })
  })

  describe('generateCodeInterpreterRole', () => {
    test('generates role with correct structure', () => {
      const config = {}

      const result = generateCodeInterpreterRole('myCI', config, baseContext)

      expect(result.Type).toBe('AWS::IAM::Role')
      expect(result.Properties.RoleName).toContain('ci_role')
      expect(result.Properties.Tags).toBeUndefined()
    })

    test('includes SourceArn condition in trust policy for confused deputy protection', () => {
      const config = {}

      const result = generateCodeInterpreterRole('myCI', config, baseContext)
      const condition =
        result.Properties.AssumeRolePolicyDocument.Statement[0].Condition

      expect(condition.StringEquals['aws:SourceAccount']).toEqual({
        Ref: 'AWS::AccountId',
      })
      expect(condition.ArnLike['aws:SourceArn']).toEqual({
        'Fn::Sub':
          'arn:${AWS::Partition}:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*',
      })
    })

    test('does not include VPC permissions even when mode is VPC', () => {
      const config = {
        network: {
          mode: 'VPC',
        },
      }

      const result = generateCodeInterpreterRole('myCI', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement
      const allActions = statements.flatMap((s) =>
        Array.isArray(s.Action) ? s.Action : [s.Action],
      )

      expect(allActions.filter((a) => a.startsWith('ec2:'))).toHaveLength(0)
    })

    // IAM Customization Tests
    test('supports IAM role customization', () => {
      const config = {
        role: {
          name: 'ci-custom-role',
          statements: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: 'arn:aws:s3:::data-bucket/*',
            },
          ],
          managedPolicies: ['arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'],
          permissionsBoundary: 'arn:aws:iam::123456789012:policy/CIBoundary',
          tags: {
            CodeInterpreter: 'custom',
          },
        },
      }

      const result = generateCodeInterpreterRole('myCI', config, baseContext)

      expect(result.Properties.RoleName).toBe('ci-custom-role')
      expect(result.Properties.ManagedPolicyArns).toContain(
        'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess',
      )
      expect(result.Properties.PermissionsBoundary).toBe(
        'arn:aws:iam::123456789012:policy/CIBoundary',
      )
      expect(result.Properties.Tags).toContainEqual({
        Key: 'CodeInterpreter',
        Value: 'custom',
      })

      const statements = result.Properties.Policies[0].PolicyDocument.Statement
      const customStatement = statements.find((s) =>
        s.Action?.includes('s3:GetObject'),
      )
      expect(customStatement).toBeDefined()
    })
  })

  describe('resolveEcrRepositoryArn', () => {
    test('parses standard ECR URI with tag', () => {
      const result = resolveEcrRepositoryArn(
        '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-repo:latest',
      )

      expect(result['Fn::Sub']).toEqual([
        'arn:${AWS::Partition}:ecr:${Region}:${AccountId}:repository/${RepositoryName}',
        {
          Region: 'us-east-1',
          AccountId: '123456789012',
          RepositoryName: 'my-repo',
        },
      ])
    })

    test('parses ECR URI with digest', () => {
      const result = resolveEcrRepositoryArn(
        '123456789012.dkr.ecr.us-east-1.amazonaws.com/digest-repo@sha256:abc123',
      )

      expect(result['Fn::Sub'][1]).toEqual({
        Region: 'us-east-1',
        AccountId: '123456789012',
        RepositoryName: 'digest-repo',
      })
    })

    test('parses ECR URI with nested repository path', () => {
      const result = resolveEcrRepositoryArn(
        '999888777666.dkr.ecr.eu-west-1.amazonaws.com/my-org/my-nested-repo:v1.2.3',
      )

      expect(result['Fn::Sub'][1]).toEqual({
        Region: 'eu-west-1',
        AccountId: '999888777666',
        RepositoryName: 'my-org/my-nested-repo',
      })
    })

    test('parses cross-account ECR URI', () => {
      const result = resolveEcrRepositoryArn(
        '111222333444.dkr.ecr.ap-southeast-1.amazonaws.com/cross-account-repo:prod',
      )

      expect(result['Fn::Sub'][1]).toEqual({
        Region: 'ap-southeast-1',
        AccountId: '111222333444',
        RepositoryName: 'cross-account-repo',
      })
    })

    test('parses ECR URI without tag or digest', () => {
      const result = resolveEcrRepositoryArn(
        '123456789012.dkr.ecr.us-east-1.amazonaws.com/no-tag-repo',
      )

      expect(result['Fn::Sub'][1]).toEqual({
        Region: 'us-east-1',
        AccountId: '123456789012',
        RepositoryName: 'no-tag-repo',
      })
    })

    test('returns wildcard ARN for non-ECR URI', () => {
      const result = resolveEcrRepositoryArn('docker.io/library/python:3.13')

      expect(result['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/*',
      )
    })

    test('returns wildcard ARN for non-string input', () => {
      const result = resolveEcrRepositoryArn({ path: '.', file: 'Dockerfile' })

      expect(result['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/*',
      )
    })

    test('returns wildcard ARN for undefined input', () => {
      const result = resolveEcrRepositoryArn(undefined)

      expect(result['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/*',
      )
    })

    test('returns wildcard ARN for null input', () => {
      const result = resolveEcrRepositoryArn(null)

      expect(result['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/*',
      )
    })
  })
})
