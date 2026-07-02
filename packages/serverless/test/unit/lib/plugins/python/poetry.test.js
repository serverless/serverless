import path from 'path'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const SERVICE_PATH = '/srv/myservice'

const mockFse = {
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  ensureDirSync: jest.fn(),
  moveSync: jest.fn(),
  writeFileSync: jest.fn(),
}

jest.unstable_mockModule('fs-extra', () => ({ default: mockFse }))

const mockFsExistsSync = jest.fn()
const mockFsReadFileSync = jest.fn()
jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: mockFsExistsSync,
    readFileSync: mockFsReadFileSync,
  },
}))

const mockSpawn = jest.fn()
jest.unstable_mockModule('child-process-ext/spawn.js', () => ({
  default: mockSpawn,
}))

const mockTomlParse = jest.fn()
jest.unstable_mockModule('@iarna/toml/parse-string.js', () => ({
  default: mockTomlParse,
}))

const { pyprojectTomlToRequirements, isPoetryProject } =
  await import('../../../../../lib/plugins/python/lib/poetry.js')

const POETRY_TOML = {
  'build-system': { requires: ['poetry-core>=1.0.0'] },
}

function makePluginInstance(optionOverrides = {}) {
  return {
    servicePath: SERVICE_PATH,
    options: {
      usePoetry: true,
      poetryWithGroups: [],
      poetryWithoutGroups: [],
      poetryOnlyGroups: [],
      requirePoetryLockFile: false,
      ...optionOverrides,
    },
    serverless: { cli: { log: jest.fn() } },
    log: null,
    progress: null,
  }
}

describe('isPoetryProject', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFse.existsSync.mockReturnValue(false)
    mockFsReadFileSync.mockReturnValue('')
    mockTomlParse.mockReturnValue(POETRY_TOML)
  })

  it('returns false when pyproject.toml does not exist at default location', () => {
    mockFse.existsSync.mockReturnValue(false)
    expect(isPoetryProject('/some/dir')).toBe(false)
  })

  it('returns true when pyproject.toml contains poetry build-system at default location', () => {
    mockFse.existsSync.mockReturnValue(true)
    mockFsReadFileSync.mockReturnValue(Buffer.from(''))
    mockTomlParse.mockReturnValue(POETRY_TOML)
    expect(isPoetryProject('/some/dir')).toBe(true)
  })

  it('returns false when filePath is given but does not exist', () => {
    const filePath = '/external/pyproject.toml'
    mockFse.existsSync.mockImplementation((p) => p !== filePath)
    expect(isPoetryProject('/some/dir', filePath)).toBe(false)
  })

  it('uses provided filePath instead of default pyproject.toml path', () => {
    const filePath = '/external/pyproject.toml'
    mockFse.existsSync.mockImplementation((p) => p === filePath)
    mockFsReadFileSync.mockReturnValue(Buffer.from(''))
    mockTomlParse.mockReturnValue(POETRY_TOML)
    expect(isPoetryProject('/different/dir', filePath)).toBe(true)
    expect(mockFse.existsSync).toHaveBeenCalledWith(filePath)
  })
})

describe('pyprojectTomlToRequirements', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFse.readFileSync.mockReturnValue('')
    mockFse.ensureDirSync.mockReturnValue(undefined)
    mockFse.moveSync.mockReturnValue(undefined)
    mockFsExistsSync.mockReturnValue(false)
    mockFsReadFileSync.mockReturnValue(Buffer.from(''))
    mockTomlParse.mockReturnValue(POETRY_TOML)
    mockSpawn.mockResolvedValue({ stdoutBuffer: Buffer.from('') })
  })

  it('returns early when usePoetry is false', async () => {
    const plugin = makePluginInstance({ usePoetry: false })
    await pyprojectTomlToRequirements('.', plugin)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('returns early when no pyproject.toml at default location', async () => {
    mockFse.existsSync.mockReturnValue(false)
    const plugin = makePluginInstance()
    await pyprojectTomlToRequirements('.', plugin)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('uses dirname of poetryFilePath as cwd when custom path is set', async () => {
    const poetryFilePath = '/external/pyproject.toml'
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFse.readFileSync.mockReturnValue('')
    mockTomlParse.mockReturnValue(POETRY_TOML)

    const plugin = makePluginInstance({ poetryFilePath })
    await pyprojectTomlToRequirements('.', plugin)

    const spawnCalls = mockSpawn.mock.calls.filter((c) => c[0] === 'poetry')
    expect(spawnCalls.length).toBeGreaterThan(0)
    expect(spawnCalls[0][2].cwd).toBe(path.dirname(poetryFilePath))
  })

  it('throws ServerlessError when custom poetryFilePath does not exist', async () => {
    const poetryFilePath = '/missing/pyproject.toml'
    mockFse.existsSync.mockImplementation((p) => p !== poetryFilePath)

    const plugin = makePluginInstance({ poetryFilePath })
    await expect(pyprojectTomlToRequirements('.', plugin)).rejects.toThrow(
      /does not point to a file/,
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('throws ServerlessError when custom poetryFilePath exists but is not a poetry project', async () => {
    const poetryFilePath = '/external/pyproject.toml'
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFsReadFileSync.mockReturnValue(Buffer.from(''))
    mockTomlParse.mockReturnValue({
      'build-system': { requires: ['setuptools'] },
    })

    const plugin = makePluginInstance({ poetryFilePath })
    await expect(pyprojectTomlToRequirements('.', plugin)).rejects.toThrow(
      /not a poetry project/,
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})
