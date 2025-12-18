import { jest } from '@jest/globals'
import { Env } from '../../../src/lib/resolvers/providers/env/env.js'

describe('Env Resolver', () => {
  let mockLogger
  let createEnvResolver
  let originalEnv

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }
    originalEnv = { ...process.env }

    createEnvResolver = () =>
      new Env({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/test',
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: null,
        resolveConfigurationPropertyFunc: null,
        versionFramework: '4.0.0',
      })
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  describe('resolveVariable', () => {
    describe('environment variable resolution', () => {
      test('resolves existing environment variable', () => {
        process.env.TEST_VAR = 'test-value'
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'TEST_VAR',
        })

        expect(result).toBe('test-value')
      })

      test('resolves environment variable with special characters in value', () => {
        process.env.SPECIAL_VAR = 'value-with-special_chars!@#$%'
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'SPECIAL_VAR',
        })

        expect(result).toBe('value-with-special_chars!@#$%')
      })

      test('resolves environment variable with spaces in value', () => {
        process.env.SPACED_VAR = 'value with spaces'
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'SPACED_VAR',
        })

        expect(result).toBe('value with spaces')
      })
    })

    describe('empty value handling', () => {
      test('resolves empty string environment variable', () => {
        process.env.EMPTY_VAR = ''
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'EMPTY_VAR',
        })

        expect(result).toBe('')
      })
    })

    describe('missing variable handling', () => {
      test('returns null for non-existent environment variable', () => {
        delete process.env.NON_EXISTENT_VAR
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'NON_EXISTENT_VAR',
        })

        expect(result).toBeNull()
      })
    })

    describe('empty key behavior', () => {
      test('returns null for empty key', () => {
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: '',
        })

        // extension-runner returns null
        expect(result).toBeNull()
      })
    })

    describe('numeric string values', () => {
      test('resolves numeric string', () => {
        process.env.PORT = '3000'
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'PORT',
        })

        // Environment variables are always strings
        expect(result).toBe('3000')
        expect(typeof result).toBe('string')
      })

      test('resolves zero as string', () => {
        process.env.ZERO_VAR = '0'
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'ZERO_VAR',
        })

        expect(result).toBe('0')
      })
    })

    describe('boolean-like string values', () => {
      test('resolves "true" as string', () => {
        process.env.BOOL_VAR = 'true'
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'BOOL_VAR',
        })

        expect(result).toBe('true')
        expect(typeof result).toBe('string')
      })

      test('resolves "false" as string', () => {
        process.env.BOOL_VAR = 'false'
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'BOOL_VAR',
        })

        expect(result).toBe('false')
        expect(typeof result).toBe('string')
      })
    })

    describe('error handling', () => {
      test('throws error for unsupported resolver type', () => {
        const resolver = createEnvResolver()

        expect(() => {
          resolver.resolveVariable({
            resolverType: 'unsupported',
            resolutionDetails: {},
            key: 'TEST_VAR',
          })
        }).toThrow('Resolver unsupported is not supported')
      })
    })

    describe('common environment variables', () => {
      test('can resolve PATH environment variable', () => {
        const resolver = createEnvResolver()
        // Handle case-sensitivity issues with mocked process.env on Windows
        const pathKey =
          Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ||
          'PATH'

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: pathKey,
        })

        // PATH should exist on all systems
        expect(result).toBeDefined()
        expect(typeof result).toBe('string')
      })

      test('can resolve HOME environment variable', () => {
        const resolver = createEnvResolver()

        const result = resolver.resolveVariable({
          resolverType: 'variables',
          resolutionDetails: {},
          key: 'HOME',
        })

        // HOME should exist on Unix systems
        if (process.env.HOME) {
          expect(result).toBe(process.env.HOME)
        }
      })
    })
  })

  describe('static properties', () => {
    test('has correct type', () => {
      expect(Env.type).toBe('env')
    })

    test('has correct resolvers', () => {
      expect(Env.resolvers).toEqual(['variables'])
    })

    test('has correct default resolver', () => {
      expect(Env.defaultResolver).toBe('variables')
    })
  })
})
