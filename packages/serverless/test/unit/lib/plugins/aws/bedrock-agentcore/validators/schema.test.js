'use strict'

import { jest } from '@jest/globals'
import { defineAgentsSchema } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/validators/schema.js'

describe('Schema Validator', () => {
  let mockServerless
  let capturedAgentsSchema
  let capturedCustomSchema

  beforeEach(() => {
    capturedAgentsSchema = null
    capturedCustomSchema = null

    mockServerless = {
      configSchemaHandler: {
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

    test('agent schema requires type property', () => {
      defineAgentsSchema(mockServerless)

      expect(capturedAgentsSchema.additionalProperties.required).toContain(
        'type',
      )
    })

    test('agent schema has valid type enum including all resource types', () => {
      defineAgentsSchema(mockServerless)

      const typeSchema =
        capturedAgentsSchema.additionalProperties.properties.type
      expect(typeSchema.type).toBe('string')
      expect(typeSchema.enum).toContain('runtime')
      expect(typeSchema.enum).toContain('memory')
      expect(typeSchema.enum).toContain('gateway')
      expect(typeSchema.enum).toContain('browser')
      expect(typeSchema.enum).toContain('codeInterpreter')
      expect(typeSchema.enum).toContain('workloadIdentity')
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

      test('artifact s3 config includes required bucket and key', () => {
        defineAgentsSchema(mockServerless)

        const s3Schema =
          capturedAgentsSchema.additionalProperties.properties.artifact
            .properties.s3
        expect(s3Schema.properties.bucket).toBeDefined()
        expect(s3Schema.properties.key).toBeDefined()
        expect(s3Schema.required).toContain('bucket')
        expect(s3Schema.required).toContain('key')
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

    // Memory-specific tests
    describe('memory schema', () => {
      test('includes eventExpiryDuration with range 7-365', () => {
        defineAgentsSchema(mockServerless)

        const expirySchema =
          capturedAgentsSchema.additionalProperties.properties
            .eventExpiryDuration
        expect(expirySchema.type).toBe('number')
        expect(expirySchema.minimum).toBe(7)
        expect(expirySchema.maximum).toBe(365)
      })

      test('includes strategies array', () => {
        defineAgentsSchema(mockServerless)

        const strategiesSchema =
          capturedAgentsSchema.additionalProperties.properties.strategies
        expect(strategiesSchema.type).toBe('array')
        expect(strategiesSchema.items.type).toBe('object')
        expect(strategiesSchema.items.additionalProperties).toBe(true)
      })

      test('includes encryptionKeyArn', () => {
        defineAgentsSchema(mockServerless)

        const encryptionSchema =
          capturedAgentsSchema.additionalProperties.properties.encryptionKeyArn
        expect(encryptionSchema.type).toBe('string')
      })
    })

    // Gateway-specific tests
    describe('gateway schema', () => {
      test('includes authorizerType enum', () => {
        defineAgentsSchema(mockServerless)

        const authTypeSchema =
          capturedAgentsSchema.additionalProperties.properties.authorizerType
        expect(authTypeSchema.type).toBe('string')
        expect(authTypeSchema.enum).toContain('NONE')
        expect(authTypeSchema.enum).toContain('AWS_IAM')
        expect(authTypeSchema.enum).toContain('CUSTOM_JWT')
      })

      test('includes protocolType with MCP', () => {
        defineAgentsSchema(mockServerless)

        const protocolTypeSchema =
          capturedAgentsSchema.additionalProperties.properties.protocolType
        expect(protocolTypeSchema.type).toBe('string')
        expect(protocolTypeSchema.enum).toContain('MCP')
      })

      test('includes authorizerConfiguration with customJwtAuthorizer', () => {
        defineAgentsSchema(mockServerless)

        const authConfigSchema =
          capturedAgentsSchema.additionalProperties.properties
            .authorizerConfiguration
        expect(authConfigSchema.type).toBe('object')
        expect(authConfigSchema.properties.customJwtAuthorizer).toBeDefined()
        expect(
          authConfigSchema.properties.customJwtAuthorizer.properties
            .allowedScopes,
        ).toBeDefined()
        expect(
          authConfigSchema.properties.customJwtAuthorizer.properties
            .customClaims,
        ).toBeDefined()
      })

      test('includes protocolConfiguration with mcp settings', () => {
        defineAgentsSchema(mockServerless)

        const protocolConfigSchema =
          capturedAgentsSchema.additionalProperties.properties
            .protocolConfiguration
        expect(protocolConfigSchema.type).toBe('object')
        expect(protocolConfigSchema.properties.mcp).toBeDefined()
        expect(
          protocolConfigSchema.properties.mcp.properties.supportedVersions,
        ).toBeDefined()
        expect(
          protocolConfigSchema.properties.mcp.properties.instructions,
        ).toBeDefined()
        expect(
          protocolConfigSchema.properties.mcp.properties.searchType,
        ).toBeDefined()
      })

      test('includes exceptionLevel', () => {
        defineAgentsSchema(mockServerless)

        const exceptionSchema =
          capturedAgentsSchema.additionalProperties.properties.exceptionLevel
        expect(exceptionSchema.type).toBe('string')
        expect(exceptionSchema.enum).toContain('DEBUG')
      })

      test('includes targets array with target types', () => {
        defineAgentsSchema(mockServerless)

        const targetsSchema =
          capturedAgentsSchema.additionalProperties.properties.targets
        expect(targetsSchema.type).toBe('array')
        expect(targetsSchema.items.properties.name).toBeDefined()
        expect(targetsSchema.items.properties.type.enum).toContain('openapi')
        expect(targetsSchema.items.properties.type.enum).toContain('lambda')
        expect(targetsSchema.items.properties.type.enum).toContain('smithy')
        expect(targetsSchema.items.required).toContain('name')
      })

      test('target includes credentialProvider configuration', () => {
        defineAgentsSchema(mockServerless)

        const credProviderSchema =
          capturedAgentsSchema.additionalProperties.properties.targets.items
            .properties.credentialProvider
        expect(credProviderSchema.type).toBe('object')
        expect(credProviderSchema.properties.type.enum).toContain(
          'GATEWAY_IAM_ROLE',
        )
        expect(credProviderSchema.properties.type.enum).toContain('OAUTH')
        expect(credProviderSchema.properties.type.enum).toContain('API_KEY')
      })

      test('target credentialProvider oauthConfig uses providerArn', () => {
        defineAgentsSchema(mockServerless)

        const oauthSchema =
          capturedAgentsSchema.additionalProperties.properties.targets.items
            .properties.credentialProvider.properties.oauthConfig
        expect(oauthSchema.properties.providerArn).toBeDefined()
        expect(oauthSchema.properties.scopes).toBeDefined()
        expect(oauthSchema.required).toContain('providerArn')
        expect(oauthSchema.required).toContain('scopes')
      })

      test('target credentialProvider apiKeyConfig uses providerArn', () => {
        defineAgentsSchema(mockServerless)

        const apiKeySchema =
          capturedAgentsSchema.additionalProperties.properties.targets.items
            .properties.credentialProvider.properties.apiKeyConfig
        expect(apiKeySchema.properties.providerArn).toBeDefined()
        expect(apiKeySchema.properties.credentialLocation).toBeDefined()
        expect(apiKeySchema.required).toContain('providerArn')
      })

      test('target includes toolSchema for lambda targets', () => {
        defineAgentsSchema(mockServerless)

        const toolSchemaSchema =
          capturedAgentsSchema.additionalProperties.properties.targets.items
            .properties.toolSchema
        expect(toolSchemaSchema.type).toBe('object')
        expect(toolSchemaSchema.properties.s3).toBeDefined()
        expect(toolSchemaSchema.properties.inlinePayload).toBeDefined()
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
