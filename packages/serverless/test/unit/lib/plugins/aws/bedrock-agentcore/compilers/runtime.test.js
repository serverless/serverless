'use strict'

import {
  compileRuntime,
  buildArtifact,
  buildNetworkConfiguration,
  buildAuthorizerConfiguration,
  buildLifecycleConfiguration,
  buildProtocolConfiguration,
  buildEnvironmentVariables,
  buildRequestHeaderConfiguration,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/runtime.js'

describe('Runtime Compiler', () => {
  const baseContext = {
    serviceName: 'test-service',
    stage: 'dev',
    region: 'us-west-2',
    accountId: '123456789012',
    customConfig: {},
    defaultTags: {},
  }

  const baseTags = {}

  describe('buildArtifact', () => {
    test('builds container image artifact from artifact.image string', () => {
      const artifact = {
        image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
      }

      const result = buildArtifact(artifact)

      expect(result).toEqual({
        ContainerConfiguration: {
          ContainerUri:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      })
    })

    test('builds S3 artifact with CodeConfiguration', () => {
      const artifact = {
        s3: {
          bucket: 'my-bucket',
          key: 'agents/my-agent.zip',
        },
      }

      const result = buildArtifact(artifact)

      expect(result).toEqual({
        CodeConfiguration: {
          Code: {
            S3: {
              Bucket: 'my-bucket',
              Prefix: 'agents/my-agent.zip',
            },
          },
          EntryPoint: ['main.py'],
          Runtime: 'PYTHON_3_13',
        },
      })
    })

    test('builds S3 artifact with custom entryPoint and runtime', () => {
      const artifact = {
        s3: {
          bucket: 'my-bucket',
          key: 'agents/my-agent.zip',
          versionId: 'abc123',
        },
        entryPoint: ['app.py', 'main'],
        runtime: 'PYTHON_3_13',
      }

      const result = buildArtifact(artifact)

      expect(result).toEqual({
        CodeConfiguration: {
          Code: {
            S3: {
              Bucket: 'my-bucket',
              Prefix: 'agents/my-agent.zip',
              VersionId: 'abc123',
            },
          },
          EntryPoint: ['app.py', 'main'],
          Runtime: 'PYTHON_3_13',
        },
      })
    })

    test('throws error when neither image nor s3 is specified', () => {
      const artifact = {}

      expect(() => buildArtifact(artifact)).toThrow(
        'Artifact must specify either image (container URI), s3 (bucket+key), or entryPoint (code deployment)',
      )
    })
  })

  describe('buildNetworkConfiguration', () => {
    test('defaults to PUBLIC network mode', () => {
      const result = buildNetworkConfiguration()

      expect(result).toEqual({
        NetworkMode: 'PUBLIC',
      })
    })

    test('handles VPC mode with NetworkModeConfig (new flat structure)', () => {
      const network = {
        mode: 'VPC',
        subnets: ['subnet-123', 'subnet-456'],
        securityGroups: ['sg-789'],
      }

      const result = buildNetworkConfiguration(network)

      expect(result).toEqual({
        NetworkMode: 'VPC',
        NetworkModeConfig: {
          Subnets: ['subnet-123', 'subnet-456'],
          SecurityGroups: ['sg-789'],
        },
      })
    })

    test('handles lowercase mode (case-insensitive)', () => {
      const network = {
        mode: 'vpc',
        subnets: ['subnet-123'],
        securityGroups: ['sg-789'],
      }

      const result = buildNetworkConfiguration(network)

      expect(result.NetworkMode).toBe('VPC')
    })

    test('does not include NetworkModeConfig for PUBLIC mode', () => {
      const network = {
        mode: 'PUBLIC',
      }

      const result = buildNetworkConfiguration(network)

      expect(result).toEqual({
        NetworkMode: 'PUBLIC',
      })
      expect(result.NetworkModeConfig).toBeUndefined()
    })
  })

  describe('buildAuthorizerConfiguration', () => {
    test('returns null when no authorizer', () => {
      const result = buildAuthorizerConfiguration(null)
      expect(result).toBeNull()
    })

    test('returns null when authorizer has no jwt', () => {
      const result = buildAuthorizerConfiguration({})
      expect(result).toBeNull()
    })

    test('builds CustomJWTAuthorizer with all properties', () => {
      const authorizer = {
        jwt: {
          discoveryUrl:
            'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123/.well-known/openid-configuration',
          allowedAudience: ['my-app-client-id'],
          allowedClients: ['client-1', 'client-2'],
        },
      }

      const result = buildAuthorizerConfiguration(authorizer)

      expect(result).toEqual({
        CustomJWTAuthorizer: {
          DiscoveryUrl:
            'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123/.well-known/openid-configuration',
          AllowedAudience: ['my-app-client-id'],
          AllowedClients: ['client-1', 'client-2'],
        },
      })
    })

    test('builds CustomJWTAuthorizer with only required discoveryUrl', () => {
      const authorizer = {
        jwt: {
          discoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
        },
      }

      const result = buildAuthorizerConfiguration(authorizer)

      expect(result).toEqual({
        CustomJWTAuthorizer: {
          DiscoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
        },
      })
    })

    test('throws error when jwt authorizer missing discoveryUrl', () => {
      const authorizer = {
        jwt: {
          allowedAudience: ['my-app'],
        },
      }

      expect(() => buildAuthorizerConfiguration(authorizer)).toThrow(
        'JWT authorizer requires discoveryUrl',
      )
    })
  })

  describe('buildLifecycleConfiguration', () => {
    test('returns null when no lifecycle config', () => {
      const result = buildLifecycleConfiguration(null)
      expect(result).toBeNull()
    })

    test('builds lifecycle configuration with IdleRuntimeSessionTimeout', () => {
      const lifecycle = {
        idleRuntimeSessionTimeout: 600,
      }

      const result = buildLifecycleConfiguration(lifecycle)

      expect(result).toEqual({
        IdleRuntimeSessionTimeout: 600,
      })
    })

    test('builds lifecycle configuration with MaxLifetime', () => {
      const lifecycle = {
        maxLifetime: 3600,
      }

      const result = buildLifecycleConfiguration(lifecycle)

      expect(result).toEqual({
        MaxLifetime: 3600,
      })
    })

    test('builds lifecycle configuration with both properties', () => {
      const lifecycle = {
        idleRuntimeSessionTimeout: 300,
        maxLifetime: 7200,
      }

      const result = buildLifecycleConfiguration(lifecycle)

      expect(result).toEqual({
        IdleRuntimeSessionTimeout: 300,
        MaxLifetime: 7200,
      })
    })
  })

  describe('buildProtocolConfiguration', () => {
    test('returns null when no protocol', () => {
      const result = buildProtocolConfiguration(null)
      expect(result).toBeNull()
    })

    test('returns protocol type string from protocol object', () => {
      const result = buildProtocolConfiguration({ type: 'MCP' })
      expect(result).toBe('MCP')
    })

    test('handles HTTP protocol', () => {
      const result = buildProtocolConfiguration({ type: 'HTTP' })
      expect(result).toBe('HTTP')
    })

    test('handles A2A protocol', () => {
      const result = buildProtocolConfiguration({ type: 'A2A' })
      expect(result).toBe('A2A')
    })

    test('handles lowercase protocol type (case-insensitive)', () => {
      const result = buildProtocolConfiguration({ type: 'mcp' })
      expect(result).toBe('MCP')
    })
  })

  describe('buildEnvironmentVariables', () => {
    test('returns null when no environment', () => {
      const result = buildEnvironmentVariables(null)
      expect(result).toBeNull()
    })

    test('returns null for empty environment', () => {
      const result = buildEnvironmentVariables({})
      expect(result).toBeNull()
    })

    test('returns environment variables', () => {
      const env = {
        MODEL_ID: 'anthropic.claude-sonnet-4-20250514',
        LOG_LEVEL: 'INFO',
      }

      const result = buildEnvironmentVariables(env)

      expect(result).toEqual(env)
    })
  })

  describe('buildRequestHeaderConfiguration', () => {
    test('returns null when requestHeaders is null', () => {
      const result = buildRequestHeaderConfiguration(null)
      expect(result).toBeNull()
    })

    test('returns null when requestHeaders is undefined', () => {
      const result = buildRequestHeaderConfiguration(undefined)
      expect(result).toBeNull()
    })

    test('returns null when allowlist is empty', () => {
      const result = buildRequestHeaderConfiguration({ allowlist: [] })
      expect(result).toBeNull()
    })

    test('returns null when allowlist is not provided', () => {
      const result = buildRequestHeaderConfiguration({})
      expect(result).toBeNull()
    })

    test('builds RequestHeaderConfiguration with allowlist', () => {
      const requestHeaders = {
        allowlist: ['X-Custom-Header', 'Authorization', 'X-Correlation-ID'],
      }

      const result = buildRequestHeaderConfiguration(requestHeaders)

      expect(result).toEqual({
        RequestHeaderAllowlist: [
          'X-Custom-Header',
          'Authorization',
          'X-Correlation-ID',
        ],
      })
    })
  })

  describe('compileRuntime', () => {
    test('generates valid CloudFormation with minimal config', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = compileRuntime('myAgent', config, baseContext, baseTags)

      expect(result.Type).toBe('AWS::BedrockAgentCore::Runtime')
      expect(result.Properties.AgentRuntimeName).toBe(
        'test_service_myAgent_dev',
      )
      expect(result.Properties.AgentRuntimeArtifact).toEqual({
        ContainerConfiguration: {
          ContainerUri:
            '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      })
      expect(result.Properties.NetworkConfiguration).toEqual({
        NetworkMode: 'PUBLIC',
      })
      expect(result.Properties.RoleArn).toEqual({
        'Fn::GetAtt': ['MyAgentRuntimeRole', 'Arn'],
      })
    })

    test('includes optional properties when provided', () => {
      const config = {
        description: 'Test agent',
        protocol: { type: 'MCP' },
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        environment: {
          MODEL_ID: 'anthropic.claude-sonnet-4-20250514',
        },
      }

      const result = compileRuntime('myAgent', config, baseContext, baseTags)

      expect(result.Properties.Description).toBe('Test agent')
      expect(result.Properties.ProtocolConfiguration).toBe('MCP')
      expect(result.Properties.EnvironmentVariables).toEqual({
        MODEL_ID: 'anthropic.claude-sonnet-4-20250514',
      })
    })

    test('uses provided role when specified as ARN', () => {
      const config = {
        role: 'arn:aws:iam::123456789012:role/MyCustomRole',
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = compileRuntime('myAgent', config, baseContext, baseTags)

      expect(result.Properties.RoleArn).toBe(
        'arn:aws:iam::123456789012:role/MyCustomRole',
      )
    })

    test('uses provided role when specified as logical name', () => {
      const config = {
        role: 'MyCustomRoleLogicalId',
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = compileRuntime('myAgent', config, baseContext, baseTags)

      expect(result.Properties.RoleArn).toEqual({
        'Fn::GetAtt': ['MyCustomRoleLogicalId', 'Arn'],
      })
    })

    test('includes RequestHeaderConfiguration when requestHeaders is provided', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
        requestHeaders: {
          allowlist: ['X-Custom-Header', 'Authorization'],
        },
      }

      const result = compileRuntime('myAgent', config, baseContext, baseTags)

      expect(result.Properties.RequestHeaderConfiguration).toEqual({
        RequestHeaderAllowlist: ['X-Custom-Header', 'Authorization'],
      })
    })

    test('includes tags when provided', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }
      const customTags = {
        Environment: 'production',
        Team: 'platform',
      }

      const result = compileRuntime('myAgent', config, baseContext, customTags)

      expect(result.Properties.Tags).toEqual(customTags)
    })

    test('omits Tags when no tags provided', () => {
      const config = {
        artifact: {
          image: '123456789.dkr.ecr.us-west-2.amazonaws.com/my-agent:latest',
        },
      }

      const result = compileRuntime('myAgent', config, baseContext, {})

      expect(result.Properties.Tags).toBeUndefined()
    })

    test('derives S3 artifact key from package.artifact using basename', () => {
      const config = {
        artifact: {
          entryPoint: ['main.py'],
          runtime: 'PYTHON_3_13',
        },
        package: {
          artifact: '.serverless/my-agent.zip',
        },
      }

      const contextWithArtifactDir = {
        ...baseContext,
        artifactDirectoryName: 'serverless/test-service/dev/1234',
      }

      const result = compileRuntime(
        'myAgent',
        config,
        contextWithArtifactDir,
        baseTags,
      )

      expect(
        result.Properties.AgentRuntimeArtifact.CodeConfiguration.Code.S3.Prefix,
      ).toBe('serverless/test-service/dev/1234/my-agent.zip')
    })

    test('derives S3 artifact key from custom absolute path', () => {
      const config = {
        artifact: {
          entryPoint: ['main.py'],
          runtime: 'PYTHON_3_13',
        },
        package: {
          artifact: '/tmp/build/my-agent.zip',
        },
      }

      const contextWithArtifactDir = {
        ...baseContext,
        artifactDirectoryName: 'serverless/test-service/dev/1234',
      }

      const result = compileRuntime(
        'myAgent',
        config,
        contextWithArtifactDir,
        baseTags,
      )

      expect(
        result.Properties.AgentRuntimeArtifact.CodeConfiguration.Code.S3.Prefix,
      ).toBe('serverless/test-service/dev/1234/my-agent.zip')
    })

    test('derives S3 artifact key from relative path', () => {
      const config = {
        artifact: {
          entryPoint: ['main.py'],
          runtime: 'PYTHON_3_13',
        },
        package: {
          artifact: './build/output/agent-code.zip',
        },
      }

      const contextWithArtifactDir = {
        ...baseContext,
        artifactDirectoryName: 'serverless/test-service/dev/1234',
      }

      const result = compileRuntime(
        'myAgent',
        config,
        contextWithArtifactDir,
        baseTags,
      )

      expect(
        result.Properties.AgentRuntimeArtifact.CodeConfiguration.Code.S3.Prefix,
      ).toBe('serverless/test-service/dev/1234/agent-code.zip')
    })
  })
})
