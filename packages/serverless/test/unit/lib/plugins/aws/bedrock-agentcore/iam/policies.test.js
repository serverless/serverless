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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      // Runtime uses scoped log group path per AWS docs
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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const foundationModelStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('bedrock:InvokeModel') &&
          s.Resource?.['Fn::Sub']?.includes('foundation-model'),
      )
      expect(foundationModelStatement).toBeDefined()
      expect(foundationModelStatement.Resource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:bedrock:*::foundation-model/*',
      )
    })

    test('includes inference profile permissions for cross-region inference', () => {
      const config = {
        artifact: {
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = generateRuntimeRole('myAgent', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const inferenceProfileStatement = statements.find(
        (s) =>
          Array.isArray(s.Action) &&
          s.Action.includes('bedrock:GetInferenceProfile'),
      )
      expect(inferenceProfileStatement).toBeDefined()
      expect(inferenceProfileStatement.Resource).toContain(
        'arn:aws:bedrock:*:*:inference-profile/us.*',
      )
      expect(inferenceProfileStatement.Resource).toContain(
        'arn:aws:bedrock:*:*:inference-profile/eu.*',
      )
      expect(inferenceProfileStatement.Resource).toContain(
        'arn:aws:bedrock:*:*:inference-profile/global.*',
      )
    })

    test('includes VPC permissions when networkMode is VPC', () => {
      const config = {
        artifact: {
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        network: {
          networkMode: 'VPC',
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

    test('does not include VPC permissions when networkMode is PUBLIC', () => {
      const config = {
        artifact: {
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        network: {
          networkMode: 'PUBLIC',
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
          containerImage:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
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

    test('includes KMS permissions when kmsKeyArn is specified', () => {
      const config = {
        kmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/12345678',
      }

      const result = generateGatewayRole('myGateway', config, baseContext)
      const statements = result.Properties.Policies[0].PolicyDocument.Statement

      const kmsStatement = statements.find(
        (s) => Array.isArray(s.Action) && s.Action.includes('kms:Decrypt'),
      )
      expect(kmsStatement).toBeDefined()
      expect(kmsStatement.Resource).toBe(config.kmsKeyArn)
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

    test('includes VPC permissions when networkMode is VPC', () => {
      const config = {
        network: {
          networkMode: 'VPC',
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

    test('includes VPC permissions when networkMode is VPC', () => {
      const config = {
        network: {
          networkMode: 'VPC',
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
          networkMode: 'SANDBOX',
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
  })
})
