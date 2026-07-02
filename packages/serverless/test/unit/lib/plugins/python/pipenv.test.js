import path from 'path'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const SERVICE_PATH = '/srv/myservice'

const mockFse = {
  existsSync: jest.fn(),
  statSync: jest.fn(),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
}

jest.unstable_mockModule('fs-extra', () => ({ default: mockFse }))

const mockSpawn = jest.fn()
jest.unstable_mockModule('child-process-ext/spawn.js', () => ({
  default: mockSpawn,
}))

jest.unstable_mockModule('semver', () => ({
  default: {
    valid: jest.fn().mockReturnValue('2023.0.0'),
    gt: jest.fn().mockReturnValue(true),
  },
}))

const { pipfileToRequirements } =
  await import('../../../../../lib/plugins/python/lib/pipenv.js')

function makePluginInstance(optionOverrides = {}) {
  return {
    servicePath: SERVICE_PATH,
    options: {
      usePipenv: true,
      ...optionOverrides,
    },
    serverless: { cli: { log: jest.fn() } },
    log: null,
    progress: null,
  }
}

describe('pipfileToRequirements', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFse.ensureDirSync.mockReturnValue(undefined)
    mockFse.writeFileSync.mockReturnValue(undefined)
    mockSpawn.mockResolvedValue({
      stdoutBuffer: Buffer.from('requests==2.28.0\n'),
    })
  })

  it('returns early when usePipenv is false', async () => {
    const plugin = makePluginInstance({ usePipenv: false })
    await pipfileToRequirements.call(plugin)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('returns early when default Pipfile does not exist', async () => {
    mockFse.existsSync.mockReturnValue(false)
    const plugin = makePluginInstance()
    await pipfileToRequirements.call(plugin)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('uses servicePath as cwd when no custom pipenvFilePath', async () => {
    const plugin = makePluginInstance()
    await pipfileToRequirements.call(plugin)

    const spawnCalls = mockSpawn.mock.calls
    const cwds = spawnCalls.map((call) => call[2]?.cwd)
    expect(cwds.every((cwd) => cwd === SERVICE_PATH)).toBe(true)
  })

  it('uses dirname of pipenvFilePath as cwd when custom path is set', async () => {
    const pipenvFilePath = '/external/backend/Pipfile'
    const plugin = makePluginInstance({ pipenvFilePath })
    await pipfileToRequirements.call(plugin)

    // getPipenvVersion always uses servicePath for its --version check; only the
    // requirements/lock spawns should use the custom Pipfile's directory.
    const cwds = mockSpawn.mock.calls
      .filter((call) => call[0] === 'pipenv' && !call[1].includes('--version'))
      .map((call) => call[2]?.cwd)
    expect(cwds.length).toBeGreaterThan(0)
    expect(cwds.every((cwd) => cwd === path.dirname(pipenvFilePath))).toBe(true)
  })

  it('throws ServerlessError when custom pipenvFilePath does not exist', async () => {
    const pipenvFilePath = '/missing/Pipfile'
    mockFse.existsSync.mockImplementation((p) => p !== pipenvFilePath)
    const plugin = makePluginInstance({ pipenvFilePath })

    await expect(pipfileToRequirements.call(plugin)).rejects.toThrow(
      /does not point to a file/,
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('throws ServerlessError when custom pipenvFilePath points to a directory', async () => {
    const pipenvFilePath = '/is/a/directory'
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => false })
    const plugin = makePluginInstance({ pipenvFilePath })

    await expect(pipfileToRequirements.call(plugin)).rejects.toThrow(
      /does not point to a file/,
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})
