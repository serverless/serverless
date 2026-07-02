import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import path from 'path'

jest.unstable_mockModule('@serverless/util', () => ({
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
}))

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    existsSync: jest.fn().mockReturnValue(true),
    statSync: jest.fn().mockReturnValue({ size: 1 }),
    ensureDirSync: jest.fn(),
    copySync: jest.fn(),
    symlink: jest.fn(),
  },
}))

jest.unstable_mockModule('jszip', () => ({
  default: jest.fn().mockImplementation(() => ({
    folder: jest.fn().mockReturnThis(),
  })),
}))

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/zipTree.js',
  () => ({
    addTree: jest.fn().mockResolvedValue(undefined),
    writeZip: jest.fn().mockResolvedValue(undefined),
  }),
)

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/shared.js',
  () => ({
    sha256Path: jest.fn().mockReturnValue('abc123'),
    getRequirementsLayerPath: jest
      .fn()
      .mockImplementation((_, targetZipPath) => targetZipPath),
  }),
)

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/pip.js',
  () => ({
    installAllRequirements: jest.fn().mockResolvedValue(undefined),
    installRequirementsForFile: jest
      .fn()
      .mockResolvedValue('/mock/install/dir'),
  }),
)

const { layerRequirements } =
  await import('../../../../../lib/plugins/python/lib/layer.js')
const { installRequirementsForFile: installRequirementsForFileMock } =
  await import('../../../../../lib/plugins/python/lib/pip.js')
const { ServerlessError } = await import('@serverless/util')

const SERVICE_PATH = '/mock/service'

function makePluginInstance({
  layers = undefined,
  layer = false,
  existingServiceLayers = {},
  runtime = 'python3.13',
  stage = 'dev',
  service = 'svc',
} = {}) {
  return {
    servicePath: SERVICE_PATH,
    options: {
      layer,
      layers,
    },
    serverless: {
      service: {
        service,
        provider: { runtime },
        layers: existingServiceLayers,
      },
      providers: {
        aws: { getStage: jest.fn().mockReturnValue(stage) },
      },
      cli: { log: jest.fn() },
    },
    progress: null,
    log: null,
  }
}

describe('layerRequirements — named layers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    installRequirementsForFileMock.mockResolvedValue('/mock/install/dir')
  })

  it('registers one named layer with defaults when layers has a single entry', async () => {
    const instance = makePluginInstance({
      layers: { pydantic: { requirementsFile: 'r.txt' } },
    })
    await layerRequirements.call(instance)

    expect(instance.serverless.service.layers.pydantic).toBeDefined()
    const layer = instance.serverless.service.layers.pydantic
    expect(layer.package.artifact).toBe(
      path.join('.serverless', 'pythonRequirements-pydantic.zip'),
    )
    expect(layer.name).toBe('svc-dev-pydantic')
    expect(layer.compatibleRuntimes).toEqual(['python3.13'])
    expect(installRequirementsForFileMock).toHaveBeenCalledTimes(1)
    expect(installRequirementsForFileMock).toHaveBeenCalledWith(
      'r.txt',
      'pydantic',
      instance,
    )
  })

  it('forwards user overrides for name, description, compatibleRuntimes, allowedAccounts', async () => {
    const instance = makePluginInstance({
      layers: {
        mylib: {
          requirementsFile: 'reqs/mylib.txt',
          name: 'custom-layer-name',
          description: 'My custom layer',
          compatibleRuntimes: ['python3.12'],
          allowedAccounts: ['123456789012'],
        },
      },
    })
    await layerRequirements.call(instance)

    const layer = instance.serverless.service.layers.mylib
    expect(layer.name).toBe('custom-layer-name')
    expect(layer.description).toBe('My custom layer')
    expect(layer.compatibleRuntimes).toEqual(['python3.12'])
    expect(layer.allowedAccounts).toEqual(['123456789012'])
  })

  it('does nothing when layers is an empty object', async () => {
    const instance = makePluginInstance({ layers: {} })
    await layerRequirements.call(instance)

    expect(installRequirementsForFileMock).not.toHaveBeenCalled()
    expect(instance.serverless.service.layers).toEqual({})
  })

  it('returns early without error when neither layer nor layers is set', async () => {
    const instance = makePluginInstance()
    await layerRequirements.call(instance)

    expect(installRequirementsForFileMock).not.toHaveBeenCalled()
  })

  it('throws PYTHON_REQUIREMENTS_LAYER_NAME_RESERVED before any install for reserved name', async () => {
    const instance = makePluginInstance({
      layers: { pythonRequirements: { requirementsFile: 'r.txt' } },
    })

    await expect(layerRequirements.call(instance)).rejects.toMatchObject({
      code: 'PYTHON_REQUIREMENTS_LAYER_NAME_RESERVED',
    })
    expect(installRequirementsForFileMock).not.toHaveBeenCalled()
  })

  it('throws PYTHON_REQUIREMENTS_LAYER_NAME_COLLISION before any install when name collides', async () => {
    const instance = makePluginInstance({
      layers: { existing: { requirementsFile: 'r.txt' } },
      existingServiceLayers: { existing: {} },
    })

    await expect(layerRequirements.call(instance)).rejects.toMatchObject({
      code: 'PYTHON_REQUIREMENTS_LAYER_NAME_COLLISION',
    })
    expect(installRequirementsForFileMock).not.toHaveBeenCalled()
  })

  it('does not register any layer when mid-loop install fails (INV-8)', async () => {
    installRequirementsForFileMock
      .mockResolvedValueOnce('/mock/install/first')
      .mockRejectedValueOnce(new Error('install failed'))

    const instance = makePluginInstance({
      layers: {
        first: { requirementsFile: 'first.txt' },
        second: { requirementsFile: 'second.txt' },
      },
    })

    await expect(layerRequirements.call(instance)).rejects.toThrow(
      'install failed',
    )
    expect(instance.serverless.service.layers.first).toBeUndefined()
    expect(instance.serverless.service.layers.second).toBeUndefined()
  })

  it('leaves single-layer pythonRequirements intact when named layer install fails', async () => {
    installRequirementsForFileMock.mockRejectedValue(new Error('fail'))

    const fse = (await import('fs-extra')).default
    fse.existsSync.mockReturnValue(true)

    const instance = makePluginInstance({
      layer: {},
      layers: { mylib: { requirementsFile: 'r.txt' } },
      existingServiceLayers: {},
    })

    await expect(layerRequirements.call(instance)).rejects.toThrow('fail')
    expect(instance.serverless.service.layers.pythonRequirements).toBeDefined()
    expect(instance.serverless.service.layers.mylib).toBeUndefined()
  })

  it('registers only pythonRequirements when layer is set and layers is absent', async () => {
    const fse = (await import('fs-extra')).default
    fse.existsSync.mockReturnValue(true)

    const instance = makePluginInstance({
      layer: {},
      layers: undefined,
    })
    await layerRequirements.call(instance)

    expect(instance.serverless.service.layers.pythonRequirements).toBeDefined()
    expect(installRequirementsForFileMock).not.toHaveBeenCalled()
  })
})
