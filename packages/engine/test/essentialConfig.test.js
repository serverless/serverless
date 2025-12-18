import { z } from 'zod'
import { ConfigStage, ConfigStages, ConfigEssential } from '../src/types.js'

describe('Essential Configuration Schema Validation', () => {
  describe('ConfigStage', () => {
    test('should accept valid stage names', () => {
      const validStages = ['dev', 'prod', 'staging', 'test-123', 'dev_env']
      validStages.forEach((stage) => {
        expect(() => ConfigStage.parse(stage)).not.toThrow()
      })
    })

    test('should reject stage names that are too short', () => {
      const result = ConfigStage.safeParse('ab')
      expect(result.success).toBe(false)
      expect(result.error.errors[0].message).toBe(
        '"stage" must be at least 3 characters long',
      )
    })

    test('should reject stage names that are too long', () => {
      const result = ConfigStage.safeParse('very-long-stage-name-exceeds-limit')
      expect(result.success).toBe(false)
      expect(result.error.errors[0].message).toBe(
        '"stage" must be at most 16 characters long',
      )
    })

    test('should reject stage names with invalid characters', () => {
      const invalidStages = [
        'dev$',
        'prod@',
        'test space',
        'stage.name',
        'stage/name',
        'stage+name',
      ]
      invalidStages.forEach((stage) => {
        const result = ConfigStage.safeParse(stage)
        expect(result.success).toBe(false)
        expect(result.error.errors[0].message).toBe(
          '"stage" can only contain letters, numbers, hyphens, and underscores',
        )
      })
    })

    test('should reject empty stage names', () => {
      expect(() => ConfigStage.parse('')).toThrow()
    })

    test('should reject non-string values', () => {
      const invalidValues = [123, true, {}, [], null, undefined]
      invalidValues.forEach((value) => {
        expect(() => ConfigStage.parse(value)).toThrow()
      })
    })
  })

  describe('ConfigStages', () => {
    test('should accept valid stages configuration', () => {
      const validConfig = {
        dev: {
          params: { region: 'us-east-1' },
          resolvers: { aws: { profile: 'default' } },
        },
        prod: {
          params: { region: 'us-west-2' },
        },
        'test-env': {
          resolvers: { custom: { key: 'value' } },
        },
      }
      expect(() => ConfigStages.parse(validConfig)).not.toThrow()
    })

    test('should accept empty stages configuration', () => {
      expect(() => ConfigStages.parse(undefined)).not.toThrow()
    })

    test('should accept stages with no params or resolvers', () => {
      const config = {
        dev: {},
        prod: {},
      }
      expect(() => ConfigStages.parse(config)).not.toThrow()
    })

    test('should validate stage names', () => {
      const invalidConfigs = [
        { 'invalid@stage': { params: {} } },
        { 'test.stage': { resolvers: {} } },
        { ab: { params: {} } }, // too short
      ]
      invalidConfigs.forEach((config) => {
        expect(() => ConfigStages.parse(config)).toThrow()
      })
    })

    test('should accept any value type in params', () => {
      const config = {
        dev: {
          params: {
            number: 123,
            string: 'value',
            boolean: true,
            array: [1, 2, 3],
            object: { key: 'value' },
            null: null,
          },
        },
      }
      expect(() => ConfigStages.parse(config)).not.toThrow()
    })

    test('should accept any value type in resolvers', () => {
      const config = {
        dev: {
          resolvers: {
            aws: { profile: 'default', region: 'us-east-1' },
            custom: true,
            count: 42,
            list: ['a', 'b', 'c'],
          },
        },
      }
      expect(() => ConfigStages.parse(config)).not.toThrow()
    })

    // Note: Zod's record validation coerces numeric and boolean keys to strings,
    // so we don't need to explicitly test non-string keys since they're handled correctly.
  })

  describe('ConfigEssential', () => {
    test('should accept valid essential configuration', () => {
      const validConfig = {
        org: 'myorg',
        name: 'myapp',
        frameworkVersion: '1.0.0',
        stages: {
          dev: {
            params: { region: 'us-east-1' },
          },
        },
      }
      expect(() => ConfigEssential.parse(validConfig)).not.toThrow()
    })

    test('should accept minimal valid configuration', () => {
      const minimalConfig = {
        name: 'myapp',
      }
      expect(() => ConfigEssential.parse(minimalConfig)).not.toThrow()
    })

    test('should require name field', () => {
      const configWithoutName = {
        org: 'myorg',
        frameworkVersion: '1.0.0',
      }
      expect(() => ConfigEssential.parse(configWithoutName)).toThrow()
    })

    test('should validate name constraints', () => {
      const invalidConfigs = [
        { name: 'ab' }, // too short
        { name: 'very-long-name-that-exceeds-limit' }, // too long
        { name: 'invalid@name' }, // invalid characters
        { name: 'name.with.dots' },
        { name: 'name with spaces' },
      ]
      invalidConfigs.forEach((config) => {
        expect(() => ConfigEssential.parse(config)).toThrow()
      })
    })

    test('should accept valid org names', () => {
      const validConfigs = [
        { name: 'myapp', org: 'myorg' },
        { name: 'myapp', org: 'org-123' },
        { name: 'myapp', org: 'org_name' },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigEssential.parse(config)).not.toThrow()
      })
    })

    test('should reject invalid org names', () => {
      const invalidConfigs = [
        { name: 'myapp', org: 'org@name' },
        { name: 'myapp', org: 'org.name' },
        { name: 'myapp', org: 'org name' },
      ]
      invalidConfigs.forEach((config) => {
        expect(() => ConfigEssential.parse(config)).toThrow()
      })
    })

    test('should accept any string as frameworkVersion', () => {
      const validConfigs = [
        { name: 'myapp', frameworkVersion: '1.0.0' },
        { name: 'myapp', frameworkVersion: 'latest' },
        { name: 'myapp', frameworkVersion: 'beta-1.0.0' },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigEssential.parse(config)).not.toThrow()
      })
    })

    test('should reject non-string frameworkVersion', () => {
      const invalidConfigs = [
        { name: 'myapp', frameworkVersion: 123 },
        { name: 'myapp', frameworkVersion: true },
        { name: 'myapp', frameworkVersion: { version: '1.0.0' } },
      ]
      invalidConfigs.forEach((config) => {
        expect(() => ConfigEssential.parse(config)).toThrow()
      })
    })

    test('should validate nested stages configuration', () => {
      const configWithInvalidStages = {
        name: 'myapp',
        stages: {
          'invalid@stage': {
            params: {},
          },
        },
      }
      expect(() => ConfigEssential.parse(configWithInvalidStages)).toThrow()
    })
  })
})
