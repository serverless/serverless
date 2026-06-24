'use strict'

import { jest } from '@jest/globals'
import { defineSandboxesSchema } from '../../../../../../../lib/plugins/aws/sandboxes/validators/schema.js'

describe('defineSandboxesSchema', () => {
  let mockServerless
  let capturedSandboxesSchema

  beforeEach(() => {
    capturedSandboxesSchema = null

    mockServerless = {
      configSchemaHandler: {
        defineTopLevelProperty: jest.fn((name, schema) => {
          if (name === 'sandboxes') {
            capturedSandboxesSchema = schema
          }
        }),
      },
    }
  })

  test('calls defineTopLevelProperty with "sandboxes"', () => {
    defineSandboxesSchema(mockServerless)
    expect(
      mockServerless.configSchemaHandler.defineTopLevelProperty,
    ).toHaveBeenCalledWith('sandboxes', expect.any(Object))
  })

  test('sandboxes schema is object type with additionalProperties per-sandbox schema', () => {
    defineSandboxesSchema(mockServerless)
    expect(capturedSandboxesSchema.type).toBe('object')
    expect(capturedSandboxesSchema.additionalProperties).toBeDefined()
    expect(capturedSandboxesSchema.additionalProperties.type).toBe('object')
  })

  test('per-sandbox schema requires artifact', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    expect(sandboxSchema.required).toContain('artifact')
  })

  test('per-sandbox schema artifact is a string', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    expect(sandboxSchema.properties.artifact.type).toBe('string')
  })

  test('per-sandbox schema memory is an enum of valid MiB values', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    expect(sandboxSchema.properties.memory.enum).toEqual([
      512, 1024, 2048, 4096, 8192,
    ])
  })

  test('per-sandbox schema environment is object with string values', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    expect(sandboxSchema.properties.environment.type).toBe('object')
    expect(sandboxSchema.properties.environment.additionalProperties.type).toBe(
      'string',
    )
  })

  test('per-sandbox schema osCapabilities is array with case-insensitive items', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    const osCapabilities = sandboxSchema.properties.osCapabilities
    expect(osCapabilities.type).toBe('array')
    expect(osCapabilities.items.anyOf).toBeDefined()
    // Each item should be a case-insensitive string schema
    osCapabilities.items.anyOf.forEach((entry) => {
      expect(entry.type).toBe('string')
      expect(entry.regexp).toBeDefined()
    })
  })

  test('per-sandbox schema vpc is object with subnets and securityGroups', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    const vpcSchema = sandboxSchema.properties.vpc
    expect(vpcSchema.type).toBe('object')
    expect(vpcSchema.properties.subnets.type).toBe('array')
    expect(vpcSchema.properties.securityGroups.type).toBe('array')
  })

  test('per-sandbox schema has additionalProperties false', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    expect(sandboxSchema.additionalProperties).toBe(false)
  })

  test('does nothing when configSchemaHandler is absent', () => {
    expect(() => defineSandboxesSchema({})).not.toThrow()
  })

  test('observability object: accepts logs/metrics/alarms/dashboard', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    const obsSchema = sandboxSchema.properties.observability
    expect(obsSchema.anyOf).toBeDefined()
    // The object branch should have explicit sub-properties
    const objectBranch = obsSchema.anyOf.find((s) => s.type === 'object')
    expect(objectBranch).toBeDefined()
    expect(objectBranch.additionalProperties).toBe(false)
    expect(objectBranch.properties.logs).toBeDefined()
    expect(objectBranch.properties.metrics).toBeDefined()
    expect(objectBranch.properties.alarms).toBeDefined()
    expect(objectBranch.properties.dashboard).toBeDefined()
  })

  test('observability object: rejects unknown sub-key', () => {
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    const obsSchema = sandboxSchema.properties.observability
    const objectBranch = obsSchema.anyOf.find((s) => s.type === 'object')
    // additionalProperties: false means unknown keys should not be listed in properties
    expect(objectBranch.additionalProperties).toBe(false)
    expect(objectBranch.properties.bogus).toBeUndefined()
  })
})
