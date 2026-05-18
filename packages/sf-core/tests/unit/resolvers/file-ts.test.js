import { jest } from '@jest/globals'
import path from 'path'
import url from 'url'

// jest cannot resolve tsx's internal `tsx://` URL scheme that `tsImport`
// uses to dispatch the ESM loader hook, so we mock `tsx/esm/api` here and
// hand the resolver pre-fabricated module namespaces — proving the wiring
// from `.ts` extension → loader → module shape handling without depending
// on tsx running inside the jest VM. Real transpilation is covered by the
// manual repro and the integration test fixtures.

const mockTsImport = jest.fn()
jest.unstable_mockModule('tsx/esm/api', () => ({
  tsImport: mockTsImport,
}))

const { File } =
  await import('../../../src/lib/resolvers/providers/file/file.js')

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const fixturesDir = path.join(__dirname, 'fixtures')

const buildResolver = (overrides = {}) =>
  new File({
    logger: { debug: jest.fn() },
    providerConfig: {},
    serviceConfigFile: {},
    configFileDirPath: fixturesDir,
    options: {},
    stage: 'dev',
    dashboard: null,
    composeParams: null,
    resolveVariableFunc: jest.fn(),
    resolveConfigurationPropertyFunc: jest.fn(),
    versionFramework: '4.0.0',
    ...overrides,
  })

describe('File Resolver - TS module resolution', () => {
  beforeEach(() => {
    mockTsImport.mockReset()
  })

  test('routes .ts files through the TS loader with a file:// URL', async () => {
    mockTsImport.mockResolvedValue({ default: { result: 'ts-default' } })
    const resolver = buildResolver()

    const result = await resolver.resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'test-default.ts',
    })

    expect(result).toEqual({ result: 'ts-default' })
    expect(mockTsImport).toHaveBeenCalledTimes(1)
    const [calledUrl, parentUrl] = mockTsImport.mock.calls[0]
    expect(calledUrl).toMatch(/^file:\/\/.*test-default\.ts$/)
    expect(parentUrl).toMatch(/file\.js$/)
  })

  test('routes .mts files through the TS loader', async () => {
    mockTsImport.mockResolvedValue({ default: { result: 'mts' } })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'whatever.mts',
    })

    expect(result).toEqual({ result: 'mts' })
    expect(mockTsImport.mock.calls[0][0]).toMatch(/\.mts$/)
  })

  test('routes .cts files through the TS loader', async () => {
    mockTsImport.mockResolvedValue({ default: { result: 'cts' } })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'whatever.cts',
    })

    expect(result).toEqual({ result: 'cts' })
    expect(mockTsImport.mock.calls[0][0]).toMatch(/\.cts$/)
  })

  test('invokes async default-export function with resolver context', async () => {
    const ran = jest.fn().mockResolvedValue({ result: 'ts-function' })
    mockTsImport.mockResolvedValue({ default: ran })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'test-function.ts',
    })

    expect(result).toEqual({ result: 'ts-function' })
    expect(ran).toHaveBeenCalledTimes(1)
    const ctx = ran.mock.calls[0][0]
    expect(ctx).toHaveProperty('options')
    expect(typeof ctx.resolveVariable).toBe('function')
    expect(typeof ctx.resolveConfigurationProperty).toBe('function')
  })

  test('injects resolveVariable into the TS module function', async () => {
    const resolveVariableFunc = jest.fn().mockResolvedValue('localhost:5432')
    const inner = jest.fn().mockImplementation(async ({ resolveVariable }) => ({
      dbHost: await resolveVariable('env:DB_HOST'),
    }))
    mockTsImport.mockResolvedValue({ default: inner })

    const result = await buildResolver({
      resolveVariableFunc,
    }).resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'test-with-resolve-variable.ts',
    })

    expect(result).toEqual({ dbHost: 'localhost:5432' })
    expect(resolveVariableFunc).toHaveBeenCalledWith('env:DB_HOST')
  })

  test('resolves named property function with #propertyPath', async () => {
    const propertyFn = jest.fn().mockImplementation(async ({ options }) => ({
      result: 'ts-property-function',
      stage: options?.stage || 'default',
    }))
    // ESM-shape: named export sits on the module namespace, no `default`
    mockTsImport.mockResolvedValue({ property: propertyFn })

    const result = await buildResolver({
      options: { stage: 'production' },
    }).resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'test-property-function.ts#property',
    })

    expect(result).toEqual({
      result: 'ts-property-function',
      stage: 'production',
    })
  })

  test('resolves nested property from default-export object', async () => {
    mockTsImport.mockResolvedValue({
      default: { nested: { deep: { value: 'found' } } },
    })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'config.ts#nested.deep.value',
    })

    expect(result).toBe('found')
  })

  test('wraps loader errors with a "Cannot load" message', async () => {
    mockTsImport.mockRejectedValue(new Error('boom'))

    await expect(
      buildResolver().resolveVariable({
        resolverType: 'file',
        resolutionDetails: {},
        key: 'broken.ts',
      }),
    ).rejects.toThrow(/Cannot load TS module .* boom/)
  })

  test('propagates a thrown error from the TS module body with a "Cannot execute" message', async () => {
    mockTsImport.mockResolvedValue({
      default: async () => {
        throw new Error('TS promise rejected intentionally')
      },
    })

    await expect(
      buildResolver().resolveVariable({
        resolverType: 'file',
        resolutionDetails: {},
        key: 'throws.ts',
      }),
    ).rejects.toThrow(/Cannot execute TS module .* TS promise rejected/)
  })

  test('resolves named property function from CJS-shape default export', async () => {
    // tsx may surface CJS-style modules as `{ default: { propertyName: fn } }`.
    // `resolveLoadedModule` falls back from the namespace to the default
    // object — this exercises that branch for the TS path.
    const propertyFn = jest.fn().mockResolvedValue({
      result: 'ts-cjs-shape',
    })
    mockTsImport.mockResolvedValue({ default: { property: propertyFn } })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'cjs-shape.ts#property',
    })

    expect(result).toEqual({ result: 'ts-cjs-shape' })
    expect(propertyFn).toHaveBeenCalledTimes(1)
  })

  test('does not invoke the TS loader for .js files', async () => {
    await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'test-default.js',
    })

    expect(mockTsImport).not.toHaveBeenCalled()
  })
})
