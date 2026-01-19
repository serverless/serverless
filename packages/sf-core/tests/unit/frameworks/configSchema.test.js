/**
 * @fileoverview Tests for framework configuration schema factories.
 *
 * These tests verify:
 * - Schema factory functions return valid Zod schemas
 * - Schema composition produces correct validation behavior
 * - Strict mode properly rejects unrecognized keys
 */

import { getServerlessContainerFrameworkConfigSchema } from '../../../src/lib/frameworks/scf/types.js'
import { getServerlessAiFrameworkConfigSchema } from '../../../src/lib/frameworks/sai/types.js'

describe('Framework Config Schema Factories', () => {
  describe('getServerlessContainerFrameworkConfigSchema', () => {
    test('should return valid schema for awsApi@1.0 deployment type', () => {
      const schema = getServerlessContainerFrameworkConfigSchema({
        deploymentType: 'awsApi@1.0',
      })
      expect(schema).toBeDefined()
      expect(typeof schema.parse).toBe('function')
      expect(typeof schema.safeParse).toBe('function')
    })

    test('should return valid schema for aws@1.0 deployment type', () => {
      const schema = getServerlessContainerFrameworkConfigSchema({
        deploymentType: 'aws@1.0',
      })
      expect(schema).toBeDefined()
      expect(typeof schema.parse).toBe('function')
    })

    test('should throw for unsupported deployment type', () => {
      expect(() =>
        getServerlessContainerFrameworkConfigSchema({
          deploymentType: 'unsupported@1.0',
        }),
      ).toThrow('Unsupported deployment type or version')
    })

    test('awsApi@1.0 schema should accept valid minimal config', () => {
      const schema = getServerlessContainerFrameworkConfigSchema({
        deploymentType: 'awsApi@1.0',
      })
      const validConfig = {
        name: 'test-service',
        deployment: { type: 'awsApi@1.0' },
        containers: {},
      }
      const result = schema.safeParse(validConfig)
      expect(result.success).toBe(true)
    })

    test('awsApi@1.0 schema should reject config missing required name', () => {
      const schema = getServerlessContainerFrameworkConfigSchema({
        deploymentType: 'awsApi@1.0',
      })
      const invalidConfig = {
        deployment: { type: 'awsApi@1.0' },
        containers: {},
      }
      const result = schema.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    test('awsApi@1.0 schema should reject config with unrecognized keys (strict mode)', () => {
      const schema = getServerlessContainerFrameworkConfigSchema({
        deploymentType: 'awsApi@1.0',
      })
      const invalidConfig = {
        name: 'test-service',
        deployment: { type: 'awsApi@1.0' },
        containers: {},
        unknownKey: 'should fail',
      }
      const result = schema.safeParse(invalidConfig)
      expect(result.success).toBe(false)
      expect(
        result.error.issues.some((issue) => issue.code === 'unrecognized_keys'),
      ).toBe(true)
    })
  })

  describe('getServerlessAiFrameworkConfigSchema', () => {
    test('should return valid schema for sfaiAws@1.0 deployment type', () => {
      const schema = getServerlessAiFrameworkConfigSchema({
        deploymentType: 'sfaiAws@1.0',
      })
      expect(schema).toBeDefined()
      expect(typeof schema.parse).toBe('function')
    })

    test('should return valid schema with default deployment type', () => {
      const schema = getServerlessAiFrameworkConfigSchema()
      expect(schema).toBeDefined()
      expect(typeof schema.parse).toBe('function')
    })

    test('should throw for unsupported deployment type', () => {
      expect(() =>
        getServerlessAiFrameworkConfigSchema({
          deploymentType: 'unsupported@1.0',
        }),
      ).toThrow('Unsupported deployment type or version')
    })

    test('sfaiAws@1.0 schema should reject config with unrecognized keys (strict mode)', () => {
      const schema = getServerlessAiFrameworkConfigSchema({
        deploymentType: 'sfaiAws@1.0',
      })
      const invalidConfig = {
        name: 'test-service',
        deployment: { type: 'sfaiAws@1.0' },
        agent: {},
        unknownKey: 'should fail',
      }
      const result = schema.safeParse(invalidConfig)
      expect(result.success).toBe(false)
      expect(
        result.error.issues.some((issue) => issue.code === 'unrecognized_keys'),
      ).toBe(true)
    })
  })
})
