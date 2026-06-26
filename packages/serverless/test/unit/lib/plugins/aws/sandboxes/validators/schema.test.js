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

  test('per-sandbox schema does not define a "name" property', () => {
    // Resource names derive from the YAML key (getResourceName(service, key,
    // stage)); a per-sandbox `name` was accepted but never consumed, so it is
    // not part of the schema (unknown keys warn via additionalProperties:false).
    defineSandboxesSchema(mockServerless)
    const sandboxSchema = capturedSandboxesSchema.additionalProperties
    expect(sandboxSchema.properties.name).toBeUndefined()
  })

  test('per-sandbox schema hooks is constrained (known keys + additionalProperties:false)', () => {
    defineSandboxesSchema(mockServerless)
    const s = capturedSandboxesSchema.additionalProperties
    const hooks = s.properties.hooks
    expect(hooks.type).toBe('object')
    expect(hooks.additionalProperties).toBe(false)
    ;[
      'port',
      'ready',
      'validate',
      'run',
      'resume',
      'suspend',
      'terminate',
    ].forEach((k) => expect(hooks.properties[k]).toBeDefined())
    // typo'd hook key is not a known property → warns via additionalProperties:false
    expect(hooks.properties.redy).toBeUndefined()
  })

  test('per-sandbox schema hook value accepts boolean or {timeout}', () => {
    defineSandboxesSchema(mockServerless)
    const s = capturedSandboxesSchema.additionalProperties
    const ready = s.properties.hooks.properties.ready
    expect(ready.anyOf).toBeDefined()
    expect(ready.anyOf.some((b) => b.type === 'boolean')).toBe(true)
    const obj = ready.anyOf.find((b) => b.type === 'object')
    expect(obj.additionalProperties).toBe(false)
    expect(obj.properties.timeout.type).toBe('number')
  })

  test('per-sandbox schema hook timeout and port require a positive value', () => {
    defineSandboxesSchema(mockServerless)
    const s = capturedSandboxesSchema.additionalProperties
    const hooks = s.properties.hooks
    expect(hooks.properties.port.minimum).toBe(1)
    const obj = hooks.properties.ready.anyOf.find((b) => b.type === 'object')
    expect(obj.properties.timeout.minimum).toBe(1)
  })

  test('per-sandbox schema iam is constrained to buildRole/executionRole', () => {
    defineSandboxesSchema(mockServerless)
    const s = capturedSandboxesSchema.additionalProperties
    const iam = s.properties.iam
    expect(iam.additionalProperties).toBe(false)
    expect(iam.properties.buildRole).toBeDefined()
    expect(iam.properties.executionRole).toBeDefined()
    expect(iam.properties.operatorRole).toBeUndefined() // operator role is not user-customizable
    // role value: an ARN string OR { statements, managedPolicies }
    const rv = iam.properties.executionRole
    expect(rv.anyOf.some((b) => b.type === 'string')).toBe(true)
    // the customization object branch (statements / managedPolicies / permissionsBoundary)
    const custom = rv.anyOf.find(
      (b) => b.type === 'object' && b.properties && b.properties.statements,
    )
    expect(custom.additionalProperties).toBe(false)
    expect(custom.properties.managedPolicies).toBeDefined()
    expect(custom.properties.permissionsBoundary).toBeDefined()
    // a CloudFormation-intrinsic branch (external role via Ref/Fn::GetAtt/…)
    const intrinsic = rv.anyOf.find(
      (b) => b.type === 'object' && b.properties && b.properties.Ref,
    )
    expect(intrinsic).toBeDefined()
    expect(intrinsic.properties['Fn::ImportValue']).toBeDefined()
    expect(intrinsic.properties['Fn::GetAtt']).toBeDefined()
  })

  test('per-sandbox schema alarms.thresholds validates per-filter threshold keys', () => {
    defineSandboxesSchema(mockServerless)
    const s = capturedSandboxesSchema.additionalProperties
    const objBranch = s.properties.observability.anyOf.find(
      (x) => x.type === 'object',
    )
    const thresholds = objBranch.properties.alarms.properties.thresholds
    // map of filter-name -> threshold config
    const perFilter = thresholds.additionalProperties
    expect(perFilter.additionalProperties).toBe(false)
    expect(perFilter.properties.threshold.type).toBe('number')
    expect(perFilter.properties.period.type).toBe('number')
    expect(perFilter.properties.evaluationPeriods.type).toBe('number')
  })

  test('per-sandbox schema vpc rejects unknown keys', () => {
    defineSandboxesSchema(mockServerless)
    const s = capturedSandboxesSchema.additionalProperties
    expect(s.properties.vpc.additionalProperties).toBe(false)
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
