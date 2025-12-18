import { jest } from '@jest/globals'
import { Self } from '../../../src/lib/resolvers/providers/self/self.js'

describe('Self Resolver', () => {
  let mockLogger
  let createSelfResolver

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }

    createSelfResolver = (serviceConfigFile) =>
      new Self({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile,
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
    jest.restoreAllMocks()
  })

  describe('resolveVariable', () => {
    describe('top-level property resolution', () => {
      test('resolves string property', () => {
        const resolver = createSelfResolver({ service: 'my-service' })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'service',
        })

        expect(result).toBe('my-service')
      })

      test('resolves object property', () => {
        const resolver = createSelfResolver({
          provider: { name: 'aws', region: 'us-east-1' },
        })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'provider',
        })

        expect(result).toEqual({ name: 'aws', region: 'us-east-1' })
      })

      test('resolves array property', () => {
        const resolver = createSelfResolver({
          functions: ['func1', 'func2', 'func3'],
        })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'functions',
        })

        expect(result).toEqual(['func1', 'func2', 'func3'])
      })
    })

    describe('nested property resolution', () => {
      test('resolves two-level nested property', () => {
        const resolver = createSelfResolver({
          provider: { region: 'eu-west-1' },
        })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'provider.region',
        })

        expect(result).toBe('eu-west-1')
      })

      test('resolves deeply nested property (4+ levels)', () => {
        const resolver = createSelfResolver({
          custom: {
            config: {
              database: {
                connection: {
                  host: 'localhost',
                },
              },
            },
          },
        })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'custom.config.database.connection.host',
        })

        expect(result).toBe('localhost')
      })
    })

    describe('falsy value handling', () => {
      test('resolves zero (0) correctly', () => {
        const resolver = createSelfResolver({ timeout: 0 })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'timeout',
        })

        expect(result).toBe(0)
      })

      test('resolves false correctly', () => {
        const resolver = createSelfResolver({ enabled: false })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'enabled',
        })

        expect(result).toBe(false)
      })

      test('resolves empty string correctly', () => {
        const resolver = createSelfResolver({ prefix: '' })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'prefix',
        })

        expect(result).toBe('')
      })

      test('resolves null value correctly', () => {
        const resolver = createSelfResolver({ optional: null })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'optional',
        })

        expect(result).toBeNull()
      })
    })

    describe('missing property handling', () => {
      test('returns null for non-existent top-level property', () => {
        const resolver = createSelfResolver({ service: 'test' })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'nonExistent',
        })

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'key nonExistent not found in config',
        )
      })

      test('returns null for non-existent nested property', () => {
        const resolver = createSelfResolver({ provider: { name: 'aws' } })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'provider.missing.deep',
        })

        expect(result).toBeNull()
        expect(mockLogger.debug).toHaveBeenCalled()
      })

      test('returns null when intermediate path is undefined', () => {
        const resolver = createSelfResolver({ service: 'test' })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'custom.some.path',
        })

        expect(result).toBeNull()
      })
    })

    describe('deep cloning behavior', () => {
      test('returns cloned object (not reference)', () => {
        const originalConfig = {
          custom: { key: 'original' },
        }
        const resolver = createSelfResolver(originalConfig)

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'custom',
        })

        // Modify the result
        result.key = 'modified'

        // Original should not be affected
        expect(originalConfig.custom.key).toBe('original')
      })

      test('returns cloned array (not reference)', () => {
        const originalConfig = {
          items: [1, 2, 3],
        }
        const resolver = createSelfResolver(originalConfig)

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: 'items',
        })

        // Modify the result
        result.push(4)

        // Original should not be affected
        expect(originalConfig.items).toEqual([1, 2, 3])
      })
    })

    describe('error handling', () => {
      test('throws error for unsupported resolver type', () => {
        const resolver = createSelfResolver({ service: 'test' })

        expect(() => {
          resolver.resolveVariable({
            resolverType: 'unsupported',
            resolutionDetails: {},
            key: 'service',
          })
        }).toThrow('Resolver unsupported is not supported')
      })
    })

    describe('edge cases', () => {
      test('handles empty key', () => {
        const resolver = createSelfResolver({ service: 'test' })

        const result = resolver.resolveVariable({
          resolverType: 'config',
          resolutionDetails: {},
          key: '',
        })

        // Empty key should return undefined/null
        expect(result).toBeNull()
      })

      test('handles keys with special characters', () => {
        const resolver = createSelfResolver({
          'my-key': 'value-with-dash',
          my_key: 'value_with_underscore',
        })

        expect(
          resolver.resolveVariable({
            resolverType: 'config',
            resolutionDetails: {},
            key: 'my-key',
          }),
        ).toBe('value-with-dash')

        expect(
          resolver.resolveVariable({
            resolverType: 'config',
            resolutionDetails: {},
            key: 'my_key',
          }),
        ).toBe('value_with_underscore')
      })
    })
  })

  describe('static properties', () => {
    test('has correct type', () => {
      expect(Self.type).toBe('self')
    })

    test('has correct resolvers', () => {
      expect(Self.resolvers).toEqual(['config'])
    })

    test('has correct default resolver', () => {
      expect(Self.defaultResolver).toBe('config')
    })
  })
})
