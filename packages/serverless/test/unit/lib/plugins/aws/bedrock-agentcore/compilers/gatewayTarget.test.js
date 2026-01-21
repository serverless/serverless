'use strict'

import {
  compileGatewayTarget,
  buildCredentialProviderConfigurations,
  buildTargetConfiguration,
  buildLambdaTargetConfiguration,
  buildOpenApiTargetConfiguration,
  buildSmithyTargetConfiguration,
  transformSchemaToCloudFormation,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/gatewayTarget.js'

describe('GatewayTarget Compiler', () => {
  const baseContext = {
    serviceName: 'test-service',
    stage: 'dev',
    region: 'us-west-2',
    accountId: '123456789012',
    customConfig: {},
    defaultTags: {},
  }

  describe('buildCredentialProviderConfigurations', () => {
    test('defaults to GATEWAY_IAM_ROLE', () => {
      const result = buildCredentialProviderConfigurations(null)

      expect(result).toEqual([{ CredentialProviderType: 'GATEWAY_IAM_ROLE' }])
    })

    test('builds OAuth configuration with CredentialProvider wrapper', () => {
      const credProvider = {
        type: 'OAUTH',
        oauthConfig: {
          providerArn:
            'arn:aws:secretsmanager:us-west-2:123456789012:secret:my-oauth',
          scopes: ['read', 'write'],
          grantType: 'CLIENT_CREDENTIALS',
        },
      }

      const result = buildCredentialProviderConfigurations(credProvider)

      expect(result).toEqual([
        {
          CredentialProviderType: 'OAUTH',
          CredentialProvider: {
            OauthCredentialProvider: {
              ProviderArn:
                'arn:aws:secretsmanager:us-west-2:123456789012:secret:my-oauth',
              Scopes: ['read', 'write'],
              GrantType: 'CLIENT_CREDENTIALS',
            },
          },
        },
      ])
    })

    test('builds OAuth configuration with optional properties', () => {
      const credProvider = {
        type: 'OAUTH',
        oauthConfig: {
          providerArn:
            'arn:aws:secretsmanager:us-west-2:123456789012:secret:my-oauth',
          scopes: ['read'],
          defaultReturnUrl: 'https://example.com/callback',
          customParameters: { tenant: 'my-tenant' },
        },
      }

      const result = buildCredentialProviderConfigurations(credProvider)

      expect(result[0].CredentialProvider.OauthCredentialProvider).toEqual({
        ProviderArn:
          'arn:aws:secretsmanager:us-west-2:123456789012:secret:my-oauth',
        Scopes: ['read'],
        DefaultReturnUrl: 'https://example.com/callback',
        CustomParameters: { tenant: 'my-tenant' },
      })
    })

    test('builds API Key configuration with CredentialProvider wrapper', () => {
      const credProvider = {
        type: 'API_KEY',
        apiKeyConfig: {
          providerArn:
            'arn:aws:secretsmanager:us-west-2:123456789012:secret:api-key',
        },
      }

      const result = buildCredentialProviderConfigurations(credProvider)

      expect(result).toEqual([
        {
          CredentialProviderType: 'API_KEY',
          CredentialProvider: {
            ApiKeyCredentialProvider: {
              ProviderArn:
                'arn:aws:secretsmanager:us-west-2:123456789012:secret:api-key',
            },
          },
        },
      ])
    })

    test('builds API Key configuration with optional properties', () => {
      const credProvider = {
        type: 'API_KEY',
        apiKeyConfig: {
          providerArn:
            'arn:aws:secretsmanager:us-west-2:123456789012:secret:api-key',
          credentialLocation: 'HEADER',
          credentialParameterName: 'X-API-Key',
          credentialPrefix: 'Bearer ',
        },
      }

      const result = buildCredentialProviderConfigurations(credProvider)

      expect(result[0].CredentialProvider.ApiKeyCredentialProvider).toEqual({
        ProviderArn:
          'arn:aws:secretsmanager:us-west-2:123456789012:secret:api-key',
        CredentialLocation: 'HEADER',
        CredentialParameterName: 'X-API-Key',
        CredentialPrefix: 'Bearer ',
      })
    })

    test('handles GATEWAY_IAM_ROLE type explicitly', () => {
      const credProvider = {
        type: 'GATEWAY_IAM_ROLE',
      }

      const result = buildCredentialProviderConfigurations(credProvider)

      expect(result).toEqual([{ CredentialProviderType: 'GATEWAY_IAM_ROLE' }])
    })
  })

  describe('transformSchemaToCloudFormation', () => {
    test('transforms simple schema', () => {
      const schema = {
        type: 'object',
        description: 'Test schema',
      }

      const result = transformSchemaToCloudFormation(schema)

      expect(result).toEqual({
        Type: 'object',
        Description: 'Test schema',
      })
    })

    test('transforms nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name field' },
          age: { type: 'integer' },
        },
        required: ['name'],
      }

      const result = transformSchemaToCloudFormation(schema)

      expect(result).toEqual({
        Type: 'object',
        Properties: {
          name: { Type: 'string', Description: 'Name field' },
          age: { Type: 'integer' },
        },
        Required: ['name'],
      })
    })

    test('transforms array items', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
      }

      const result = transformSchemaToCloudFormation(schema)

      expect(result).toEqual({
        Type: 'array',
        Items: { Type: 'string' },
      })
    })

    test('returns non-object values unchanged', () => {
      expect(transformSchemaToCloudFormation(null)).toBeNull()
      expect(transformSchemaToCloudFormation('string')).toBe('string')
    })
  })

  describe('buildLambdaTargetConfiguration', () => {
    test('builds with functionArn', () => {
      const target = {
        type: 'lambda',
        functionArn:
          'arn:aws:lambda:us-west-2:123456789012:function:my-function',
      }

      const result = buildLambdaTargetConfiguration(target, baseContext)

      expect(result).toEqual({
        Mcp: {
          Lambda: {
            LambdaArn:
              'arn:aws:lambda:us-west-2:123456789012:function:my-function',
          },
        },
      })
    })

    test('builds with functionName reference', () => {
      const target = {
        type: 'lambda',
        functionName: 'my-function',
      }

      const result = buildLambdaTargetConfiguration(target, baseContext)

      expect(result).toEqual({
        Mcp: {
          Lambda: {
            LambdaArn: { 'Fn::GetAtt': ['MyFunctionLambdaFunction', 'Arn'] },
          },
        },
      })
    })

    test('includes tool schema with inline payload', () => {
      const target = {
        type: 'lambda',
        functionArn:
          'arn:aws:lambda:us-west-2:123456789012:function:my-function',
        toolSchema: {
          inlinePayload: [
            {
              name: 'myTool',
              description: 'A tool',
              inputSchema: { type: 'object' },
            },
          ],
        },
      }

      const result = buildLambdaTargetConfiguration(target, baseContext)

      expect(result.Mcp.Lambda.ToolSchema).toEqual({
        InlinePayload: [
          {
            Name: 'myTool',
            Description: 'A tool',
            InputSchema: { Type: 'object' },
          },
        ],
      })
    })

    test('includes tool schema with S3 reference', () => {
      const target = {
        type: 'lambda',
        functionArn:
          'arn:aws:lambda:us-west-2:123456789012:function:my-function',
        toolSchema: {
          s3: {
            bucket: 'my-bucket',
            key: 'tools.json',
          },
        },
      }

      const result = buildLambdaTargetConfiguration(target, baseContext)

      expect(result.Mcp.Lambda.ToolSchema).toEqual({
        S3: {
          Uri: 's3://my-bucket/tools.json',
        },
      })
    })
  })

  describe('buildOpenApiTargetConfiguration', () => {
    test('builds with S3 configuration', () => {
      const target = {
        type: 'openapi',
        s3: {
          bucket: 'my-bucket',
          key: 'specs/openapi.yaml',
        },
      }

      const result = buildOpenApiTargetConfiguration(target)

      expect(result).toEqual({
        Mcp: {
          OpenApiSchema: {
            S3: {
              Uri: 's3://my-bucket/specs/openapi.yaml',
            },
          },
        },
      })
    })

    test('builds with inline payload', () => {
      const target = {
        type: 'openapi',
        inlinePayload: 'openapi: 3.0.0\ninfo:\n  title: My API',
      }

      const result = buildOpenApiTargetConfiguration(target)

      expect(result.Mcp.OpenApiSchema.InlinePayload).toBe(
        'openapi: 3.0.0\ninfo:\n  title: My API',
      )
    })

    test('builds with S3 URI directly', () => {
      const target = {
        type: 'openapi',
        s3: { uri: 's3://my-bucket/api.yaml' },
      }

      const result = buildOpenApiTargetConfiguration(target)

      expect(result.Mcp.OpenApiSchema.S3.Uri).toBe('s3://my-bucket/api.yaml')
    })

    test('includes bucketOwnerAccountId when provided', () => {
      const target = {
        type: 'openapi',
        s3: {
          bucket: 'my-bucket',
          key: 'api.yaml',
          bucketOwnerAccountId: '987654321098',
        },
      }

      const result = buildOpenApiTargetConfiguration(target)

      expect(result.Mcp.OpenApiSchema.S3.BucketOwnerAccountId).toBe(
        '987654321098',
      )
    })
  })

  describe('buildSmithyTargetConfiguration', () => {
    test('builds with S3 configuration', () => {
      const target = {
        type: 'smithy',
        s3: {
          bucket: 'my-bucket',
          key: 'models/service.smithy',
        },
      }

      const result = buildSmithyTargetConfiguration(target)

      expect(result).toEqual({
        Mcp: {
          SmithyModel: {
            S3: {
              Uri: 's3://my-bucket/models/service.smithy',
            },
          },
        },
      })
    })

    test('builds with inline payload', () => {
      const target = {
        type: 'smithy',
        inlinePayload: 'namespace com.example\nservice MyService {}',
      }

      const result = buildSmithyTargetConfiguration(target)

      expect(result.Mcp.SmithyModel.InlinePayload).toBe(
        'namespace com.example\nservice MyService {}',
      )
    })
  })

  describe('buildTargetConfiguration', () => {
    test('delegates to lambda builder for lambda type', () => {
      const target = {
        type: 'lambda',
        functionArn:
          'arn:aws:lambda:us-west-2:123456789012:function:my-function',
      }

      const result = buildTargetConfiguration(target, baseContext)

      expect(result.Mcp.Lambda).toBeDefined()
    })

    test('delegates to openapi builder for openapi type', () => {
      const target = {
        type: 'openapi',
        s3: { bucket: 'bucket', key: 'key' },
      }

      const result = buildTargetConfiguration(target, baseContext)

      expect(result.Mcp.OpenApiSchema).toBeDefined()
    })

    test('delegates to smithy builder for smithy type', () => {
      const target = {
        type: 'smithy',
        s3: { bucket: 'bucket', key: 'key' },
      }

      const result = buildTargetConfiguration(target, baseContext)

      expect(result.Mcp.SmithyModel).toBeDefined()
    })

    test('defaults to lambda when type not specified', () => {
      const target = {
        functionArn:
          'arn:aws:lambda:us-west-2:123456789012:function:my-function',
      }

      const result = buildTargetConfiguration(target, baseContext)

      expect(result.Mcp.Lambda).toBeDefined()
    })

    test('throws error for unknown target type', () => {
      const target = {
        type: 'unknown',
      }

      expect(() => buildTargetConfiguration(target, baseContext)).toThrow(
        'Unknown gateway target type: unknown',
      )
    })
  })

  describe('compileGatewayTarget', () => {
    test('generates valid CloudFormation for Lambda target', () => {
      const config = {
        name: 'order-api',
        type: 'lambda',
        functionArn:
          'arn:aws:lambda:us-west-2:123456789012:function:my-function',
        description: 'Order API tool',
      }

      const result = compileGatewayTarget(
        'toolGateway',
        'order-api',
        config,
        'ToolgatewayGateway',
        baseContext,
      )

      expect(result.Type).toBe('AWS::BedrockAgentCore::GatewayTarget')
      expect(result.DependsOn).toEqual(['ToolgatewayGateway'])
      expect(result.Properties.Name).toBe('order-api')
      expect(result.Properties.GatewayIdentifier).toEqual({
        'Fn::GetAtt': ['ToolgatewayGateway', 'GatewayIdentifier'],
      })
      expect(result.Properties.Description).toBe('Order API tool')
      expect(result.Properties.CredentialProviderConfigurations).toHaveLength(1)
      expect(result.Properties.TargetConfiguration).toHaveProperty('Mcp')
      expect(result.Properties.TargetConfiguration.Mcp).toHaveProperty('Lambda')
    })

    test('generates valid CloudFormation for OpenAPI target', () => {
      const config = {
        name: 'rest-api',
        type: 'openapi',
        s3: {
          bucket: 'my-bucket',
          key: 'openapi.yaml',
        },
      }

      const result = compileGatewayTarget(
        'toolGateway',
        'rest-api',
        config,
        'ToolgatewayGateway',
        baseContext,
      )

      expect(result.Properties.TargetConfiguration).toHaveProperty('Mcp')
      expect(result.Properties.TargetConfiguration.Mcp).toHaveProperty(
        'OpenApiSchema',
      )
    })

    test('includes credential provider configuration', () => {
      const config = {
        name: 'oauth-api',
        type: 'lambda',
        functionArn:
          'arn:aws:lambda:us-west-2:123456789012:function:my-function',
        credentialProvider: {
          type: 'OAUTH',
          oauthConfig: {
            providerArn:
              'arn:aws:secretsmanager:us-west-2:123456789012:secret:oauth',
            scopes: ['read'],
          },
        },
      }

      const result = compileGatewayTarget(
        'toolGateway',
        'oauth-api',
        config,
        'ToolgatewayGateway',
        baseContext,
      )

      expect(result.Properties.CredentialProviderConfigurations[0]).toEqual({
        CredentialProviderType: 'OAUTH',
        CredentialProvider: {
          OauthCredentialProvider: {
            ProviderArn:
              'arn:aws:secretsmanager:us-west-2:123456789012:secret:oauth',
            Scopes: ['read'],
          },
        },
      })
    })
  })
})
