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

describe('File Resolver - TS module __esModule unwrap', () => {
  // tsx's `tsImport` compiles ESM-default-export TS to CJS-with-__esModule
  // and returns a nested namespace: { default: { __esModule: true, default: X, ...named } }.
  // The resolver unwraps one layer when it sees the `__esModule` marker so
  // the value the rest of the pipeline operates on is the user's intended
  // module shape, not tsx's interop wrapper. Without the unwrap, a
  // selector-less `${file(./mod.ts)}` returned a null-prototype Module
  // Namespace exotic that crashed downstream string interpolation in the
  // resolver manager with `TypeError: Cannot convert object to primitive value`.
  beforeEach(() => {
    mockTsImport.mockReset()
  })

  test('returns the inner default for a selector-less reference to a default-only TS module', async () => {
    // Shape emitted by tsx for: `export default { apiKey: 'k', region: 'r' }`.
    mockTsImport.mockResolvedValue({
      default: {
        __esModule: true,
        default: { apiKey: 'k', region: 'r' },
      },
    })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'secrets.ts',
    })

    expect(result).toEqual({ apiKey: 'k', region: 'r' })
  })

  test('returns a plain object (not a null-prototype namespace) so downstream string interpolation works', async () => {
    mockTsImport.mockResolvedValue({
      default: {
        __esModule: true,
        default: { apiKey: 'k' },
      },
    })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'secrets.ts',
    })

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    // The exact symptom of the regression: `String.replace(/x/, result)`
    // coerces `result` to primitive. A null-prototype namespace threw here.
    expect('x'.replace('x', result)).toBe('[object Object]')
  })

  test('resolves a property selector against a named export under the __esModule wrap', async () => {
    // Shape for: `export const getSecrets = async () => ({...})`.
    const getSecrets = jest.fn().mockResolvedValue({ apiKey: 'from-fn' })
    mockTsImport.mockResolvedValue({
      default: {
        __esModule: true,
        getSecrets,
      },
    })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'secrets.ts#getSecrets',
    })

    expect(result).toEqual({ apiKey: 'from-fn' })
    expect(getSecrets).toHaveBeenCalledTimes(1)
  })

  test('resolves a property selector against the default-export object under the __esModule wrap', async () => {
    // Mixed shape: both `export default {...}` and `export const … = …`.
    mockTsImport.mockResolvedValue({
      default: {
        __esModule: true,
        default: { apiKey: 'k' },
        other: 'unused',
      },
    })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'secrets.ts#apiKey',
    })

    expect(result).toBe('k')
  })

  test('invokes an async default-export function under the __esModule wrap', async () => {
    const ran = jest.fn().mockResolvedValue({ apiKey: 'fn-result' })
    mockTsImport.mockResolvedValue({
      default: {
        __esModule: true,
        default: ran,
      },
    })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'secrets.ts',
    })

    expect(result).toEqual({ apiKey: 'fn-result' })
    expect(ran).toHaveBeenCalledTimes(1)
    const ctx = ran.mock.calls[0][0]
    expect(ctx).toHaveProperty('options')
    expect(typeof ctx.resolveVariable).toBe('function')
    expect(typeof ctx.resolveConfigurationProperty).toBe('function')
  })

  test('does not unwrap when __esModule marker is absent (pre-existing tsx/native shape)', async () => {
    // Mirror of the pre-existing top-level test for default-export objects:
    // returns `module.default` verbatim, no extra layer to peel.
    mockTsImport.mockResolvedValue({
      default: { apiKey: 'k', __esModule: false },
    })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'secrets.ts',
    })

    expect(result).toEqual({ apiKey: 'k', __esModule: false })
  })

  test('does not unwrap when the default export is not an object', async () => {
    // `export default 42` — `__esModule` lookup would short-circuit on a
    // non-object anyway, but assert it explicitly so a future refactor
    // doesn't introduce a NPE here.
    mockTsImport.mockResolvedValue({ default: 42 })

    const result = await buildResolver().resolveVariable({
      resolverType: 'file',
      resolutionDetails: {},
      key: 'secrets.ts',
    })

    expect(result).toBe(42)
  })
})
