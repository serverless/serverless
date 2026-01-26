'use strict'

import { jest } from '@jest/globals'
import { defineAgentsSchema } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/validators/schema.js'

describe('Schema Validator', () => {
  let mockServerless
  let capturedAgentsSchema
  let capturedCustomSchema
  let capturedProviderAgentsSchema

  beforeEach(() => {
    capturedAgentsSchema = null
    capturedCustomSchema = null
    capturedProviderAgentsSchema = null

    mockServerless = {
      configSchemaHandler: {
        schema: {
          properties: {
            provider: {
              properties: {},
            },
          },
        },
        defineTopLevelProperty: jest.fn((name, schema) => {
          if (name === 'agents') {
            capturedAgentsSchema = schema
          }
        }),
        defineCustomProperties: jest.fn((schema) => {
          capturedCustomSchema = schema
        }),
      },
    }
  })

  describe('defineAgentsSchema', () => {
    test('defines agents top-level property', () => {
      defineAgentsSchema(mockServerless)

      expect(
        mockServerless.configSchemaHandler.defineTopLevelProperty,
      ).toHaveBeenCalledWith('agents', expect.any(Object))
    })

    test('defines custom properties for agentCore', () => {
      defineAgentsSchema(mockServerless)

      expect(
        mockServerless.configSchemaHandler.defineCustomProperties,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            agentCore: expect.any(Object),
          }),
        }),
      )
    })

    test('agents schema is object type with additionalProperties', () => {
      defineAgentsSchema(mockServerless)

      expect(capturedAgentsSchema.type).toBe('object')
      expect(capturedAgentsSchema.additionalProperties).toBeDefined()
      expect(capturedAgentsSchema.additionalProperties.type).toBe('object')
    })

    test('agent schema has valid type enum including all resource types (excluding memory and gateway)', () => {
      defineAgentsSchema(mockServerless)

      const typeSchema =
        capturedAgentsSchema.additionalProperties.properties.type
      expect(typeSchema.type).toBe('string')
      expect(typeSchema.enum).toContain('runtime')
      expect(typeSchema.enum).toContain('browser')
      expect(typeSchema.enum).toContain('codeInterpreter')
      expect(typeSchema.enum).toContain('workloadIdentity')
      // Memory is now defined via agents.memory or agents.<agent>.memory
      expect(typeSchema.enum).not.toContain('memory')
      // Gateway is now auto-created when tools exist
      expect(typeSchema.enum).not.toContain('gateway')
    })

    test('agents schema includes memory reserved key for shared memory', () => {
      defineAgentsSchema(mockServerless)

      expect(capturedAgentsSchema.properties.memory).toBeDefined()
      expect(capturedAgentsSchema.properties.memory.type).toBe('object')
    })

    test('agent schema includes description property', () => {
      defineAgentsSchema(mockServerless)

      const descSchema =
        capturedAgentsSchema.additionalProperties.properties.description
      expect(descSchema.type).toBe('string')
      expect(descSchema.minLength).toBe(1)
      expect(descSchema.maxLength).toBe(1200)
    })

    test('agent schema includes tags property', () => {
      defineAgentsSchema(mockServerless)

      const tagsSchema =
        capturedAgentsSchema.additionalProperties.properties.tags
      expect(tagsSchema.type).toBe('object')
      expect(tagsSchema.additionalProperties.type).toBe('string')
    })

    test('agent schema includes roleArn with pattern', () => {
      defineAgentsSchema(mockServerless)

      const roleArnSchema =
        capturedAgentsSchema.additionalProperties.properties.roleArn
      expect(roleArnSchema.type).toBe('string')
      expect(roleArnSchema.pattern).toContain('arn:aws')
    })

    // Runtime-specific tests
    describe('runtime schema', () => {
      test('includes artifact property with containerImage and s3', () => {
        defineAgentsSchema(mockServerless)

        const artifactSchema =
          capturedAgentsSchema.additionalProperties.properties.artifact
        expect(artifactSchema.type).toBe('object')
        expect(artifactSchema.properties.containerImage).toBeDefined()
        expect(artifactSchema.properties.s3).toBeDefined()
      })

      test('artifact s3 config includes bucket and key properties', () => {
        defineAgentsSchema(mockServerless)

        const s3Schema =
          capturedAgentsSchema.additionalProperties.properties.artifact
            .properties.s3
        expect(s3Schema.properties.bucket).toBeDefined()
        expect(s3Schema.properties.key).toBeDefined()
        expect(s3Schema.properties.versionId).toBeDefined()
        // bucket and key are not required - if omitted, deployment bucket is used
      })

      test('artifact includes entryPoint and runtime for S3 code deployment', () => {
        defineAgentsSchema(mockServerless)

        const artifactSchema =
          capturedAgentsSchema.additionalProperties.properties.artifact
        expect(artifactSchema.properties.entryPoint).toBeDefined()
        expect(artifactSchema.properties.entryPoint.type).toBe('array')
        expect(artifactSchema.properties.runtime).toBeDefined()
        expect(artifactSchema.properties.runtime.enum).toContain('PYTHON_3_12')
      })

      test('includes protocol property with HTTP, MCP, A2A', () => {
        defineAgentsSchema(mockServerless)

        const protocolSchema =
          capturedAgentsSchema.additionalProperties.properties.protocol
        expect(protocolSchema.type).toBe('string')
        expect(protocolSchema.enum).toContain('HTTP')
        expect(protocolSchema.enum).toContain('MCP')
        expect(protocolSchema.enum).toContain('A2A')
      })

      test('includes network configuration with PUBLIC and VPC modes', () => {
        defineAgentsSchema(mockServerless)

        const networkSchema =
          capturedAgentsSchema.additionalProperties.properties.network
        expect(networkSchema.type).toBe('object')
        expect(networkSchema.properties.networkMode.enum).toContain('PUBLIC')
        expect(networkSchema.properties.networkMode.enum).toContain('VPC')
      })

      test('network vpcConfig includes subnets and securityGroups', () => {
        defineAgentsSchema(mockServerless)

        const vpcConfigSchema =
          capturedAgentsSchema.additionalProperties.properties.network
            .properties.vpcConfig
        expect(vpcConfigSchema.properties.subnets).toBeDefined()
        expect(vpcConfigSchema.properties.securityGroups).toBeDefined()
        expect(vpcConfigSchema.required).toContain('subnets')
        expect(vpcConfigSchema.required).toContain('securityGroups')
      })

      test('includes authorizer configuration with customJwtAuthorizer', () => {
        defineAgentsSchema(mockServerless)

        const authSchema =
          capturedAgentsSchema.additionalProperties.properties.authorizer
        expect(authSchema.type).toBe('object')
        expect(authSchema.properties.customJwtAuthorizer).toBeDefined()
        expect(
          authSchema.properties.customJwtAuthorizer.properties.discoveryUrl,
        ).toBeDefined()
        expect(authSchema.properties.customJwtAuthorizer.required).toContain(
          'discoveryUrl',
        )
      })

      test('includes lifecycle configuration with idleRuntimeSessionTimeout and maxLifetime', () => {
        defineAgentsSchema(mockServerless)

        const lifecycleSchema =
          capturedAgentsSchema.additionalProperties.properties.lifecycle
        expect(lifecycleSchema.type).toBe('object')
        expect(lifecycleSchema.properties.idleRuntimeSessionTimeout.type).toBe(
          'number',
        )
        expect(
          lifecycleSchema.properties.idleRuntimeSessionTimeout.minimum,
        ).toBe(60)
        expect(
          lifecycleSchema.properties.idleRuntimeSessionTimeout.maximum,
        ).toBe(28800)
        expect(lifecycleSchema.properties.maxLifetime.type).toBe('number')
        expect(lifecycleSchema.properties.maxLifetime.minimum).toBe(60)
        expect(lifecycleSchema.properties.maxLifetime.maximum).toBe(28800)
      })

      test('includes endpoints array', () => {
        defineAgentsSchema(mockServerless)

        const endpointsSchema =
          capturedAgentsSchema.additionalProperties.properties.endpoints
        expect(endpointsSchema.type).toBe('array')
        expect(endpointsSchema.items.properties.name).toBeDefined()
        expect(endpointsSchema.items.properties.version).toBeDefined()
      })

      test('includes requestHeaders configuration', () => {
        defineAgentsSchema(mockServerless)

        const requestHeadersSchema =
          capturedAgentsSchema.additionalProperties.properties.requestHeaders
        expect(requestHeadersSchema.type).toBe('object')
        expect(requestHeadersSchema.properties.allowlist.type).toBe('array')
      })

      test('includes environment variables', () => {
        defineAgentsSchema(mockServerless)

        const envSchema =
          capturedAgentsSchema.additionalProperties.properties.environment
        expect(envSchema.type).toBe('object')
        expect(envSchema.additionalProperties.type).toBe('string')
      })
    })

    // Memory configuration tests (inline memory on runtime agents)
    describe('memory schema', () => {
      test('runtime agents include memory property (can be string or object)', () => {
        defineAgentsSchema(mockServerless)

        const memorySchema =
          capturedAgentsSchema.additionalProperties.properties.memory
        expect(memorySchema.anyOf).toBeDefined()
        expect(memorySchema.anyOf).toHaveLength(2)
        // First option: string reference to shared memory
        expect(memorySchema.anyOf[0].type).toBe('string')
        // Second option: inline memory config object
        expect(memorySchema.anyOf[1].type).toBe('object')
      })

      test('shared memory schema includes expiration with range 7-365', () => {
        defineAgentsSchema(mockServerless)

        const memorySchema = capturedAgentsSchema.properties.memory
        const expirySchema =
          memorySchema.additionalProperties.properties.expiration
        expect(expirySchema.type).toBe('number')
        expect(expirySchema.minimum).toBe(7)
        expect(expirySchema.maximum).toBe(365)
      })

      test('shared memory schema includes strategies array', () => {
        defineAgentsSchema(mockServerless)

        const memorySchema = capturedAgentsSchema.properties.memory
        const strategiesSchema =
          memorySchema.additionalProperties.properties.strategies
        expect(strategiesSchema.type).toBe('array')
        expect(strategiesSchema.items.type).toBe('object')
        expect(strategiesSchema.items.additionalProperties).toBe(true)
      })

      test('shared memory schema includes encryptionKey', () => {
        defineAgentsSchema(mockServerless)

        const memorySchema = capturedAgentsSchema.properties.memory
        const encryptionSchema =
          memorySchema.additionalProperties.properties.encryptionKey
        expect(encryptionSchema.type).toBe('string')
      })
    })

    // Tools schema tests
    describe('tools schema', () => {
      test('agents schema includes tools reserved key for shared tools', () => {
        defineAgentsSchema(mockServerless)

        expect(capturedAgentsSchema.properties.tools).toBeDefined()
        expect(capturedAgentsSchema.properties.tools.type).toBe('object')
      })

      test('agent schema includes tools property for agent-level tools', () => {
        defineAgentsSchema(mockServerless)

        const toolsSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
        expect(toolsSchema.type).toBe('object')
      })

      test('tool config supports string reference or inline object', () => {
        defineAgentsSchema(mockServerless)

        const toolsSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
        expect(toolsSchema.additionalProperties.anyOf).toBeDefined()
        expect(toolsSchema.additionalProperties.anyOf).toHaveLength(2)
        // String reference
        expect(toolsSchema.additionalProperties.anyOf[0].type).toBe('string')
        // Inline object
        expect(toolsSchema.additionalProperties.anyOf[1].type).toBe('object')
      })

      test('tool config includes function, openapi, smithy, mcp keys', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
            .additionalProperties.anyOf[1]
        expect(toolConfigSchema.properties.function).toBeDefined()
        expect(toolConfigSchema.properties.openapi).toBeDefined()
        expect(toolConfigSchema.properties.smithy).toBeDefined()
        expect(toolConfigSchema.properties.mcp).toBeDefined()
      })

      test('tool function can be string or object', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
            .additionalProperties.anyOf[1]
        expect(toolConfigSchema.properties.function.anyOf).toBeDefined()
        expect(toolConfigSchema.properties.function.anyOf[0].type).toBe(
          'string',
        )
        expect(toolConfigSchema.properties.function.anyOf[1].type).toBe(
          'object',
        )
      })

      test('tool mcp has https pattern', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
            .additionalProperties.anyOf[1]
        expect(toolConfigSchema.properties.mcp.type).toBe('string')
        expect(toolConfigSchema.properties.mcp.pattern).toBe('^https://.*')
      })

      test('tool config includes toolSchema for function tools', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
            .additionalProperties.anyOf[1]
        // toolSchema is defined but accepts any format (validated at runtime/CloudFormation)
        expect(toolConfigSchema.properties.toolSchema).toBeDefined()
      })

      test('tool config includes credentials with type enum', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
            .additionalProperties.anyOf[1]
        const credentialsSchema = toolConfigSchema.properties.credentials
        expect(credentialsSchema.type).toBe('object')
        expect(credentialsSchema.properties.type.enum).toContain(
          'GATEWAY_IAM_ROLE',
        )
        expect(credentialsSchema.properties.type.enum).toContain('OAUTH')
        expect(credentialsSchema.properties.type.enum).toContain('API_KEY')
      })

      test('credentials includes providerArn and scopes for OAUTH', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.additionalProperties.properties.tools
            .additionalProperties.anyOf[1]
        const credentialsSchema = toolConfigSchema.properties.credentials
        expect(credentialsSchema.properties.providerArn).toBeDefined()
        expect(credentialsSchema.properties.scopes).toBeDefined()
        expect(credentialsSchema.properties.scopes.type).toBe('array')
      })
    })

    // Gateway configuration in provider.agents.gateway
    describe('provider.agents.gateway schema', () => {
      test('provider schema includes agents.gateway', () => {
        defineAgentsSchema(mockServerless)

        // Check that provider.agents was added to the schema
        const providerAgentsSchema =
          mockServerless.configSchemaHandler.schema.properties.provider
            .properties.agents
        expect(providerAgentsSchema).toBeDefined()
        expect(providerAgentsSchema.properties.gateway).toBeDefined()
      })

      test('gateway config includes authorizerType enum', () => {
        defineAgentsSchema(mockServerless)

        const gatewaySchema =
          mockServerless.configSchemaHandler.schema.properties.provider
            .properties.agents.properties.gateway
        expect(gatewaySchema.properties.authorizerType.enum).toContain('NONE')
        expect(gatewaySchema.properties.authorizerType.enum).toContain(
          'AWS_IAM',
        )
        expect(gatewaySchema.properties.authorizerType.enum).toContain(
          'CUSTOM_JWT',
        )
      })

      test('gateway config includes protocolType with MCP', () => {
        defineAgentsSchema(mockServerless)

        const gatewaySchema =
          mockServerless.configSchemaHandler.schema.properties.provider
            .properties.agents.properties.gateway
        expect(gatewaySchema.properties.protocolType.enum).toContain('MCP')
      })

      test('gateway config includes kmsKeyArn with pattern', () => {
        defineAgentsSchema(mockServerless)

        const gatewaySchema =
          mockServerless.configSchemaHandler.schema.properties.provider
            .properties.agents.properties.gateway
        expect(gatewaySchema.properties.kmsKeyArn).toBeDefined()
        expect(gatewaySchema.properties.kmsKeyArn.pattern).toContain('kms')
      })

      test('gateway config includes interceptorConfigurations', () => {
        defineAgentsSchema(mockServerless)

        const gatewaySchema =
          mockServerless.configSchemaHandler.schema.properties.provider
            .properties.agents.properties.gateway
        expect(gatewaySchema.properties.interceptorConfigurations).toBeDefined()
        expect(gatewaySchema.properties.interceptorConfigurations.type).toBe(
          'array',
        )
      })

      test('gateway config includes authorizerConfiguration', () => {
        defineAgentsSchema(mockServerless)

        const gatewaySchema =
          mockServerless.configSchemaHandler.schema.properties.provider
            .properties.agents.properties.gateway
        expect(gatewaySchema.properties.authorizerConfiguration).toBeDefined()
        expect(
          gatewaySchema.properties.authorizerConfiguration.properties
            .customJwtAuthorizer,
        ).toBeDefined()
      })

      test('gateway config includes protocolConfiguration', () => {
        defineAgentsSchema(mockServerless)

        const gatewaySchema =
          mockServerless.configSchemaHandler.schema.properties.provider
            .properties.agents.properties.gateway
        expect(gatewaySchema.properties.protocolConfiguration).toBeDefined()
        expect(
          gatewaySchema.properties.protocolConfiguration.properties.mcp,
        ).toBeDefined()
      })
    })

    // Browser-specific tests
    describe('browser schema', () => {
      test('includes recording configuration', () => {
        defineAgentsSchema(mockServerless)

        const recordingSchema =
          capturedAgentsSchema.additionalProperties.properties.recording
        expect(recordingSchema.type).toBe('object')
        expect(recordingSchema.properties.enabled.type).toBe('boolean')
        expect(recordingSchema.properties.s3Location).toBeDefined()
      })

      test('includes signing configuration', () => {
        defineAgentsSchema(mockServerless)

        const signingSchema =
          capturedAgentsSchema.additionalProperties.properties.signing
        expect(signingSchema.type).toBe('object')
        expect(signingSchema.properties.enabled.type).toBe('boolean')
      })
    })

    // WorkloadIdentity-specific tests
    describe('workloadIdentity schema', () => {
      test('includes oauth2ReturnUrls', () => {
        defineAgentsSchema(mockServerless)

        const oauth2UrlsSchema =
          capturedAgentsSchema.additionalProperties.properties.oauth2ReturnUrls
        expect(oauth2UrlsSchema.type).toBe('array')
        expect(oauth2UrlsSchema.items.type).toBe('string')
      })
    })

    // Custom schema tests
    describe('custom agentCore schema', () => {
      test('includes defaultTags', () => {
        defineAgentsSchema(mockServerless)

        const agentCoreSchema = capturedCustomSchema.properties.agentCore
        expect(agentCoreSchema.type).toBe('object')
        expect(agentCoreSchema.properties.defaultTags.type).toBe('object')
        expect(
          agentCoreSchema.properties.defaultTags.additionalProperties.type,
        ).toBe('string')
      })
    })
  })
})
