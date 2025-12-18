import { jest } from '@jest/globals'
import { Opt } from '../../../src/lib/resolvers/providers/opt/opt.js'

describe('Opt Resolver', () => {
  let mockLogger
  let createOptResolver

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }

    createOptResolver = (options) =>
      new Opt({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath: '/test',
        options,
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
    describe('string option resolution', () => {
      test('resolves string option', () => {
        const resolver = createOptResolver({ stage: 'production' })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'stage',
        })

        expect(result).toBe('production')
      })

      test('resolves option with dashes in key', () => {
        const resolver = createOptResolver({ 'aws-profile': 'my-profile' })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'aws-profile',
        })

        expect(result).toBe('my-profile')
      })
    })

    describe('boolean option resolution', () => {
      test('resolves true boolean option', () => {
        const resolver = createOptResolver({ verbose: true })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'verbose',
        })

        expect(result).toBe(true)
      })

      test('resolves false boolean option', () => {
        const resolver = createOptResolver({ force: false })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'force',
        })

        expect(result).toBe(false)
      })
    })

    describe('numeric option resolution', () => {
      test('resolves zero', () => {
        const resolver = createOptResolver({ timeout: 0 })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'timeout',
        })

        expect(result).toBe(0)
      })

      test('resolves positive number', () => {
        const resolver = createOptResolver({ concurrency: 10 })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'concurrency',
        })

        expect(result).toBe(10)
      })
    })

    describe('missing option handling', () => {
      test('returns null for non-existent option', () => {
        const resolver = createOptResolver({ stage: 'dev' })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'nonExistent',
        })

        expect(result).toBeNull()
      })

      test('returns null when options is empty', () => {
        const resolver = createOptResolver({})

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'anyKey',
        })

        expect(result).toBeNull()
      })

      test('returns null when options is undefined', () => {
        const resolver = createOptResolver(undefined)

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'anyKey',
        })

        expect(result).toBeNull()
      })
    })

    describe('falsy value handling', () => {
      test('resolves empty string correctly', () => {
        const resolver = createOptResolver({ prefix: '' })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'prefix',
        })

        expect(result).toBe('')
      })

      test('resolves null option correctly', () => {
        const resolver = createOptResolver({ optional: null })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'optional',
        })

        // null coalescing (??) returns null, not default
        expect(result).toBeNull()
      })
    })

    describe('array and object options', () => {
      test('resolves array option', () => {
        const resolver = createOptResolver({
          param: ['key1=value1', 'key2=value2'],
        })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'param',
        })

        expect(result).toEqual(['key1=value1', 'key2=value2'])
      })

      test('resolves object option', () => {
        const resolver = createOptResolver({ config: { nested: 'value' } })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: 'config',
        })

        expect(result).toEqual({ nested: 'value' })
      })
    })

    describe('error handling', () => {
      test('throws error for unsupported resolver type', () => {
        const resolver = createOptResolver({ stage: 'dev' })

        expect(() => {
          resolver.resolveVariable({
            resolverType: 'unsupported',
            resolutionDetails: {},
            key: 'stage',
          })
        }).toThrow('Resolver unsupported is not supported')
      })
    })

    describe('CLI option aliases', () => {
      test('resolves short option alias', () => {
        const resolver = createOptResolver({
          s: 'production',
          stage: 'production',
        })

        expect(
          resolver.resolveVariable({
            resolverType: 'options',
            resolutionDetails: {},
            key: 's',
          }),
        ).toBe('production')

        expect(
          resolver.resolveVariable({
            resolverType: 'options',
            resolutionDetails: {},
            key: 'stage',
          }),
        ).toBe('production')
      })
    })

    describe('empty key behavior', () => {
      test('returns null for empty key', () => {
        const resolver = createOptResolver({ stage: 'dev', verbose: true })

        const result = resolver.resolveVariable({
          resolverType: 'options',
          resolutionDetails: {},
          key: '',
        })

        // extension-runner intentionally returns null
        expect(result).toBeNull()
      })
    })
  })

  describe('static properties', () => {
    test('has correct type', () => {
      expect(Opt.type).toBe('opt')
    })

    test('has correct resolvers', () => {
      expect(Opt.resolvers).toEqual(['options'])
    })

    test('has correct default resolver', () => {
      expect(Opt.defaultResolver).toBe('options')
    })
  })
})
