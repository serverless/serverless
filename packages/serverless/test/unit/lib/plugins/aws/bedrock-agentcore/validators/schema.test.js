'use strict'

import { jest } from '@jest/globals'
import { defineAgentsSchema } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/validators/schema.js'

describe('Schema Validator', () => {
  let mockServerless
  let capturedAgentsSchema

  beforeEach(() => {
    capturedAgentsSchema = null

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
        defineCustomProperties: jest.fn(),
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

    test('agents schema is object type with additionalProperties', () => {
      defineAgentsSchema(mockServerless)

      expect(capturedAgentsSchema.type).toBe('object')
      expect(capturedAgentsSchema.additionalProperties).toBeDefined()
      expect(capturedAgentsSchema.additionalProperties.type).toBe('object')
    })

    test('agents schema includes memory reserved key for shared memory', () => {
      defineAgentsSchema(mockServerless)

      expect(capturedAgentsSchema.properties.memory).toBeDefined()
      expect(capturedAgentsSchema.properties.memory.type).toBe('object')
    })

    test('agents schema includes browsers reserved key', () => {
      defineAgentsSchema(mockServerless)

      expect(capturedAgentsSchema.properties.browsers).toBeDefined()
      expect(capturedAgentsSchema.properties.browsers.type).toBe('object')
    })

    test('agents schema includes codeInterpreters reserved key', () => {
      defineAgentsSchema(mockServerless)

      expect(capturedAgentsSchema.properties.codeInterpreters).toBeDefined()
      expect(capturedAgentsSchema.properties.codeInterpreters.type).toBe(
        'object',
      )
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

    test('agent schema includes role property (supports ARN, logical name, or CF intrinsic)', () => {
      defineAgentsSchema(mockServerless)

      const roleSchema =
        capturedAgentsSchema.additionalProperties.properties.role
      expect(roleSchema).toBeDefined()
      // role supports string or object (CF intrinsic)
      expect(roleSchema.anyOf).toBeDefined()
    })

    // Runtime-specific tests (non-reserved keys are runtime agents)
    describe('runtime schema', () => {
      test('includes handler property at agent root level', () => {
        defineAgentsSchema(mockServerless)

        const handlerSchema =
          capturedAgentsSchema.additionalProperties.properties.handler
        expect(handlerSchema).toBeDefined()
        expect(handlerSchema.type).toBe('string')
      })

      test('includes runtime property with Lambda-style values (case-insensitive)', () => {
        defineAgentsSchema(mockServerless)

        const runtimeSchema =
          capturedAgentsSchema.additionalProperties.properties.runtime
        expect(runtimeSchema).toBeDefined()
        expect(runtimeSchema.anyOf).toBeDefined()
        expect(runtimeSchema.anyOf).toHaveLength(4)
        // Each entry should be a case-insensitive regex pattern
        runtimeSchema.anyOf.forEach((entry) => {
          expect(entry.type).toBe('string')
          expect(entry.regexp).toBeDefined()
        })
      })

      test('includes artifact property with image and s3', () => {
        defineAgentsSchema(mockServerless)

        const artifactSchema =
          capturedAgentsSchema.additionalProperties.properties.artifact
        expect(artifactSchema.type).toBe('object')
        expect(artifactSchema.properties.image).toBeDefined()
        expect(artifactSchema.properties.s3).toBeDefined()
      })

      test('artifact.image supports string (pre-built URI) or object (build config)', () => {
        defineAgentsSchema(mockServerless)

        const imageSchema =
          capturedAgentsSchema.additionalProperties.properties.artifact
            .properties.image
        expect(imageSchema.anyOf).toBeDefined()
        expect(imageSchema.anyOf).toHaveLength(2)
        // String option for pre-built image URI
        expect(imageSchema.anyOf[0].type).toBe('string')
        // Object option for build configuration
        expect(imageSchema.anyOf[1].type).toBe('object')
        expect(imageSchema.anyOf[1].properties.file).toBeDefined()
        expect(imageSchema.anyOf[1].properties.path).toBeDefined()
        expect(imageSchema.anyOf[1].properties.repository).toBeDefined()
        expect(imageSchema.anyOf[1].properties.buildArgs).toBeDefined()
      })

      test('artifact s3 config includes bucket and key properties', () => {
        defineAgentsSchema(mockServerless)

        const s3Schema =
          capturedAgentsSchema.additionalProperties.properties.artifact
            .properties.s3
        expect(s3Schema.properties.bucket).toBeDefined()
        expect(s3Schema.properties.key).toBeDefined()
        expect(s3Schema.properties.versionId).toBeDefined()
      })

      test('includes authorizer property (string shorthand or object)', () => {
        defineAgentsSchema(mockServerless)

        const authSchema =
          capturedAgentsSchema.additionalProperties.properties.authorizer
        expect(authSchema).toBeDefined()
        // Authorizer uses anyOf - case-insensitive strings plus object option
        expect(authSchema.anyOf).toBeDefined()
      })

      test('includes network configuration with mode property', () => {
        defineAgentsSchema(mockServerless)

        const networkSchema =
          capturedAgentsSchema.additionalProperties.properties.network
        expect(networkSchema.type).toBe('object')
        expect(networkSchema.properties.mode).toBeDefined()
        expect(networkSchema.properties.subnets).toBeDefined()
        expect(networkSchema.properties.securityGroups).toBeDefined()
      })

      test('includes authorizer configuration with type and jwt', () => {
        defineAgentsSchema(mockServerless)

        const authSchema =
          capturedAgentsSchema.additionalProperties.properties.authorizer
        // Authorizer can be string or object
        expect(authSchema.anyOf).toBeDefined()
        // Find the object option
        const objectOption = authSchema.anyOf.find((o) => o.type === 'object')
        expect(objectOption).toBeDefined()
        expect(objectOption.properties.type).toBeDefined()
        expect(objectOption.properties.jwt).toBeDefined()
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
        // Environment uses $ref to the shared awsLambdaEnvironment definition
        expect(envSchema.$ref).toBe('#/definitions/awsLambdaEnvironment')
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

      test('shared memory schema includes expiration with range 3-365', () => {
        defineAgentsSchema(mockServerless)

        const memorySchema = capturedAgentsSchema.properties.memory
        const expirySchema =
          memorySchema.additionalProperties.properties.expiration
        expect(expirySchema.type).toBe('number')
        expect(expirySchema.minimum).toBe(3)
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

    // Tools schema tests (shared tools at agents.tools level)
    describe('tools schema', () => {
      test('agents schema includes tools reserved key for shared tools', () => {
        defineAgentsSchema(mockServerless)

        expect(capturedAgentsSchema.properties.tools).toBeDefined()
        expect(capturedAgentsSchema.properties.tools.type).toBe('object')
      })

      test('shared tool config supports string reference or inline object', () => {
        defineAgentsSchema(mockServerless)

        const toolsSchema = capturedAgentsSchema.properties.tools
        expect(toolsSchema.additionalProperties.anyOf).toBeDefined()
        expect(toolsSchema.additionalProperties.anyOf).toHaveLength(2)
        // String reference
        expect(toolsSchema.additionalProperties.anyOf[0].type).toBe('string')
        // Inline object
        expect(toolsSchema.additionalProperties.anyOf[1].type).toBe('object')
      })

      test('shared tool config includes function, openapi, smithy, mcp keys', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.properties.tools.additionalProperties.anyOf[1]
        expect(toolConfigSchema.properties.function).toBeDefined()
        expect(toolConfigSchema.properties.openapi).toBeDefined()
        expect(toolConfigSchema.properties.smithy).toBeDefined()
        expect(toolConfigSchema.properties.mcp).toBeDefined()
      })

      test('shared tool function can be string or object', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.properties.tools.additionalProperties.anyOf[1]
        expect(toolConfigSchema.properties.function.anyOf).toBeDefined()
        expect(toolConfigSchema.properties.function.anyOf[0].type).toBe(
          'string',
        )
        expect(toolConfigSchema.properties.function.anyOf[1].type).toBe(
          'object',
        )
      })

      test('shared tool mcp has https pattern', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.properties.tools.additionalProperties.anyOf[1]
        expect(toolConfigSchema.properties.mcp.type).toBe('string')
        expect(toolConfigSchema.properties.mcp.pattern).toBe('^https://.*')
      })

      test('shared tool config includes toolSchema for function tools', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.properties.tools.additionalProperties.anyOf[1]
        expect(toolConfigSchema.properties.toolSchema).toBeDefined()
      })

      test('shared tool config includes credentials with type enum', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.properties.tools.additionalProperties.anyOf[1]
        const credentialsSchema = toolConfigSchema.properties.credentials
        expect(credentialsSchema.type).toBe('object')
        // type is case-insensitive, so check for anyOf with pattern
        expect(credentialsSchema.properties.type.anyOf).toBeDefined()
      })

      test('shared tool credentials includes provider and scopes for OAUTH', () => {
        defineAgentsSchema(mockServerless)

        const toolConfigSchema =
          capturedAgentsSchema.properties.tools.additionalProperties.anyOf[1]
        const credentialsSchema = toolConfigSchema.properties.credentials
        expect(credentialsSchema.properties.provider).toBeDefined()
        expect(credentialsSchema.properties.scopes).toBeDefined()
        expect(credentialsSchema.properties.scopes.type).toBe('array')
      })
    })

    // Browser-specific tests (via agents.browsers reserved key)
    describe('browsers schema', () => {
      test('includes recording configuration', () => {
        defineAgentsSchema(mockServerless)

        const browserSchema =
          capturedAgentsSchema.properties.browsers.additionalProperties
        const recordingSchema = browserSchema.properties.recording
        expect(recordingSchema.type).toBe('object')
        expect(recordingSchema.properties.enabled.type).toBe('boolean')
        expect(recordingSchema.properties.s3Location).toBeDefined()
      })

      test('includes signing configuration', () => {
        defineAgentsSchema(mockServerless)

        const browserSchema =
          capturedAgentsSchema.properties.browsers.additionalProperties
        const signingSchema = browserSchema.properties.signing
        expect(signingSchema.type).toBe('object')
        expect(signingSchema.properties.enabled.type).toBe('boolean')
      })

      test('includes network configuration with mode', () => {
        defineAgentsSchema(mockServerless)

        const browserSchema =
          capturedAgentsSchema.properties.browsers.additionalProperties
        const networkSchema = browserSchema.properties.network
        expect(networkSchema.type).toBe('object')
        expect(networkSchema.properties.mode).toBeDefined()
      })
    })

    // CodeInterpreter-specific tests (via agents.codeInterpreters reserved key)
    describe('codeInterpreters schema', () => {
      test('includes network configuration with mode supporting SANDBOX', () => {
        defineAgentsSchema(mockServerless)

        const ciSchema =
          capturedAgentsSchema.properties.codeInterpreters.additionalProperties
        const networkSchema = ciSchema.properties.network
        expect(networkSchema.type).toBe('object')
        expect(networkSchema.properties.mode).toBeDefined()
      })

      test('includes description property', () => {
        defineAgentsSchema(mockServerless)

        const ciSchema =
          capturedAgentsSchema.properties.codeInterpreters.additionalProperties
        expect(ciSchema.properties.description).toBeDefined()
        expect(ciSchema.properties.description.type).toBe('string')
      })
    })

    // Gateways schema tests
    describe('gateways schema', () => {
      test('agents schema includes gateways reserved key', () => {
        defineAgentsSchema(mockServerless)

        expect(capturedAgentsSchema.properties.gateways).toBeDefined()
        expect(capturedAgentsSchema.properties.gateways.type).toBe('object')
      })

      test('gateway entry schema has authorizer property with anyOf for string or object', () => {
        defineAgentsSchema(mockServerless)

        const gatewaysSchema = capturedAgentsSchema.properties.gateways
        const gatewayEntrySchema = gatewaysSchema.additionalProperties
        expect(gatewayEntrySchema.properties.authorizer).toBeDefined()
        expect(gatewayEntrySchema.properties.authorizer.anyOf).toBeDefined()
        // 3 case-insensitive string patterns (NONE, AWS_IAM, CUSTOM_JWT) + 1 object
        expect(gatewayEntrySchema.properties.authorizer.anyOf).toHaveLength(4)
      })

      test('gateway entry authorizer string enum includes valid types (case-insensitive)', () => {
        defineAgentsSchema(mockServerless)

        const gatewaysSchema = capturedAgentsSchema.properties.gateways
        const gatewayEntrySchema = gatewaysSchema.additionalProperties
        // First 3 items are case-insensitive string patterns
        const authorizerStringSchema =
          gatewayEntrySchema.properties.authorizer.anyOf[0]
        expect(authorizerStringSchema.type).toBe('string')
        // Case-insensitive uses regexp property
        expect(authorizerStringSchema.regexp).toBeDefined()
      })

      test('gateway entry authorizer object includes type and jwt properties', () => {
        defineAgentsSchema(mockServerless)

        const gatewaysSchema = capturedAgentsSchema.properties.gateways
        const gatewayEntrySchema = gatewaysSchema.additionalProperties
        // Object option is the 4th element (index 3) after the 3 case-insensitive string patterns
        const authorizerObjectSchema =
          gatewayEntrySchema.properties.authorizer.anyOf[3]
        expect(authorizerObjectSchema.type).toBe('object')
        expect(authorizerObjectSchema.properties.type).toBeDefined()
        expect(authorizerObjectSchema.properties.jwt).toBeDefined()
        expect(authorizerObjectSchema.required).toContain('type')
      })

      test('gateway entry tools property is array of strings', () => {
        defineAgentsSchema(mockServerless)

        const gatewaysSchema = capturedAgentsSchema.properties.gateways
        const gatewayEntrySchema = gatewaysSchema.additionalProperties
        expect(gatewayEntrySchema.properties.tools).toBeDefined()
        expect(gatewayEntrySchema.properties.tools.type).toBe('array')
        expect(gatewayEntrySchema.properties.tools.items.type).toBe('string')
      })

      test('gateway entry includes protocol property as object with type and instructions', () => {
        defineAgentsSchema(mockServerless)

        const gatewaysSchema = capturedAgentsSchema.properties.gateways
        const gatewayEntrySchema = gatewaysSchema.additionalProperties
        expect(gatewayEntrySchema.properties.protocol).toBeDefined()
        expect(gatewayEntrySchema.properties.protocol.type).toBe('object')
        expect(
          gatewayEntrySchema.properties.protocol.properties.type,
        ).toBeDefined()
        expect(
          gatewayEntrySchema.properties.protocol.properties.instructions,
        ).toBeDefined()
      })

      test('gateway entry includes standard gateway properties', () => {
        defineAgentsSchema(mockServerless)

        const gatewaysSchema = capturedAgentsSchema.properties.gateways
        const gatewayEntrySchema = gatewaysSchema.additionalProperties
        expect(gatewayEntrySchema.properties.description).toBeDefined()
        expect(gatewayEntrySchema.properties.role).toBeDefined()
        expect(gatewayEntrySchema.properties.kmsKey).toBeDefined()
        expect(gatewayEntrySchema.properties.tags).toBeDefined()
      })
    })

    // Agent gateway property tests
    describe('agent gateway property schema', () => {
      test('runtime agent schema includes gateway property', () => {
        defineAgentsSchema(mockServerless)

        const gatewaySchema =
          capturedAgentsSchema.additionalProperties.properties.gateway
        expect(gatewaySchema).toBeDefined()
        expect(gatewaySchema.type).toBe('string')
      })
    })

    // IAM Role Customization tests
    describe('role property customization', () => {
      test('runtime agent role accepts string (ARN)', () => {
        defineAgentsSchema(mockServerless)

        const roleSchema =
          capturedAgentsSchema.additionalProperties.properties.role
        expect(roleSchema).toBeDefined()
        expect(roleSchema.anyOf).toBeDefined()
        expect(roleSchema.anyOf.length).toBeGreaterThanOrEqual(2)

        // Check that string is supported
        const stringSchema = roleSchema.anyOf.find((s) => s.type === 'string')
        expect(stringSchema).toBeDefined()
      })

      test('runtime agent role accepts object (customization)', () => {
        defineAgentsSchema(mockServerless)

        const roleSchema =
          capturedAgentsSchema.additionalProperties.properties.role
        const objectSchemas = roleSchema.anyOf.filter(
          (s) => s.type === 'object',
        )
        expect(objectSchemas.length).toBeGreaterThan(0)

        // Find the customization schema (has statements, managedPolicies, etc.)
        const customizationSchema = objectSchemas.find(
          (s) => s.properties && s.properties.statements,
        )
        expect(customizationSchema).toBeDefined()
        expect(customizationSchema.properties.statements).toBeDefined()
        expect(customizationSchema.properties.managedPolicies).toBeDefined()
        expect(customizationSchema.properties.permissionsBoundary).toBeDefined()
        expect(customizationSchema.properties.tags).toBeDefined()
        expect(customizationSchema.properties.name).toBeDefined()
      })

      test('memory role accepts string or object', () => {
        defineAgentsSchema(mockServerless)

        const memorySchema =
          capturedAgentsSchema.properties.memory.additionalProperties
        const roleSchema = memorySchema.properties.role
        expect(roleSchema.anyOf).toBeDefined()

        const stringSchema = roleSchema.anyOf.find((s) => s.type === 'string')
        expect(stringSchema).toBeDefined()

        const objectSchemas = roleSchema.anyOf.filter(
          (s) => s.type === 'object',
        )
        expect(objectSchemas.length).toBeGreaterThan(0)
      })

      test('gateway role accepts string or object', () => {
        defineAgentsSchema(mockServerless)

        const gatewayEntrySchema =
          capturedAgentsSchema.properties.gateways.additionalProperties
        const roleSchema = gatewayEntrySchema.properties.role
        expect(roleSchema.anyOf).toBeDefined()

        const stringSchema = roleSchema.anyOf.find((s) => s.type === 'string')
        expect(stringSchema).toBeDefined()
      })

      test('browser role accepts string or object', () => {
        defineAgentsSchema(mockServerless)

        const browserSchema =
          capturedAgentsSchema.properties.browsers.additionalProperties
        const roleSchema = browserSchema.properties.role
        expect(roleSchema.anyOf).toBeDefined()

        const stringSchema = roleSchema.anyOf.find((s) => s.type === 'string')
        expect(stringSchema).toBeDefined()
      })

      test('codeInterpreter role accepts string or object', () => {
        defineAgentsSchema(mockServerless)

        const ciSchema =
          capturedAgentsSchema.properties.codeInterpreters.additionalProperties
        const roleSchema = ciSchema.properties.role
        expect(roleSchema.anyOf).toBeDefined()

        const stringSchema = roleSchema.anyOf.find((s) => s.type === 'string')
        expect(stringSchema).toBeDefined()
      })
    })
  })
})
