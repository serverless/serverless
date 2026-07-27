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

const fseMock = {
  pathExistsSync: jest.fn(),
  statSync: jest.fn(),
  ensureDirSync: jest.fn(),
  existsSync: jest.fn(),
  copySync: jest.fn(),
  utimesSync: jest.fn(),
  removeSync: jest.fn(),
  openSync: jest.fn().mockReturnValue(3),
  closeSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('pydantic==1.0.0\n'),
  writeFileSync: jest.fn(),
}
jest.unstable_mockModule('fs-extra', () => ({ default: fseMock }))

jest.unstable_mockModule('child-process-ext/spawn.js', () => ({
  default: jest.fn().mockResolvedValue({
    stdoutBuffer: Buffer.from(''),
    stderrBuffer: Buffer.from(''),
  }),
}))

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/shared.js',
  () => ({
    sha256Path: jest.fn().mockReturnValue('abc123'),
    getRequirementsWorkingPath: jest
      .fn()
      .mockImplementation((checksum, dir) =>
        path.join(dir, `${checksum}_slspyc`),
      ),
    checkForAndDeleteMaxCacheVersions: jest.fn(),
    getUserCachePath: jest.fn().mockReturnValue('/mock/cache'),
  }),
)

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/poetry.js',
  () => ({
    isPoetryProject: jest.fn().mockReturnValue(false),
    pyprojectTomlToRequirements: jest.fn().mockResolvedValue(undefined),
  }),
)

jest.unstable_mockModule('../../../../../lib/plugins/python/lib/uv.js', () => ({
  getUvVersion: jest.fn().mockResolvedValue('1.0.0'),
  uvToRequirements: jest.fn().mockResolvedValue(undefined),
}))

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/docker.js',
  () => ({
    buildImage: jest.fn(),
    getBindPath: jest.fn(),
    getDockerUid: jest.fn(),
  }),
)

jest.unstable_mockModule(
  '../../../../../lib/plugins/python/lib/slim.js',
  () => ({
    deleteFiles: jest.fn(),
    getStripCommand: jest.fn(),
    getStripMode: jest.fn().mockReturnValue(false),
  }),
)

const { installRequirementsForFile } =
  await import('../../../../../lib/plugins/python/lib/pip.js')
const { ServerlessError } = await import('@serverless/util')

const SERVICE_PATH = '/mock/service'

function makePluginInstance(options = {}) {
  return {
    servicePath: SERVICE_PATH,
    options: {
      slim: false,
      slimPatterns: false,
      zip: false,
      layer: false,
      useStaticCache: true,
      useDownloadCache: false,
      usePoetry: false,
      usePipenv: false,
      useUv: false,
      dockerizePip: false,
      pythonBin: 'python',
      vendor: '',
      noDeploy: [],
      pipCmdExtraArgs: [],
      installer: null,
      ...options,
    },
    serverless: {
      service: { provider: { runtime: 'python3.13' } },
      cli: { log: jest.fn() },
      config: { servicePath: SERVICE_PATH },
    },
    log: null,
    progress: null,
  }
}

describe('installRequirementsForFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fseMock.readFileSync.mockReturnValue('pydantic==1.0.0\n')
    fseMock.writeFileSync.mockImplementation(() => {})
    fseMock.ensureDirSync.mockImplementation(() => {})
    fseMock.copySync.mockImplementation(() => {})
    fseMock.utimesSync.mockImplementation(() => {})
  })

  it('(a) returns the working folder on a cache hit', async () => {
    const reqFile = 'requirements/pydantic.txt'
    const absReqFile = path.resolve(SERVICE_PATH, reqFile)
    const layerDir = path.join(
      SERVICE_PATH,
      '.serverless',
      'pythonRequirements-pydantic',
    )
    const expectedFolder = path.join(layerDir, 'abc123_slspyc')

    fseMock.pathExistsSync.mockReturnValue(true)
    fseMock.statSync.mockImplementation((p) => {
      if (p === absReqFile) return { isFile: () => true }
      return { size: 10, isFile: () => true }
    })
    fseMock.existsSync.mockImplementation((p) => {
      if (p === expectedFolder) return true
      if (p === path.join(expectedFolder, '.completed_requirements'))
        return true
      return true
    })

    const result = await installRequirementsForFile(
      reqFile,
      'pydantic',
      makePluginInstance(),
    )

    expect(result).toBe(expectedFolder)
  })

  it('(b) throws PYTHON_REQUIREMENTS_LAYER_REQUIREMENTS_FILE_INVALID when file does not exist', async () => {
    fseMock.pathExistsSync.mockReturnValue(false)

    await expect(
      installRequirementsForFile(
        'missing.txt',
        'pydantic',
        makePluginInstance(),
      ),
    ).rejects.toMatchObject({
      code: 'PYTHON_REQUIREMENTS_LAYER_REQUIREMENTS_FILE_INVALID',
    })
  })

  it('(c) throws PYTHON_REQUIREMENTS_LAYER_REQUIREMENTS_FILE_INVALID when path is a directory', async () => {
    fseMock.pathExistsSync.mockReturnValue(true)
    fseMock.statSync.mockReturnValue({ isFile: () => false })

    await expect(
      installRequirementsForFile('somedir', 'pydantic', makePluginInstance()),
    ).rejects.toMatchObject({
      code: 'PYTHON_REQUIREMENTS_LAYER_REQUIREMENTS_FILE_INVALID',
    })
  })
})
