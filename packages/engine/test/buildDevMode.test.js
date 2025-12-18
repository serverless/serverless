import { z } from 'zod'
import {
  ConfigContainerDevModeHooksSchema,
  ConfigContainerDevModeSchema,
  ConfigContainerBuildSchema,
} from '../src/types.js'

describe('Container Build and Dev Mode Configuration Schema Validation', () => {
  describe('Dev Mode Hook Configuration', () => {
    test('should accept valid hook type', () => {
      expect(() =>
        ConfigContainerDevModeHooksSchema.parse('onreload'),
      ).not.toThrow()
    })

    test('should reject invalid hook types', () => {
      expect(() => ConfigContainerDevModeHooksSchema.parse('invalid')).toThrow()
      expect(() => ConfigContainerDevModeHooksSchema.parse('reload')).toThrow()
      expect(() =>
        ConfigContainerDevModeHooksSchema.parse('beforereload'),
      ).toThrow()
    })
  })

  describe('Dev Mode Configuration', () => {
    test('should accept valid dev mode configuration', () => {
      const validConfigs = [
        {
          hooks: { onreload: 'npm run build' },
          watchPath: 'src',
          watchExtensions: ['.js', '.jsx'],
          excludeDirectories: ['node_modules', 'dist'],
        },
        {
          hooks: { onreload: './scripts/rebuild.sh' },
        },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigContainerDevModeSchema.parse(config)).not.toThrow()
      })
    })

    test('should reject invalid hook commands', () => {
      const config = {
        hooks: { invalid: 'command' },
      }
      expect(() => ConfigContainerDevModeSchema.parse(config)).toThrow()
    })

    test('should validate watch extensions format', () => {
      const config = {
        watchExtensions: ['js'], // missing dot prefix
      }
      expect(() => ConfigContainerDevModeSchema.parse(config)).toThrow()
    })

    test('should reject unknown properties', () => {
      const config = {
        hooks: { onreload: 'npm run build' },
        unknownProp: 'value',
      }
      expect(() => ConfigContainerDevModeSchema.parse(config)).toThrow(
        /Unrecognized key/,
      )
    })
  })

  describe('Build Configuration', () => {
    test('should accept valid build configuration', () => {
      const validConfigs = [
        {
          args: {
            NODE_ENV: 'production',
            VERSION: '1.0.0',
          },
          dockerFileString: 'FROM node:16\nWORKDIR /app',
          options: '--no-cache --pull',
        },
        {
          args: {
            DEBUG: 'true',
          },
        },
        {
          options: ['--target', 'production'],
        },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigContainerBuildSchema.parse(config)).not.toThrow()
      })
    })

    test('should validate build args are strings', () => {
      const config = {
        args: {
          PORT: 3000, // should be string
        },
      }
      expect(() => ConfigContainerBuildSchema.parse(config)).toThrow()
    })

    test('should accept both string and array options', () => {
      const configs = [
        { options: '--target production' },
        { options: ['--target', 'production'] },
      ]
      configs.forEach((config) => {
        expect(() => ConfigContainerBuildSchema.parse(config)).not.toThrow()
      })
    })

    test('should reject unknown properties', () => {
      const config = {
        unknown: 'property',
      }
      expect(() => ConfigContainerBuildSchema.parse(config)).toThrow(
        /Unrecognized key/,
      )
    })
  })
})
