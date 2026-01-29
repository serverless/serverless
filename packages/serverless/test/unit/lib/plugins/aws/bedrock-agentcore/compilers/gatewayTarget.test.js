'use strict'

import { jest } from '@jest/globals'
import path from 'path'

// Mock fs module for ES modules
const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}
jest.unstable_mockModule('fs', () => ({
  default: mockFs,
  ...mockFs,
}))

// Import after mocking
const {
  compileGatewayTarget,
  buildCredentialProviderConfigurations,
  buildTargetConfiguration,
  buildLambdaTarget,
  buildOpenApiTarget,
  buildSmithyTarget,
  buildMcpServerTarget,
  detectTargetType,
  isFilePath,
  transformSchemaToCloudFormation,
  resolveFunctionArn,
  resolveToolSchema,
} =
  await import('../../../../../../../lib/plugins/aws/bedrock-agentcore/compilers/gatewayTarget.js')

describe('GatewayTarget Compiler', () => {
  const mockServiceDir = '/test/service'

  beforeEach(() => {
    jest.clearAllMocks()
    mockFs.existsSync.mockReturnValue(true)
  })

  describe('detectTargetType', () => {
    test('detects function type', () => {
      expect(detectTargetType({ function: 'hello' })).toBe('function')
    })

    test('detects openapi type', () => {
      expect(detectTargetType({ openapi: 'openapi.yml' })).toBe('openapi')
    })

    test('detects smithy type', () => {
      expect(detectTargetType({ smithy: 'model.smithy' })).toBe('smithy')
    })

    test('detects mcp type', () => {
      expect(detectTargetType({ mcp: 'https://mcp.example.com' })).toBe('mcp')
    })

    test('throws error when no type specified', () => {
      expect(() => detectTargetType({})).toThrow(
        'Tool configuration must have one of: function, openapi, smithy, or mcp',
      )
    })
  })

  describe('isFilePath', () => {
    test('returns true for paths with slashes', () => {
      expect(isFilePath('./schema.json')).toBe(true)
      expect(isFilePath('config/openapi.yml')).toBe(true)
    })

    test('returns true for common file extensions', () => {
      expect(isFilePath('openapi.yml')).toBe(true)
      expect(isFilePath('openapi.yaml')).toBe(true)
      expect(isFilePath('schema.json')).toBe(true)
      expect(isFilePath('model.smithy')).toBe(true)
    })

    test('returns false for inline content', () => {
      expect(isFilePath('openapi: 3.0.0')).toBe(false)
      expect(isFilePath('{ "type": "object" }')).toBe(false)
    })

    test('returns false for null/undefined', () => {
      expect(isFilePath(null)).toBe(false)
      expect(isFilePath(undefined)).toBe(false)
    })
  })

  describe('buildCredentialProviderConfigurations', () => {
    test('defaults to GATEWAY_IAM_ROLE when no credentials', () => {
      const result = buildCredentialProviderConfigurations(null)
      expect(result).toEqual([{ CredentialProviderType: 'GATEWAY_IAM_ROLE' }])
    })

    test('defaults to GATEWAY_IAM_ROLE when empty credentials', () => {
      const result = buildCredentialProviderConfigurations({})
      expect(result).toEqual([{ CredentialProviderType: 'GATEWAY_IAM_ROLE' }])
    })

    test('builds OAUTH configuration (new property names)', () => {
      const credentials = {
        type: 'OAUTH',
        provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
        scopes: ['read', 'write'],
      }

      const result = buildCredentialProviderConfigurations(credentials)

      expect(result).toEqual([
        {
          CredentialProviderType: 'OAUTH',
          CredentialProvider: {
            OauthCredentialProvider: {
              ProviderArn:
                'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
              Scopes: ['read', 'write'],
            },
          },
        },
      ])
    })

    test('builds OAUTH with optional properties', () => {
      const credentials = {
        type: 'OAUTH',
        provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
        scopes: ['read'],
        grantType: 'CLIENT_CREDENTIALS',
        defaultReturnUrl: 'https://example.com/callback',
        customParameters: { tenant: 'my-tenant' },
      }

      const result = buildCredentialProviderConfigurations(credentials)

      expect(result[0].CredentialProvider.OauthCredentialProvider).toEqual({
        ProviderArn: 'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
        Scopes: ['read'],
        GrantType: 'CLIENT_CREDENTIALS',
        DefaultReturnUrl: 'https://example.com/callback',
        CustomParameters: { tenant: 'my-tenant' },
      })
    })

    test('handles lowercase grantType (case-insensitive)', () => {
      const credentials = {
        type: 'oauth',
        provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
        scopes: ['read'],
        grantType: 'client_credentials',
      }

      const result = buildCredentialProviderConfigurations(credentials)

      expect(result[0].CredentialProviderType).toBe('OAUTH')
      expect(
        result[0].CredentialProvider.OauthCredentialProvider.GrantType,
      ).toBe('CLIENT_CREDENTIALS')
    })

    test('throws error when OAUTH missing provider', () => {
      const credentials = {
        type: 'OAUTH',
        scopes: ['read'],
      }

      expect(() => buildCredentialProviderConfigurations(credentials)).toThrow(
        'OAUTH credentials require provider and scopes',
      )
    })

    test('throws error when OAUTH missing scopes', () => {
      const credentials = {
        type: 'OAUTH',
        provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
      }

      expect(() => buildCredentialProviderConfigurations(credentials)).toThrow(
        'OAUTH credentials require provider and scopes',
      )
    })

    test('builds API_KEY configuration (new property names)', () => {
      const credentials = {
        type: 'API_KEY',
        provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:apikey',
      }

      const result = buildCredentialProviderConfigurations(credentials)

      expect(result).toEqual([
        {
          CredentialProviderType: 'API_KEY',
          CredentialProvider: {
            ApiKeyCredentialProvider: {
              ProviderArn:
                'arn:aws:secretsmanager:us-east-1:123456789:secret:apikey',
            },
          },
        },
      ])
    })

    test('builds API_KEY with optional properties (new property names)', () => {
      const credentials = {
        type: 'API_KEY',
        provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:apikey',
        location: 'HEADER',
        parameterName: 'X-API-Key',
        prefix: 'Bearer ',
      }

      const result = buildCredentialProviderConfigurations(credentials)

      expect(result[0].CredentialProvider.ApiKeyCredentialProvider).toEqual({
        ProviderArn: 'arn:aws:secretsmanager:us-east-1:123456789:secret:apikey',
        CredentialLocation: 'HEADER',
        CredentialParameterName: 'X-API-Key',
        CredentialPrefix: 'Bearer ',
      })
    })

    test('handles lowercase location (case-insensitive)', () => {
      const credentials = {
        type: 'api_key',
        provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:apikey',
        location: 'header',
      }

      const result = buildCredentialProviderConfigurations(credentials)

      expect(result[0].CredentialProviderType).toBe('API_KEY')
      expect(
        result[0].CredentialProvider.ApiKeyCredentialProvider
          .CredentialLocation,
      ).toBe('HEADER')
    })

    test('throws error when API_KEY missing provider', () => {
      const credentials = {
        type: 'API_KEY',
      }

      expect(() => buildCredentialProviderConfigurations(credentials)).toThrow(
        'API_KEY credentials require provider',
      )
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

  describe('resolveFunctionArn', () => {
    test('resolves string function name to Fn::GetAtt', () => {
      const result = resolveFunctionArn('hello')

      expect(result).toEqual({
        'Fn::GetAtt': ['HelloLambdaFunction', 'Arn'],
      })
    })

    test('resolves hyphenated function name', () => {
      const result = resolveFunctionArn('my-function')

      expect(result).toEqual({
        'Fn::GetAtt': ['MyDashfunctionLambdaFunction', 'Arn'],
      })
    })

    test('resolves object with arn directly', () => {
      const result = resolveFunctionArn({
        arn: 'arn:aws:lambda:us-east-1:123456789:function:my-fn',
      })

      expect(result).toBe('arn:aws:lambda:us-east-1:123456789:function:my-fn')
    })

    test('resolves object with name', () => {
      const result = resolveFunctionArn({ name: 'my-function' })

      expect(result).toEqual({
        'Fn::GetAtt': ['MyDashfunctionLambdaFunction', 'Arn'],
      })
    })

    test('throws error when no function name or ARN', () => {
      expect(() => resolveFunctionArn({})).toThrow(
        'Function tool requires function name or ARN',
      )
    })
  })

  describe('resolveToolSchema', () => {
    test('resolves inline array', () => {
      const toolSchema = [
        {
          name: 'greet',
          description: 'Greets a user',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      ]

      const result = resolveToolSchema(toolSchema, mockServiceDir)

      expect(result).toEqual({
        InlinePayload: [
          {
            Name: 'greet',
            Description: 'Greets a user',
            InputSchema: {
              Type: 'object',
              Properties: { name: { Type: 'string' } },
            },
          },
        ],
      })
    })

    test('resolves file path', () => {
      const fileContents = JSON.stringify([
        {
          name: 'myTool',
          description: 'A tool',
          inputSchema: { type: 'string' },
        },
      ])
      mockFs.readFileSync.mockReturnValue(fileContents)

      const result = resolveToolSchema('tools.json', mockServiceDir)

      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        path.resolve(mockServiceDir, 'tools.json'),
        'utf-8',
      )
      expect(result.InlinePayload[0].Name).toBe('myTool')
    })

    test('throws error when file not found', () => {
      mockFs.existsSync.mockReturnValue(false)

      expect(() => resolveToolSchema('missing.json', mockServiceDir)).toThrow(
        'Tool schema/spec file not found: missing.json',
      )
    })

    test('throws error when no toolSchema provided', () => {
      expect(() => resolveToolSchema(null, mockServiceDir)).toThrow(
        'Function tool requires toolSchema',
      )
    })

    test('includes outputSchema when present', () => {
      const toolSchema = [
        {
          name: 'myTool',
          description: 'A tool',
          inputSchema: { type: 'string' },
          outputSchema: { type: 'object' },
        },
      ]

      const result = resolveToolSchema(toolSchema, mockServiceDir)

      expect(result.InlinePayload[0].OutputSchema).toEqual({ Type: 'object' })
    })
  })

  describe('buildLambdaTarget', () => {
    test('builds with function name reference', () => {
      const toolSchema = [
        { name: 'test', description: 'Test', inputSchema: { type: 'string' } },
      ]
      const config = {
        function: 'hello',
        toolSchema,
      }

      const result = buildLambdaTarget(config, mockServiceDir)

      expect(result).toEqual({
        Mcp: {
          Lambda: {
            LambdaArn: { 'Fn::GetAtt': ['HelloLambdaFunction', 'Arn'] },
            ToolSchema: {
              InlinePayload: [
                {
                  Name: 'test',
                  Description: 'Test',
                  InputSchema: { Type: 'string' },
                },
              ],
            },
          },
        },
      })
    })

    test('builds with direct ARN', () => {
      const toolSchema = [
        { name: 'test', description: 'Test', inputSchema: { type: 'string' } },
      ]
      const config = {
        function: { arn: 'arn:aws:lambda:us-east-1:123456789:function:hello' },
        toolSchema,
      }

      const result = buildLambdaTarget(config, mockServiceDir)

      expect(result.Mcp.Lambda.LambdaArn).toBe(
        'arn:aws:lambda:us-east-1:123456789:function:hello',
      )
    })
  })

  describe('buildOpenApiTarget', () => {
    test('builds with file path', () => {
      mockFs.readFileSync.mockReturnValue('openapi: 3.0.0')
      const config = { openapi: 'openapi.yml' }

      const result = buildOpenApiTarget(config, mockServiceDir)

      expect(result).toEqual({
        Mcp: {
          OpenApiSchema: {
            InlinePayload: 'openapi: 3.0.0',
          },
        },
      })
    })

    test('builds with inline content', () => {
      const config = { openapi: 'openapi: 3.0.0\ninfo:\n  title: My API' }

      const result = buildOpenApiTarget(config, mockServiceDir)

      expect(result).toEqual({
        Mcp: {
          OpenApiSchema: {
            InlinePayload: 'openapi: 3.0.0\ninfo:\n  title: My API',
          },
        },
      })
    })
  })

  describe('buildSmithyTarget', () => {
    test('builds with file path', () => {
      mockFs.readFileSync.mockReturnValue(
        'namespace com.example\nservice MyService {}',
      )
      const config = { smithy: 'model.smithy' }

      const result = buildSmithyTarget(config, mockServiceDir)

      expect(result).toEqual({
        Mcp: {
          SmithyModel: {
            InlinePayload: 'namespace com.example\nservice MyService {}',
          },
        },
      })
    })

    test('builds with inline content', () => {
      const config = { smithy: 'namespace com.example' }

      const result = buildSmithyTarget(config, mockServiceDir)

      expect(result).toEqual({
        Mcp: {
          SmithyModel: {
            InlinePayload: 'namespace com.example',
          },
        },
      })
    })
  })

  describe('buildMcpServerTarget', () => {
    test('builds with https endpoint', () => {
      const config = { mcp: 'https://mcp.linear.app/mcp' }

      const result = buildMcpServerTarget(config)

      expect(result).toEqual({
        Mcp: {
          McpServer: {
            Endpoint: 'https://mcp.linear.app/mcp',
          },
        },
      })
    })

    test('throws error for non-https endpoint', () => {
      const config = { mcp: 'http://insecure.example.com' }

      expect(() => buildMcpServerTarget(config)).toThrow(
        'MCP server endpoint must be a valid https:// URL',
      )
    })

    test('throws error for empty endpoint', () => {
      const config = { mcp: '' }

      expect(() => buildMcpServerTarget(config)).toThrow(
        'MCP server endpoint must be a valid https:// URL',
      )
    })
  })

  describe('buildTargetConfiguration', () => {
    test('delegates to lambda builder for function type', () => {
      const toolSchema = [
        { name: 'test', description: 'Test', inputSchema: { type: 'string' } },
      ]
      const config = { function: 'hello', toolSchema }

      const result = buildTargetConfiguration(config, mockServiceDir)

      expect(result.Mcp.Lambda).toBeDefined()
    })

    test('delegates to openapi builder for openapi type', () => {
      const config = { openapi: 'openapi: 3.0.0' }

      const result = buildTargetConfiguration(config, mockServiceDir)

      expect(result.Mcp.OpenApiSchema).toBeDefined()
    })

    test('delegates to smithy builder for smithy type', () => {
      const config = { smithy: 'namespace test' }

      const result = buildTargetConfiguration(config, mockServiceDir)

      expect(result.Mcp.SmithyModel).toBeDefined()
    })

    test('delegates to mcp builder for mcp type', () => {
      const config = { mcp: 'https://example.com/mcp' }

      const result = buildTargetConfiguration(config, mockServiceDir)

      expect(result.Mcp.McpServer).toBeDefined()
    })
  })

  describe('compileGatewayTarget', () => {
    test('generates valid CloudFormation for Lambda tool', () => {
      const toolSchema = [
        {
          name: 'greet',
          description: 'Greets a user',
          inputSchema: { type: 'string' },
        },
      ]
      const config = {
        function: 'hello',
        toolSchema,
        description: 'Greeting tool',
      }

      const result = compileGatewayTarget(
        'my-tool',
        config,
        'AgentCoreGateway',
        mockServiceDir,
      )

      expect(result.Type).toBe('AWS::BedrockAgentCore::GatewayTarget')
      expect(result.DependsOn).toEqual(['AgentCoreGateway'])
      expect(result.Properties.Name).toBe('my-tool')
      expect(result.Properties.GatewayIdentifier).toEqual({
        'Fn::GetAtt': ['AgentCoreGateway', 'GatewayIdentifier'],
      })
      expect(result.Properties.Description).toBe('Greeting tool')
      expect(result.Properties.CredentialProviderConfigurations).toHaveLength(1)
      expect(result.Properties.TargetConfiguration.Mcp.Lambda).toBeDefined()
    })

    test('generates valid CloudFormation for MCP tool with credentials (new property names)', () => {
      const config = {
        mcp: 'https://mcp.example.com/mcp',
        credentials: {
          type: 'OAUTH',
          provider: 'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
          scopes: ['read'],
        },
      }

      const result = compileGatewayTarget(
        'external-mcp',
        config,
        'AgentCoreGateway',
        mockServiceDir,
      )

      expect(result.Properties.CredentialProviderConfigurations[0]).toEqual({
        CredentialProviderType: 'OAUTH',
        CredentialProvider: {
          OauthCredentialProvider: {
            ProviderArn:
              'arn:aws:secretsmanager:us-east-1:123456789:secret:oauth',
            Scopes: ['read'],
          },
        },
      })
      expect(result.Properties.TargetConfiguration.Mcp.McpServer.Endpoint).toBe(
        'https://mcp.example.com/mcp',
      )
    })
  })
})
