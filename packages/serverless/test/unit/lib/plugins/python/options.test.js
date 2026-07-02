import path from 'path'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import ServerlessPythonRequirements, {
  normalizeToolFlag,
} from '../../../../../lib/plugins/python/index.js'

const SERVICE_PATH = '/srv/myservice'

function createMockServerless(pythonRequirements = {}) {
  return {
    cli: { log: jest.fn() },
    config: { servicePath: SERVICE_PATH },
    service: {
      provider: { runtime: 'python3.12' },
      custom: { pythonRequirements },
      functions: {},
    },
    processedInput: { options: {} },
    configSchemaHandler: {
      defineFunctionProperties: jest.fn(),
      defineCustomProperties: jest.fn(),
    },
  }
}

function makePlugin(pythonRequirements = {}) {
  const sls = createMockServerless(pythonRequirements)
  return new ServerlessPythonRequirements(sls, {})
}

describe('normalizeToolFlag', () => {
  it('maps true to enabled=true, filePath=undefined', () => {
    expect(normalizeToolFlag(true, SERVICE_PATH, 'Pipenv')).toEqual({
      enabled: true,
      filePath: undefined,
    })
  })

  it('maps false to enabled=false, filePath=undefined', () => {
    expect(normalizeToolFlag(false, SERVICE_PATH, 'Pipenv')).toEqual({
      enabled: false,
      filePath: undefined,
    })
  })

  it('maps undefined (falsy) to enabled=false, filePath=undefined', () => {
    expect(normalizeToolFlag(undefined, SERVICE_PATH, 'Pipenv')).toEqual({
      enabled: false,
      filePath: undefined,
    })
  })

  it('maps a relative path to enabled=true and an absolute resolved path', () => {
    const result = normalizeToolFlag('subdir/Pipfile', SERVICE_PATH, 'Pipenv')
    expect(result.enabled).toBe(true)
    expect(result.filePath).toBe(path.resolve(SERVICE_PATH, 'subdir/Pipfile'))
    expect(path.isAbsolute(result.filePath)).toBe(true)
  })

  it('maps an absolute path to enabled=true and the same absolute path', () => {
    const abs = '/absolute/path/to/Pipfile'
    const result = normalizeToolFlag(abs, SERVICE_PATH, 'Pipenv')
    expect(result.enabled).toBe(true)
    expect(result.filePath).toBe(abs)
  })

  it('throws ServerlessError on empty string', () => {
    expect(() => normalizeToolFlag('', SERVICE_PATH, 'Pipenv')).toThrow(
      /must be a boolean or a non-empty path/,
    )
  })

  it('throws ServerlessError on whitespace-only string', () => {
    expect(() => normalizeToolFlag('   ', SERVICE_PATH, 'Pipenv')).toThrow(
      /must be a boolean or a non-empty path/,
    )
  })
})

describe('ServerlessPythonRequirements options getter', () => {
  describe('boolean flags (backward-compat)', () => {
    it('usePipenv:true stays true with no filePath', () => {
      const plugin = makePlugin({ usePipenv: true })
      expect(plugin.options.usePipenv).toBe(true)
      expect(plugin.options.pipenvFilePath).toBeUndefined()
    })

    it('usePipenv:false stays false with no filePath', () => {
      const plugin = makePlugin({ usePipenv: false })
      expect(plugin.options.usePipenv).toBe(false)
      expect(plugin.options.pipenvFilePath).toBeUndefined()
    })

    it('usePoetry:false with no filePath', () => {
      const plugin = makePlugin({ usePoetry: false })
      expect(plugin.options.usePoetry).toBe(false)
      expect(plugin.options.poetryFilePath).toBeUndefined()
    })

    it('useUv:false with no filePath', () => {
      const plugin = makePlugin({ useUv: false })
      expect(plugin.options.useUv).toBe(false)
      expect(plugin.options.uvFilePath).toBeUndefined()
    })
  })

  describe('string path flags', () => {
    it('relative usePoetry path resolves to absolute and enables the flag', () => {
      const plugin = makePlugin({ usePoetry: '../api/pyproject.toml' })
      expect(plugin.options.usePoetry).toBe(true)
      expect(plugin.options.poetryFilePath).toBe(
        path.resolve(SERVICE_PATH, '../api/pyproject.toml'),
      )
      expect(path.isAbsolute(plugin.options.poetryFilePath)).toBe(true)
    })

    it('absolute usePipenv path is used as-is and enables the flag', () => {
      const abs = '/external/Pipfile'
      const plugin = makePlugin({ usePipenv: abs })
      expect(plugin.options.usePipenv).toBe(true)
      expect(plugin.options.pipenvFilePath).toBe(abs)
    })

    it('relative useUv path resolves against servicePath', () => {
      const plugin = makePlugin({ useUv: 'infra/uv.lock' })
      expect(plugin.options.useUv).toBe(true)
      expect(plugin.options.uvFilePath).toBe(
        path.resolve(SERVICE_PATH, 'infra/uv.lock'),
      )
    })

    it('empty string usePoetry throws when options are accessed', () => {
      const plugin = makePlugin({ usePoetry: '' })
      expect(() => plugin.options).toThrow(
        /must be a boolean or a non-empty path/,
      )
    })
  })

  describe('schema registration', () => {
    it('calls defineCustomProperties with pythonRequirements schema', () => {
      const sls = createMockServerless({})
      new ServerlessPythonRequirements(sls, {})
      expect(
        sls.configSchemaHandler.defineCustomProperties,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            pythonRequirements: expect.objectContaining({
              properties: expect.objectContaining({
                usePipenv: expect.objectContaining({
                  type: ['boolean', 'string'],
                }),
                usePoetry: expect.objectContaining({
                  type: ['boolean', 'string'],
                }),
                useUv: expect.objectContaining({ type: ['boolean', 'string'] }),
              }),
            }),
          }),
        }),
      )
    })
  })
})
