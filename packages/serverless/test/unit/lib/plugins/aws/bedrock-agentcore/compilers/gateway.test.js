'use strict'

import {
  compileGateway,
  buildGatewayAuthorizerConfiguration,
  buildGatewayProtocolConfiguration,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/gateway.js'

describe('Gateway Compiler', () => {
  const baseContext = {
    serviceName: 'test-service',
    stage: 'dev',
    region: 'us-west-2',
    accountId: '123456789012',
    customConfig: {},
    defaultTags: {},
  }

  const baseTags = {
    'serverless:service': 'test-service',
    'serverless:stage': 'dev',
    'agentcore:resource': 'toolGateway',
  }

  describe('buildGatewayAuthorizerConfiguration', () => {
    test('returns null for empty config', () => {
      expect(buildGatewayAuthorizerConfiguration(null)).toBeNull()
    })

    test('returns null when customJwtAuthorizer is missing', () => {
      expect(buildGatewayAuthorizerConfiguration({})).toBeNull()
    })

    test('throws error when discoveryUrl is missing', () => {
      const authConfig = {
        customJwtAuthorizer: {
          allowedAudience: ['api://my-api'],
        },
      }

      expect(() => buildGatewayAuthorizerConfiguration(authConfig)).toThrow(
        'Gateway CustomJWTAuthorizer requires discoveryUrl',
      )
    })

    test('builds authorizer configuration with required discoveryUrl', () => {
      const authConfig = {
        customJwtAuthorizer: {
          discoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
          allowedAudience: ['api://my-api'],
          allowedClients: ['client-123'],
        },
      }

      const result = buildGatewayAuthorizerConfiguration(authConfig)

      expect(result).toEqual({
        CustomJWTAuthorizer: {
          DiscoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
          AllowedAudience: ['api://my-api'],
          AllowedClients: ['client-123'],
        },
      })
    })

    test('builds authorizer configuration with allowedScopes', () => {
      const authConfig = {
        customJwtAuthorizer: {
          discoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
          allowedScopes: ['read', 'write'],
        },
      }

      const result = buildGatewayAuthorizerConfiguration(authConfig)

      expect(result).toEqual({
        CustomJWTAuthorizer: {
          DiscoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
          AllowedScopes: ['read', 'write'],
        },
      })
    })

    test('builds authorizer configuration with only required fields', () => {
      const authConfig = {
        customJwtAuthorizer: {
          discoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
        },
      }

      const result = buildGatewayAuthorizerConfiguration(authConfig)

      expect(result).toEqual({
        CustomJWTAuthorizer: {
          DiscoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
        },
      })
    })
  })

  describe('buildGatewayProtocolConfiguration', () => {
    test('returns null for empty config', () => {
      expect(buildGatewayProtocolConfiguration(null)).toBeNull()
    })

    test('returns null when mcp is missing', () => {
      expect(buildGatewayProtocolConfiguration({})).toBeNull()
    })

    test('builds MCP protocol configuration with instructions', () => {
      const protocolConfig = {
        mcp: {
          instructions: 'Use these tools to interact with the system',
          supportedVersions: ['2024-11-05'],
        },
      }

      const result = buildGatewayProtocolConfiguration(protocolConfig)

      expect(result).toEqual({
        Mcp: {
          Instructions: 'Use these tools to interact with the system',
          SupportedVersions: ['2024-11-05'],
        },
      })
    })

    test('builds MCP protocol configuration with searchType', () => {
      const protocolConfig = {
        mcp: {
          searchType: 'SEMANTIC',
        },
      }

      const result = buildGatewayProtocolConfiguration(protocolConfig)

      expect(result).toEqual({
        Mcp: {
          SearchType: 'SEMANTIC',
        },
      })
    })
  })

  describe('compileGateway', () => {
    test('generates valid CloudFormation with minimal config', () => {
      const config = {
        type: 'gateway',
      }

      const result = compileGateway(
        'toolGateway',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Type).toBe('AWS::BedrockAgentCore::Gateway')
      expect(result.Properties.Name).toBe('test-service-toolGateway-dev')
      expect(result.Properties.AuthorizerType).toBe('AWS_IAM')
      expect(result.Properties.ProtocolType).toBe('MCP')
      expect(result.Properties.RoleArn).toEqual({
        'Fn::GetAtt': ['ToolGatewayGatewayRole', 'Arn'],
      })
    })

    test('includes optional properties when provided', () => {
      const config = {
        type: 'gateway',
        description: 'Gateway for agent tools',
        authorizerType: 'CUSTOM_JWT',
        kmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/12345678',
        exceptionLevel: 'DEBUG',
        authorizerConfiguration: {
          customJwtAuthorizer: {
            discoveryUrl:
              'https://auth.example.com/.well-known/openid-configuration',
            allowedAudience: ['api://my-api'],
          },
        },
      }

      const result = compileGateway(
        'toolGateway',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.Description).toBe('Gateway for agent tools')
      expect(result.Properties.AuthorizerType).toBe('CUSTOM_JWT')
      expect(result.Properties.KmsKeyArn).toBe(
        'arn:aws:kms:us-west-2:123456789012:key/12345678',
      )
      expect(result.Properties.ExceptionLevel).toBe('DEBUG')
      expect(result.Properties.AuthorizerConfiguration).toEqual({
        CustomJWTAuthorizer: {
          DiscoveryUrl:
            'https://auth.example.com/.well-known/openid-configuration',
          AllowedAudience: ['api://my-api'],
        },
      })
    })

    test('includes protocol configuration when provided', () => {
      const config = {
        type: 'gateway',
        protocolConfiguration: {
          mcp: {
            instructions: 'Gateway instructions',
            supportedVersions: ['2024-11-05'],
          },
        },
      }

      const result = compileGateway(
        'toolGateway',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.ProtocolConfiguration).toEqual({
        Mcp: {
          Instructions: 'Gateway instructions',
          SupportedVersions: ['2024-11-05'],
        },
      })
    })

    test('uses provided roleArn when specified', () => {
      const config = {
        type: 'gateway',
        roleArn: 'arn:aws:iam::123456789012:role/MyCustomRole',
      }

      const result = compileGateway(
        'toolGateway',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.RoleArn).toBe(
        'arn:aws:iam::123456789012:role/MyCustomRole',
      )
    })

    test('supports NONE authorizer type', () => {
      const config = {
        type: 'gateway',
        authorizerType: 'NONE',
      }

      const result = compileGateway(
        'toolGateway',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.AuthorizerType).toBe('NONE')
      expect(result.Properties.AuthorizerConfiguration).toBeUndefined()
    })

    test('includes tags when provided', () => {
      const config = {
        type: 'gateway',
      }

      const result = compileGateway(
        'toolGateway',
        config,
        baseContext,
        baseTags,
      )

      expect(result.Properties.Tags).toEqual(baseTags)
    })
  })
})
