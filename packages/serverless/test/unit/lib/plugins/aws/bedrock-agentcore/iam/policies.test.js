'use strict'

import {
  generateRuntimeRole,
  generateMemoryRole,
  generateGatewayRole,
  generateBrowserRole,
  generateCodeInterpreterRole,
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

      expect(
        result.Properties.AssumeRolePolicyDocument.Statement[0].Principal
          .Service,
      ).toBe('bedrock-agentcore.amazonaws.com')
      expect(
        result.Properties.AssumeRolePolicyDocument.Statement[0].Action,
      ).toBe('sts:AssumeRole')
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

    test('includes VPC permissions when mode is VPC', () => {
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

      const vpcStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ec2:CreateNetworkInterface'),
      )
      expect(vpcStatement).toBeDefined()
    })

    test('includes VPC permissions when mode is lowercase (case-insensitive)', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        network: {
          mode: 'vpc',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const vpcStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ec2:CreateNetworkInterface'),
      )
      expect(vpcStatement).toBeDefined()
    })

    test('does not include VPC permissions when mode is PUBLIC', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        network: {
          mode: 'PUBLIC',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const vpcStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ec2:CreateNetworkInterface'),
      )
      expect(vpcStatement).toBeUndefined()
    })

    test('includes proper tags', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)

      expect(result.Properties.Tags).toContainEqual({
        Key: 'serverless:service',
        Value: 'test-service',
      })
      expect(result.Properties.Tags).toContainEqual({
        Key: 'agentcore:type',
        Value: 'runtime-role',
      })
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

      // Check default tags still exist
      expect(result.Properties.Tags).toContainEqual({
        Key: 'serverless:service',
        Value: 'test-service',
      })

      // Check custom tags were added
      expect(result.Properties.Tags).toContainEqual({
        Key: 'Environment',
        Value: 'production',
      })
      expect(result.Properties.Tags).toContainEqual({
        Key: 'Team',
        Value: 'platform',
      })
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
    test('generates role with correct structure', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)

      expect(result.Type).toBe('AWS::IAM::Role')
      expect(result.Properties.RoleName).toContain('myMemory')
      expect(result.Properties.RoleName).toContain('memory_role')
    })

    test('includes cross-region Bedrock permissions', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const foundationModelStatement = statements.find((s) =>
        s.Resource?.['Fn::Sub']?.includes('foundation-model'),
      )
      expect(foundationModelStatement).toBeDefined()
      expect(foundationModelStatement.Resource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:bedrock:*::foundation-model/*',
      )
    })

    test('includes inference profile permissions', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const inferenceProfileStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('bedrock:GetInferenceProfile'),
      )
      expect(inferenceProfileStatement).toBeDefined()
    })

    test('includes KMS permissions when encryptionKey is specified', () => {
      const config = {
        encryptionKey:
          'arn:aws:kms:us-west-2:123456789012:key/12345678-1234-1234-1234-123456789012',
      }

      const result = generateMemoryRole('myMemory', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const kmsStatement = statements.find(
        (s) => Array.isArray(s.Action) && s.Action.includes('kms:Decrypt'),
      )
      expect(kmsStatement).toBeDefined()
      expect(kmsStatement.Resource).toBe(config.encryptionKey)
    })

    test('does not include KMS permissions when encryptionKey not specified', () => {
      const config = {}

      const result = generateMemoryRole('myMemory', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const kmsStatement = statements.find(
        (s) => Array.isArray(s.Action) && s.Action.includes('kms:Decrypt'),
      )
      expect(kmsStatement).toBeUndefined()
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

      // Check custom statements were added
      const statements = result.Properties.Policies[0].PolicyDocument.Statement
      const customStatement = statements.find((s) =>
        s.Action?.includes('dynamodb:Query'),
      )
      expect(customStatement).toBeDefined()

      // Check managed policies
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

    test('includes proper tags', () => {
      const config = {}

      const result = generateGatewayRole('myGateway', config, baseContext)

      expect(result.Properties.Tags).toContainEqual({
        Key: 'serverless:service',
        Value: 'test-service',
      })
      expect(result.Properties.Tags).toContainEqual({
        Key: 'agentcore:type',
        Value: 'gateway-role',
      })
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
      expect(result.Properties.Tags).toContainEqual({
        Key: 'agentcore:type',
        Value: 'browser-role',
      })
    })

    test('includes S3 permissions for recording', () => {
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

      const s3Statement = statements.find(
        (s) => Array.isArray(s.Action) && s.Action.includes('s3:PutObject'),
      )
      expect(s3Statement).toBeDefined()
      expect(s3Statement.Resource['Fn::Sub']).toContain('my-bucket')
    })

    test('includes VPC permissions when mode is VPC', () => {
      const config = {
        network: {
          mode: 'VPC',
        },
      }

      const result = generateBrowserRole('myBrowser', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const vpcStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ec2:CreateNetworkInterface'),
      )
      expect(vpcStatement).toBeDefined()
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
      expect(result.Properties.Tags).toContainEqual({
        Key: 'agentcore:type',
        Value: 'codeinterpreter-role',
      })
    })

    test('includes VPC permissions when mode is VPC', () => {
      const config = {
        network: {
          mode: 'VPC',
        },
      }

      const result = generateCodeInterpreterRole('myCI', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const vpcStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ec2:CreateNetworkInterface'),
      )
      expect(vpcStatement).toBeDefined()
    })

    test('does not include VPC permissions for SANDBOX mode', () => {
      const config = {
        network: {
          mode: 'SANDBOX',
        },
      }

      const result = generateCodeInterpreterRole('myCI', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const vpcStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('ec2:CreateNetworkInterface'),
      )
      expect(vpcStatement).toBeUndefined()
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
})
