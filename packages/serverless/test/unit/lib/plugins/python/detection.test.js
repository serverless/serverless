import path from 'path'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

const SERVICE_PATH = '/srv/myservice'

// Mock fse before importing the module under test
const mockFse = {
  existsSync: jest.fn(),
  statSync: jest.fn(),
  ensureDirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}

jest.unstable_mockModule('fs-extra', () => ({ default: mockFse }))

const mockIsPoetryProject = jest.fn()
const mockPyprojectTomlToRequirements = jest.fn()

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/poetry.js',
  () => ({
    isPoetryProject: mockIsPoetryProject,
    pyprojectTomlToRequirements: mockPyprojectTomlToRequirements,
  }),
)

jest.unstable_mockModule('../../../../../lib/plugins/python/lib/uv.js', () => ({
  getUvVersion: jest.fn(),
}))

const { generateRequirementsFile, requirementsFileExists } =
  await import('../../../../../lib/plugins/python/lib/pip.js')

const DEFAULT_OPTIONS = {
  usePoetry: true,
  usePipenv: true,
  useUv: true,
  noDeploy: [],
}

function makePluginInstance(optionOverrides = {}) {
  return {
    servicePath: SERVICE_PATH,
    options: { ...DEFAULT_OPTIONS, ...optionOverrides },
    serverless: { cli: { log: jest.fn() } },
    log: null,
  }
}

describe('generateRequirementsFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFse.existsSync.mockReturnValue(false)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFse.readFileSync.mockReturnValue('')
    mockIsPoetryProject.mockReturnValue(false)
    mockPyprojectTomlToRequirements.mockResolvedValue(undefined)
  })

  it('takes poetry branch when isPoetryProject returns true (default path)', () => {
    mockIsPoetryProject.mockReturnValue(true)
    mockFse.existsSync.mockReturnValue(true)
    mockFse.readFileSync.mockReturnValue('')

    const pluginInstance = makePluginInstance()
    const requirementsPath = path.join(SERVICE_PATH, 'requirements.txt')
    const targetFile = path.join(SERVICE_PATH, '.serverless/requirements.txt')

    generateRequirementsFile(requirementsPath, targetFile, pluginInstance)

    expect(mockIsPoetryProject).toHaveBeenCalledWith(SERVICE_PATH)
  })

  it('takes poetry branch when poetryFilePath is set and isPoetryProject returns true', () => {
    const poetryFilePath = '/external/pyproject.toml'
    mockIsPoetryProject.mockReturnValue(true)
    mockFse.existsSync.mockReturnValue(true)
    mockFse.readFileSync.mockReturnValue('')

    const pluginInstance = makePluginInstance({ poetryFilePath })
    const requirementsPath = path.join(SERVICE_PATH, 'requirements.txt')
    const targetFile = path.join(SERVICE_PATH, '.serverless/requirements.txt')

    generateRequirementsFile(requirementsPath, targetFile, pluginInstance)

    expect(mockIsPoetryProject).toHaveBeenCalledWith(
      path.dirname(poetryFilePath),
      poetryFilePath,
    )
  })

  it('takes pipenv branch when pipenvFilePath is set and file is valid', () => {
    const pipenvFilePath = '/external/Pipfile'
    mockIsPoetryProject.mockReturnValue(false)
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFse.readFileSync.mockReturnValue('')

    const pluginInstance = makePluginInstance({
      usePoetry: false,
      pipenvFilePath,
    })
    const requirementsPath = path.join(SERVICE_PATH, 'requirements.txt')
    const targetFile = path.join(SERVICE_PATH, '.serverless/requirements.txt')

    generateRequirementsFile(requirementsPath, targetFile, pluginInstance)

    expect(mockFse.existsSync).toHaveBeenCalledWith(pipenvFilePath)
  })

  it('throws ServerlessError when pipenvFilePath is set but file is missing', () => {
    const pipenvFilePath = '/missing/Pipfile'
    mockFse.existsSync.mockImplementation((p) => p !== pipenvFilePath)
    mockIsPoetryProject.mockReturnValue(false)

    const pluginInstance = makePluginInstance({
      usePoetry: false,
      pipenvFilePath,
    })
    const requirementsPath = path.join(SERVICE_PATH, 'requirements.txt')
    const targetFile = path.join(SERVICE_PATH, '.serverless/requirements.txt')

    expect(() =>
      generateRequirementsFile(requirementsPath, targetFile, pluginInstance),
    ).toThrow(/does not point to a file/)
  })

  it('takes uv branch when uvFilePath is set and file is valid', () => {
    const uvFilePath = '/external/uv.lock'
    mockIsPoetryProject.mockReturnValue(false)
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockFse.readFileSync.mockReturnValue('')

    const pluginInstance = makePluginInstance({
      usePoetry: false,
      usePipenv: false,
      uvFilePath,
    })
    const requirementsPath = path.join(SERVICE_PATH, 'requirements.txt')
    const targetFile = path.join(SERVICE_PATH, '.serverless/requirements.txt')

    generateRequirementsFile(requirementsPath, targetFile, pluginInstance)

    expect(mockFse.existsSync).toHaveBeenCalledWith(uvFilePath)
  })

  it('throws ServerlessError when uvFilePath is set but file is missing', () => {
    const uvFilePath = '/missing/uv.lock'
    mockFse.existsSync.mockImplementation((p) => p !== uvFilePath)
    mockIsPoetryProject.mockReturnValue(false)

    const pluginInstance = makePluginInstance({
      usePoetry: false,
      usePipenv: false,
      uvFilePath,
    })
    const requirementsPath = path.join(SERVICE_PATH, 'requirements.txt')
    const targetFile = path.join(SERVICE_PATH, '.serverless/requirements.txt')

    expect(() =>
      generateRequirementsFile(requirementsPath, targetFile, pluginInstance),
    ).toThrow(/does not point to a file/)
  })

  it('falls through to default when all tools return false', () => {
    mockIsPoetryProject.mockReturnValue(false)
    mockFse.existsSync.mockReturnValue(false)
    mockFse.readFileSync.mockReturnValue('')

    const pluginInstance = makePluginInstance()
    const requirementsPath = path.join(SERVICE_PATH, 'requirements.txt')
    const targetFile = path.join(SERVICE_PATH, '.serverless/requirements.txt')

    generateRequirementsFile(requirementsPath, targetFile, pluginInstance)

    // No assertion beyond "did not throw"
  })
})

describe('requirementsFileExists', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFse.existsSync.mockReturnValue(false)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    mockIsPoetryProject.mockReturnValue(false)
  })

  it('returns true when poetry project detected at default path', () => {
    mockIsPoetryProject.mockReturnValue(true)
    const options = { ...DEFAULT_OPTIONS }
    expect(
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toBe(true)
  })

  it('returns true when poetryFilePath is set and isPoetryProject confirms', () => {
    const poetryFilePath = '/external/pyproject.toml'
    mockIsPoetryProject.mockReturnValue(true)
    const options = { ...DEFAULT_OPTIONS, poetryFilePath }
    expect(
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toBe(true)
    expect(mockIsPoetryProject).toHaveBeenCalledWith(
      path.dirname(poetryFilePath),
      poetryFilePath,
    )
  })

  it('returns true when default Pipfile exists', () => {
    mockFse.existsSync.mockImplementation(
      (p) => p === path.join(SERVICE_PATH, 'Pipfile'),
    )
    const options = { ...DEFAULT_OPTIONS, usePoetry: false }
    expect(
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toBe(true)
  })

  it('returns true when pipenvFilePath is set and file exists', () => {
    const pipenvFilePath = '/external/Pipfile'
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    const options = { ...DEFAULT_OPTIONS, usePoetry: false, pipenvFilePath }
    expect(
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toBe(true)
  })

  it('throws when pipenvFilePath is set but missing', () => {
    const pipenvFilePath = '/missing/Pipfile'
    mockFse.existsSync.mockImplementation((p) => p !== pipenvFilePath)
    const options = {
      ...DEFAULT_OPTIONS,
      usePoetry: false,
      pipenvFilePath,
    }
    expect(() =>
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toThrow(/does not point to a file/)
  })

  it('returns true when uvFilePath is set and file is valid', () => {
    const uvFilePath = '/external/uv.lock'
    mockFse.existsSync.mockReturnValue(true)
    mockFse.statSync.mockReturnValue({ isFile: () => true })
    const options = {
      ...DEFAULT_OPTIONS,
      usePoetry: false,
      usePipenv: false,
      uvFilePath,
    }
    expect(
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toBe(true)
  })

  it('throws when uvFilePath is set but missing', () => {
    const uvFilePath = '/missing/uv.lock'
    mockFse.existsSync.mockImplementation((p) => p !== uvFilePath)
    const options = {
      ...DEFAULT_OPTIONS,
      usePoetry: false,
      usePipenv: false,
      uvFilePath,
    }
    expect(() =>
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toThrow(/does not point to a file/)
  })

  it('returns false when all checks fail and requirements.txt is missing', () => {
    mockFse.existsSync.mockReturnValue(false)
    mockIsPoetryProject.mockReturnValue(false)
    const options = { ...DEFAULT_OPTIONS }
    expect(
      requirementsFileExists(
        SERVICE_PATH,
        options,
        '/srv/myservice/requirements.txt',
      ),
    ).toBe(false)
  })
})
