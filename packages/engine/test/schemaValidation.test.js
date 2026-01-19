/**
 * @fileoverview Tests for Zod schema validation and custom error messages.
 *
 * These tests verify:
 * - Custom error messages for scaling configuration schemas
 * - JSONValue recursive schema behavior
 * - Schema composition with .merge()
 * - ZodError structure and issue format
 */

import { z } from 'zod'
import {
  ConfigContainerAwsFargateEcsScaleSchema,
  ConfigEssential,
  ConfigDeploymentAwsApi,
} from '../src/types.js'

describe('Scaling Schema: Custom Error Messages', () => {
  describe('ConfigContainerAwsFargateEcsScaleSchema - min/max error messages', () => {
    test('should show custom error when "min" receives wrong type (string instead of number)', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'min', min: 'not a number' },
      ])
      expect(result.success).toBe(false)
      expect(result.error.issues[0].message).toBe('"min" must be a number')
    })

    test('should show custom error when "min" is missing', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'min' },
      ])
      expect(result.success).toBe(false)
      expect(result.error.issues[0].message).toBe(
        'A scaling object with key "min" must have a number value',
      )
    })

    test('should show custom error when "max" receives wrong type (string instead of number)', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'max', max: 'not a number' },
      ])
      expect(result.success).toBe(false)
      expect(result.error.issues[0].message).toBe('"max" must be a number')
    })

    test('should show custom error when "max" is missing', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'max' },
      ])
      expect(result.success).toBe(false)
      expect(result.error.issues[0].message).toBe(
        'A scaling object with key "max" must have a number value',
      )
    })

    test('should accept valid min/max numbers with target policy', () => {
      // min/max must be paired with a target or step policy
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'min', min: 1 },
        { type: 'max', max: 10 },
        { type: 'target', target: 'cpu', value: 70 },
      ])
      expect(result.success).toBe(true)
    })
  })

  describe('ConfigContainerAwsFargateEcsScaleSchema - target error messages', () => {
    test('should show custom error when "target" receives wrong type', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'target', target: 123 }, // should be string enum
      ])
      expect(result.success).toBe(false)
      expect(result.error.issues[0].message).toBe(
        '"target" must be either "cpu", "memory", or "albRequestsPerTarget"',
      )
    })

    test('should show custom error when "target" receives invalid enum value', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'target', target: 'invalid' },
      ])
      expect(result.success).toBe(false)
      // Invalid enum values use the custom error callback
      expect(result.error.issues[0].message).toBe(
        '"target" must be either "cpu", "memory", or "albRequestsPerTarget"',
      )
    })

    test('should show custom error when "target" is missing', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'target' }, // missing target field
      ])
      expect(result.success).toBe(false)
      expect(result.error.issues[0].message).toBe(
        'A scaling object with key "target" must have a value of "cpu", "memory", or "albRequestsPerTarget"',
      )
    })
  })

  describe('ConfigContainerAwsFargateEcsScaleSchema - desired error messages', () => {
    test('should show custom error when "desired" receives wrong type', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'desired', desired: 'not a number' },
      ])
      expect(result.success).toBe(false)
      expect(result.error.issues[0].message).toBe('"desired" must be a number')
    })

    test('should use default value when "desired" is missing (has .default(5))', () => {
      // Note: desired has .default(5), so missing value doesn't trigger required_error
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'desired' },
      ])
      expect(result.success).toBe(true)
      expect(result.data[0].desired).toBe(5)
    })

    test('should accept valid desired number', () => {
      const result = ConfigContainerAwsFargateEcsScaleSchema.safeParse([
        { type: 'desired', desired: 5 },
      ])
      expect(result.success).toBe(true)
    })
  })
})

describe('JSONValue Schema: Recursive Validation', () => {
  // Recreate JSONValue schema to test z.record() behavior
  const JSONValue = z.lazy(() =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(JSONValue),
      z.record(z.string(), JSONValue),
    ]),
  )

  test('should accept simple string value', () => {
    expect(() => JSONValue.parse('hello')).not.toThrow()
  })

  test('should accept simple number value', () => {
    expect(() => JSONValue.parse(42)).not.toThrow()
  })

  test('should accept simple boolean value', () => {
    expect(() => JSONValue.parse(true)).not.toThrow()
  })

  test('should accept array of mixed values', () => {
    expect(() => JSONValue.parse(['string', 123, true])).not.toThrow()
  })

  test('should accept record (object) with string keys', () => {
    expect(() =>
      JSONValue.parse({
        key1: 'value',
        key2: 123,
        key3: true,
      }),
    ).not.toThrow()
  })

  test('should accept deeply nested structure', () => {
    const deepNested = {
      level1: {
        level2: {
          level3: {
            array: [1, 2, { nested: 'value' }],
            string: 'deep',
          },
        },
      },
    }
    expect(() => JSONValue.parse(deepNested)).not.toThrow()
  })

  test('should reject null (not a valid JSON value in this schema)', () => {
    const result = JSONValue.safeParse(null)
    expect(result.success).toBe(false)
  })

  test('should reject undefined', () => {
    const result = JSONValue.safeParse(undefined)
    expect(result.success).toBe(false)
  })
})

describe('Schema Composition: .merge() Behavior', () => {
  describe('ConfigEssential.merge(ConfigDeploymentAwsApi)', () => {
    test('merged schema should include properties from both schemas', () => {
      const mergedSchema = ConfigEssential.merge(ConfigDeploymentAwsApi)

      // Should have shape from both
      expect(mergedSchema.shape).toHaveProperty('name')
      expect(typeof mergedSchema.parse).toBe('function')
    })

    test('merged schema should accept valid config with required fields', () => {
      const mergedSchema = ConfigEssential.merge(ConfigDeploymentAwsApi)
      const result = mergedSchema.safeParse({
        name: 'test-service',
        deployment: { type: 'awsApi@1.0' },
      })
      expect(result.success).toBe(true)
    })

    test('merged schema should reject config missing required name', () => {
      const mergedSchema = ConfigEssential.merge(ConfigDeploymentAwsApi)
      const result = mergedSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    test('merged schema with .strict() should reject unrecognized keys', () => {
      const mergedSchema = ConfigEssential.merge(
        ConfigDeploymentAwsApi,
      ).strict()
      const result = mergedSchema.safeParse({
        name: 'test-service',
        deployment: { type: 'awsApi@1.0' },
        unknownKey: 'should fail',
      })
      expect(result.success).toBe(false)
      expect(
        result.error.issues.some((issue) => issue.code === 'unrecognized_keys'),
      ).toBe(true)
    })
  })
})

describe('ZodError Structure: Issue Format', () => {
  test('ZodError should have issues array', () => {
    const schema = z.string()
    const result = schema.safeParse(123)
    expect(result.success).toBe(false)
    expect(Array.isArray(result.error.issues)).toBe(true)
    expect(result.error.issues.length).toBeGreaterThan(0)
  })

  test('ZodError issue should have path array', () => {
    const schema = z.object({ nested: z.string() })
    const result = schema.safeParse({ nested: 123 })
    expect(result.success).toBe(false)
    expect(Array.isArray(result.error.issues[0].path)).toBe(true)
    expect(result.error.issues[0].path).toContain('nested')
  })

  test('ZodError issue should have message string', () => {
    const schema = z.string()
    const result = schema.safeParse(123)
    expect(result.success).toBe(false)
    expect(typeof result.error.issues[0].message).toBe('string')
  })

  test('ZodError issue should have code string', () => {
    const schema = z.string()
    const result = schema.safeParse(123)
    expect(result.success).toBe(false)
    expect(typeof result.error.issues[0].code).toBe('string')
  })

  test('unrecognized_keys issue should have keys array', () => {
    const schema = z.object({ allowed: z.string() }).strict()
    const result = schema.safeParse({ allowed: 'ok', notAllowed: 'fail' })
    expect(result.success).toBe(false)
    const issue = result.error.issues.find(
      (i) => i.code === 'unrecognized_keys',
    )
    expect(issue).toBeDefined()
    expect(Array.isArray(issue.keys)).toBe(true)
    expect(issue.keys).toContain('notAllowed')
  })
})
