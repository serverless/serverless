import { jest } from '@jest/globals'
import path from 'path'
import url from 'url'
import { File } from '../../../src/lib/resolvers/providers/file/file.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const fixturesDir = path.join(__dirname, 'fixtures')

describe('File Resolver', () => {
  let mockLogger
  let createFileResolver

  beforeEach(() => {
    mockLogger = { debug: jest.fn() }

    createFileResolver = (configFileDirPath = fixturesDir) =>
      new File({
        logger: mockLogger,
        providerConfig: {},
        serviceConfigFile: {},
        configFileDirPath,
        options: {},
        stage: 'dev',
        dashboard: null,
        composeParams: null,
        resolveVariableFunc: jest.fn(),
        resolveConfigurationPropertyFunc: jest.fn(),
        versionFramework: '4.0.0',
      })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('resolveVariable', () => {
    describe('JSON file resolution', () => {
      test('resolves entire JSON file', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.json',
        })

        expect(result).toEqual({
          result: 'json',
          nested: { deep: { value: 'found' } },
          array: [1, 2, 3],
        })
      })

      test('resolves property from JSON file using # separator', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.json#result',
        })

        expect(result).toBe('json')
      })

      test('resolves nested property from JSON file', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.json#nested.deep.value',
        })

        expect(result).toBe('found')
      })

      test('returns null for non-existent JSON file', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'non-existent.json',
        })

        expect(result).toBeNull()
      })

      test('throws error for invalid JSON', async () => {
        const resolver = createFileResolver()

        await expect(
          resolver.resolveVariable({
            resolverType: 'file',
            resolutionDetails: {},
            key: 'invalid.json',
          }),
        ).rejects.toThrow('Cannot parse JSON')
      })
    })

    describe('YAML file resolution', () => {
      test('resolves entire YAML file', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.yaml',
        })

        expect(result).toEqual({
          result: 'yaml',
          nested: { deep: { value: 'found' } },
          items: ['one', 'two'],
        })
      })

      test('resolves property from YAML file', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.yaml#result',
        })

        expect(result).toBe('yaml')
      })

      test('resolves nested property from YAML file', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.yaml#nested.deep.value',
        })

        expect(result).toBe('found')
      })

      test('throws error for invalid YAML', async () => {
        const resolver = createFileResolver()

        await expect(
          resolver.resolveVariable({
            resolverType: 'file',
            resolutionDetails: {},
            key: 'invalid.yaml',
          }),
        ).rejects.toThrow('Cannot parse YAML')
      })
    })

    describe('JS module resolution', () => {
      test('resolves JS module with default export object', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test-default.js',
        })

        expect(result).toEqual({ result: 'js-default' })
      })

      test('resolves JS module with function export', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test-function.js',
        })

        expect(result).toEqual({ result: 'js-function' })
      })

      test('resolves JS module that uses resolveVariable callback', async () => {
        const mockResolveVariable = jest
          .fn()
          .mockResolvedValue('localhost:5432')

        const resolver = new File({
          logger: mockLogger,
          providerConfig: {},
          serviceConfigFile: {},
          configFileDirPath: fixturesDir,
          options: {},
          stage: 'dev',
          dashboard: null,
          composeParams: null,
          resolveVariableFunc: mockResolveVariable,
          resolveConfigurationPropertyFunc: jest.fn(),
          versionFramework: '4.0.0',
        })

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test-with-resolve-variable.js',
        })

        expect(mockResolveVariable).toHaveBeenCalledWith('env:DB_HOST')
        expect(result).toEqual({ dbHost: 'localhost:5432' })
      })

      test('resolves JS property function resolver', async () => {
        const resolver = new File({
          logger: mockLogger,
          providerConfig: {},
          serviceConfigFile: {},
          configFileDirPath: fixturesDir,
          options: { stage: 'production' },
          stage: 'dev',
          dashboard: null,
          composeParams: null,
          resolveVariableFunc: jest.fn(),
          resolveConfigurationPropertyFunc: jest.fn(),
          versionFramework: '4.0.0',
        })

        // Access the 'property' named export which is a function
        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test-property-function.js#property',
        })

        expect(result).toEqual({
          result: 'js-property-function',
          stage: 'production',
        })
      })

      test('returns null for non-existent JS file', async () => {
        const resolver = createFileResolver()

        await expect(
          resolver.resolveVariable({
            resolverType: 'file',
            resolutionDetails: {},
            key: 'non-existent.js',
          }),
        ).rejects.toThrow('Cannot load or execute JS module')
      })

      test('propagates error from JS file that throws', async () => {
        const resolver = createFileResolver()

        await expect(
          resolver.resolveVariable({
            resolverType: 'file',
            resolutionDetails: {},
            key: 'test-promise-rejected.js',
          }),
        ).rejects.toThrow('Promise rejected intentionally')
      })
    })

    describe('relative path resolution', () => {
      test('resolves file beyond service directory using relative path', async () => {
        // configFileDirPath is fixtures/, so ../parent.yaml should resolve
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: '../parent.yaml',
        })

        expect(result).toEqual({ result: 'parent-yaml' })
      })
    })

    describe('non-standard extension resolution', () => {
      test('resolves file with unknown extension as plain text', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.txt',
        })

        expect(result.trim()).toBe('result: non-standard')
      })
    })

    describe('missing property handling', () => {
      test('returns null for non-existent property path', async () => {
        const resolver = createFileResolver()

        const result = await resolver.resolveVariable({
          resolverType: 'file',
          resolutionDetails: {},
          key: 'test.json#nonExistent.path',
        })

        expect(result).toBeNull()
      })
    })

    describe('error handling', () => {
      test('throws error for unsupported resolver type', () => {
        const resolver = createFileResolver()

        // Note: This throws synchronously before the async part
        expect(() => {
          resolver.resolveVariable({
            resolverType: 'unsupported',
            resolutionDetails: {},
            key: 'test.json',
          })
        }).toThrow('Resolver unsupported is not supported')
      })
    })

    describe('empty key behavior', () => {
      test('throws error for empty key', async () => {
        const resolver = createFileResolver()

        // Empty key resolves to the configFileDirPath itself (a directory)
        await expect(
          resolver.resolveVariable({
            resolverType: 'file',
            resolutionDetails: {},
            key: '',
          }),
        ).rejects.toThrow('Cannot read')
      })
    })
  })

  describe('static properties', () => {
    test('has correct type', () => {
      expect(File.type).toBe('file')
    })

    test('has correct resolvers', () => {
      expect(File.resolvers).toEqual(['file'])
    })

    test('has correct default resolver', () => {
      expect(File.defaultResolver).toBe('file')
    })
  })
})
