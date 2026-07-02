import path from 'path'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const SERVICE_PATH = '/srv/myservice'

const mockFse = {
  existsSync: jest.fn(),
  statSync: jest.fn(),
  ensureDirSync: jest.fn(),
}

jest.unstable_mockModule('fs-extra', () => ({ default: mockFse }))

const mockSpawn = jest.fn()
jest.unstable_mockModule('child-process-ext/spawn.js', () => ({
  default: mockSpawn,
}))

jest.unstable_mockModule('semver', () => ({
  default: {
    valid: jest.fn().mockReturnValue('0.6.0'),
    gt: jest.fn().mockReturnValue(true),
  },
}))

const { uvToRequirements } =
  await import('../../../../../lib/plugins/python/lib/uv.js')

function makePluginInstance(optionOverrides = {}) {
  return {
    servicePath: SERVICE_PATH,
    options: {
      useUv: true,
      uvOptionalDependencies: [],
      uvWithGroups: [],
      uvWithoutGroups: [],
      uvOnlyGroups: [],
      ...optionOverrides,
    },
    serverless: { cli: { log: jest.fn() } },
    log: null,
    progress: null,
  }
}

describe('uvToRequirements', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFse.ensureDirSync.mockReturnValue(undefined)
    mockSpawn.mockResolvedValue({ stdoutBuffer: Buffer.from('') })
  })

  it('returns early when useUv is false', async () => {
    const plugin = makePluginInstance({ useUv: false })
    await uvToRequirements(plugin)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('returns early when default uv.lock does not exist', async () => {
    mockFse.existsSync.mockReturnValue(false)
    const plugin = makePluginInstance()
    await uvToRequirements(plugin)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('uses servicePath as cwd when no custom uvFilePath', async () => {
    const plugin = makePluginInstance()
    await uvToRequirements(plugin)

    const uvCalls = mockSpawn.mock.calls.filter((c) => c[0] === 'uv')
    expect(uvCalls.length).toBeGreaterThan(0)
    expect(uvCalls[0][2].cwd).toBe(SERVICE_PATH)
  })

  it('uses dirname of uvFilePath as cwd when custom path is set', async () => {
    const uvFilePath = '/external/backend/uv.lock'
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })

    const plugin = makePluginInstance({ uvFilePath })
    await uvToRequirements(plugin)

    // getUvVersion uses servicePath for its --version check; only the export
    // spawn should use the custom lock file's directory.
    const uvExportCalls = mockSpawn.mock.calls.filter(
      (c) => c[0] === 'uv' && c[1][0] === 'export',
    )
    expect(uvExportCalls.length).toBeGreaterThan(0)
    expect(uvExportCalls[0][2].cwd).toBe(path.dirname(uvFilePath))
  })

  it('throws ServerlessError when custom uvFilePath does not exist', async () => {
    const uvFilePath = '/missing/uv.lock'
    mockFse.existsSync.mockImplementation((p) => p !== uvFilePath)

    const plugin = makePluginInstance({ uvFilePath })
    await expect(uvToRequirements(plugin)).rejects.toThrow(
      /does not point to a file/,
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('throws ServerlessError when custom uvFilePath points to a directory', async () => {
    const uvFilePath = '/is/a/directory'
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => false })

    const plugin = makePluginInstance({ uvFilePath })
    await expect(uvToRequirements(plugin)).rejects.toThrow(
      /does not point to a file/,
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})
